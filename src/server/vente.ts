import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gt, sql, type SQL } from "drizzle-orm";
import type { MOMENTS_CHAT } from "@prompts/lib/schemas";
import { alerteSobre } from "@prompts/lib/titres";
import { RAPPORTS_SEULS } from "@/contenu/offres";
import { jourEnLettres } from "@/lib/format";
import { GENRES_VENDUS, type EvenementDeVente, type GenreVendu, type OffreDuChat } from "@/types";
import { db, schema } from "./db";
import { donneesVerdict } from "./depot";
import { estEquipe } from "./droits";
import { journalErreur } from "./journal";
import { compter, limiteAtteinte, sousLaLimite } from "./limites";
import { montrer } from "./offres-uniques";
import { aUneCarteGardee } from "./paiement/commande";

/*
 * Vendre dans le chat (une proposition du 22 octobre 2026) : sous la réponse de BLUSH, la bonne offre, au bon moment, à
 * la bonne personne, sans être lourd. Le modèle voit le moment (Sortie10.moment, prompts/10-chat.md : il demande à
 * acheter ou un autre rapport, parle d’une autre personne, a du neuf) ; le code choisit l’offre (choisirLaVente, une règle pure), d’après
 * ce qu’il a déjà payé, son solde, son activité, ses « Pas maintenant » et les limites, puis la pose (venteDuChat).
 * Les limites : une proposition spontanée par jour au plus ; rien de spontané pendant 3 jours après un « Pas maintenant »
 * de cette offre ; une autre personne, une fois par prénom (30 jours) ; le rapport à jour, une fois par conv et par mois ;
 * rien de spontané quand il va mal (une réponse en alerte), et rien du tout sur un rapport doux, sauf un ancien rapport
 * doux « danger » qu’il demande à racheter. Ce qu’il demande, et la recharge quand sa réponse attend à zéro bulle, passent
 * toujours. Le test A/B : la moitié des comptes (groupeDeVente) ne voit rien de spontané ; /admin compare les deux moitiés.
 */

type MomentDuChat = (typeof MOMENTS_CHAT)[number];

/** Les deux moitiés du test A/B : avec les propositions spontanées, ou sans (seulement ce qu’il demande, et la recharge à zéro). */
export type GroupeDeVente = "avec" | "sans";

/** Les seuils de la règle. */
export const SEUILS_DE_VENTE = {
  /** Il parle beaucoup : Premium se propose à qui a pris le rapport seul, à partir de ce nombre de messages en 48 h. */
  parleBeaucoup: 15,
  /** Un rapport plus vieux que ça (en jours) se propose à jour quand il envoie du neuf. */
  rapportAncien: 14,
} as const;

const JOUR_S = 86400;
/** Les limites (src/server/limites.ts) : combien de fois, sur quelle fenêtre. */
const LIMITES_DE_VENTE = {
  spontanee: { max: 1, fenetreS: JOUR_S },
  refus: { max: 1, fenetreS: 3 * JOUR_S },
  autre: { max: 1, fenetreS: 30 * JOUR_S },
  aJour: { max: 1, fenetreS: 30 * JOUR_S },
  /* Les gestes d’un compte sur ses cartes (POST /api/chat/vente) : de quoi tout toucher, pas de quoi gonfler /admin */
  gestes: { max: 60, fenetreS: 3600 },
} as const;

/** Ce que la règle sait de la personne et du moment. */
export type SituationDeVente = {
  moment: MomentDuChat;
  /** Le prénom de quelqu’un d’autre dont il parle (pas l’autre personne de cette conv), ou null. */
  prenomAutre: string | null;
  /** Le prénom que le modèle a donné est celui de l’autre personne de cette conv : il parle d’elle (un rapport refait). */
  memePersonne: boolean;
  /** Cette réponse est sortie en alerte (danger, détresse, mineur) : il va mal, rien de spontané. */
  alerte: boolean;
  /** Sa conv est en mode sobre (le rapport doux) : rien ne s’y vend. */
  sobre: boolean;
  /** Un ancien rapport doux « danger » (d’avant le 21 octobre 2026) : seul le réimport se vend, et seulement s’il le demande. */
  dangerSobre: boolean;
  /** Sa réponse s’est écrite verrouillée : il n’avait plus de bulles, elle attend la recharge. */
  verrouillee: boolean;
  /** Il a payé le rapport seul (pas Premium) : Premium pour 5 € de plus (③) peut encore se proposer, une fois. */
  rapportSeul: boolean;
  /** Ses messages à BLUSH sur cette conv ces dernières 48 h, celui-ci compris. */
  messages48h: number;
  /** L’âge du rapport de cette conv, en jours (null : pas de rapport). */
  ageDuRapport: number | null;
  /** Il vient d’envoyer des messages de leur conv (des captures, un export). */
  ajout: boolean;
  /** Une proposition spontanée lui a déjà été faite ces dernières 24 h. */
  spontaneeRecente: boolean;
  /** Les offres refusées (« Pas maintenant ») ces 3 derniers jours. */
  refusees: ReadonlySet<GenreVendu>;
  /** Cette autre personne lui a déjà été proposée ces 30 derniers jours. */
  autreDejaProposee: boolean;
  /** Le rapport à jour de cette conv a déjà été proposé ces 30 derniers jours. */
  aJourRecente: boolean;
  groupe: GroupeDeVente;
};

/** Ce qui se propose : son genre, et si c’est spontané (BLUSH le propose sans qu’il le demande ni en ait besoin). */
export type ChoixDeVente = { genre: GenreVendu; spontanee: boolean };

/**
 * La règle : quelle offre, ou aucune. Dans l’ordre : rien sur un rapport doux (sauf le réimport demandé) ; sa réponse qui
 * attend à zéro bulle, la recharge (ou Premium, à qui a pris le rapport seul) ; ce qu’il demande ; puis, spontanément et
 * dans les limites, l’autre personne dont il parle, le rapport à jour, Premium s’il parle beaucoup. Jamais la recharge
 * spontanée : peu de bulles, le bandeau au-dessus du champ le dit déjà (src/app/app/accueil/BandeauBulles.tsx).
 */
export function choisirLaVente(s: SituationDeVente): ChoixDeVente | null {
  const demande = s.moment === "demande_achat" || s.moment === "demande_rapport";
  if (s.dangerSobre) return demande ? { genre: "reimport", spontanee: false } : null;
  if (s.sobre) return null;
  /* Le besoin : sa réponse attend, verrouillée */
  if (s.verrouillee) return { genre: s.rapportSeul ? "premium" : "bulles", spontanee: false };
  /* Ce qu’il demande, tout de suite, quelles que soient les limites : un autre rapport (une autre conv, ou la sienne refaite) */
  if (s.moment === "demande_rapport") return { genre: s.memePersonne ? "a_jour" : "autre", spontanee: false };
  if (s.moment === "demande_achat") {
    if (s.prenomAutre) return { genre: "autre", spontanee: false };
    return { genre: s.rapportSeul ? "premium" : "bulles", spontanee: false };
  }
  /* Le spontané : jamais quand il va mal, une fois par jour, et pas pour la moitié « sans » du test */
  if (s.alerte || s.spontaneeRecente || s.groupe === "sans") return null;
  const libre = (g: GenreVendu) => !s.refusees.has(g);
  if (s.moment === "autre_personne" && s.prenomAutre && !s.autreDejaProposee && libre("autre")) return { genre: "autre", spontanee: true };
  const duNeuf = s.moment === "nouveau" || s.ajout;
  if (duNeuf && s.ageDuRapport !== null && s.ageDuRapport >= SEUILS_DE_VENTE.rapportAncien && !s.aJourRecente && libre("a_jour")) return { genre: "a_jour", spontanee: true };
  if (s.rapportSeul && s.messages48h >= SEUILS_DE_VENTE.parleBeaucoup && libre("premium")) return { genre: "premium", spontanee: true };
  return null;
}

/** La moitié du test A/B d’un compte, stable : le premier chiffre hexadécimal du md5 de son identifiant, pair ou impair. */
export function groupeDeVente(userId: string): GroupeDeVente {
  return parseInt(createHash("md5").update(userId).digest("hex").slice(0, 1), 16) % 2 === 0 ? "avec" : "sans";
}

/** Le même partage, en SQL (/admin), sur une colonne d’identifiant de compte : vrai pour la moitié « avec ». */
export const dansLaMoitieAvec = (colonne: SQL) => sql`((('x' || substr(md5(${colonne}::text), 1, 1))::bit(4)::int) % 2 = 0)`;

/* Les clés des limites (empreintées par src/server/limites.ts : ni le compte ni un prénom n’y restent en clair) */
const cles = {
  spontanee: (u: string) => `vente:spontanee:${u}`,
  refus: (u: string, g: GenreVendu) => `vente:refus:${u}:${g}`,
  autre: (u: string, prenom: string) => `vente:autre:${u}:${prenom.trim().toLowerCase()}`,
  aJour: (story: string) => `vente:a_jour:${story}`,
  gestes: (u: string) => `vente:gestes:${u}`,
};

/** Le début des clés des compteurs de /admin (counters) : « vente:<événement>:<genre> », par jour de Paris. */
export const VENTE = "vente:";

/** Compte un événement d’une carte du chat aujourd’hui (jour de Paris), pour son genre. Ne fait jamais échouer qui l’appelle. */
async function compterLaVente(evenement: EvenementDeVente, genre: GenreVendu): Promise<void> {
  try {
    await db()
      .insert(schema.counters)
      .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key: `${VENTE}${evenement}:${genre}`, count: 1 })
      .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } });
  } catch (e) {
    journalErreur("compteur de vente non noté", e, { evenement, genre });
  }
}

/**
 * Un geste sur une carte du chat (POST /api/chat/vente) : son bouton touché, compté ; « Pas maintenant », compté, et
 * cette offre ne se repropose plus d’elle-même pendant 3 jours. Faux : trop de gestes pour ce compte, rien n’est noté.
 */
export async function noterLeGeste(userId: string, evenement: "touchee" | "refusee", genre: GenreVendu): Promise<boolean> {
  if (!(await sousLaLimite(cles.gestes(userId), LIMITES_DE_VENTE.gestes))) return false;
  if (evenement === "refusee") await compter(cles.refus(userId, genre), LIMITES_DE_VENTE.refus);
  await compterLaVente(evenement, genre);
  return true;
}

/** Ce que venteDuChat sait de la réponse qui vient de s’écrire. */
export type ReponseVendue = {
  userId: string;
  storyId: string;
  /** Le prénom de l’autre personne de cette conv. */
  prenom: string;
  moment: MomentDuChat;
  /** Sortie10.prenom_autre : quelqu’un d’autre dont il parle. */
  prenomAutre: string | null;
  alerte: boolean;
  verrouillee: boolean;
  /** Son solde une fois la réponse réglée. */
  solde: number;
  /** Il vient d’envoyer des messages de leur conv (des captures, un export). */
  ajout: boolean;
};

/** Le même prénom, à la casse et aux espaces près. */
const memePrenom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ce que la règle doit savoir et qui se lit en base, d’un coup. */
async function lireLaSituation(r: ReponseVendue) {
  const a = schema.achats;
  /* Le prénom de l’autre personne de cette conv n’est pas « quelqu’un d’autre » */
  const memePersonne = !!r.prenomAutre?.trim() && memePrenom(r.prenomAutre!, r.prenom);
  const prenomAutre = r.prenomAutre?.trim() && !memePersonne ? r.prenomAutre.trim() : null;
  const [[compte], payes, [recents], verdict, [rapport], spontaneeRecente, autreDejaProposee, aJourRecente, ...refus] = await Promise.all([
    db().select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, r.userId)),
    db()
      .selectDistinct({ offre: a.offre })
      .from(a)
      .where(and(eq(a.userId, r.userId), eq(a.statut, "paye"))),
    db()
      .select({ n: count() })
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.storyId, r.storyId), eq(schema.chatMessages.role, "toi"), gt(schema.chatMessages.createdAt, sql`now() - interval '48 hours'`))),
    donneesVerdict(r.storyId),
    db().select({ le: schema.reports.createdAt }).from(schema.reports).where(eq(schema.reports.storyId, r.storyId)),
    limiteAtteinte(cles.spontanee(r.userId), LIMITES_DE_VENTE.spontanee),
    prenomAutre ? limiteAtteinte(cles.autre(r.userId, prenomAutre), LIMITES_DE_VENTE.autre) : Promise.resolve(false),
    limiteAtteinte(cles.aJour(r.storyId), LIMITES_DE_VENTE.aJour),
    ...GENRES_VENDUS.map((g) => limiteAtteinte(cles.refus(r.userId, g), LIMITES_DE_VENTE.refus)),
  ]);
  const offres = new Set(payes.map((p) => p.offre));
  const v = verdict?.sortie;
  const situation: SituationDeVente = {
    moment: r.moment,
    prenomAutre,
    memePersonne,
    alerte: r.alerte,
    /* Le mode sobre, comme convEnAlerte (src/server/achats.ts) : un verdict sobre, ou une alerte qui l’est toujours */
    sobre: !!v && (v.mode_sobre || alerteSobre(v.alerte)),
    dangerSobre: !!v?.mode_sobre && v.alerte === "danger",
    verrouillee: r.verrouillee,
    rapportSeul: RAPPORTS_SEULS.some((o) => offres.has(o)) && !offres.has("premium") && !offres.has("premium_ajout"),
    messages48h: Math.max(1, recents?.n ?? 0),
    ageDuRapport: rapport ? Math.floor((Date.now() - rapport.le.getTime()) / (JOUR_S * 1000)) : null,
    ajout: r.ajout,
    spontaneeRecente,
    refusees: new Set(GENRES_VENDUS.filter((_, i) => refus[i])),
    autreDejaProposee,
    aJourRecente,
    groupe: groupeDeVente(r.userId),
  };
  return { situation, email: compte?.email ?? null, rapportLe: rapport?.le ?? null };
}

/**
 * L’offre posée sous la réponse qui vient de s’écrire, ou null. Premium pour 5 € de plus (③) se montre ici comme une
 * offre unique (montrer : une fois par compte, jamais le même jour qu’une autre) ; déjà vue (souvent sur « C’est
 * débloqué »), elle laisse la place à la recharge quand sa réponse attend ou qu’il demande, et à rien sinon. Une offre
 * posée est comptée (« vue »), et ses limites prises. Ne fait jamais échouer la réponse : une erreur, et rien n’est posé.
 */
export async function venteDuChat(r: ReponseVendue): Promise<OffreDuChat | null> {
  try {
    const { situation, email, rapportLe } = await lireLaSituation(r);
    if (!email || estEquipe({ email })) return null;
    let choix = choisirLaVente(situation);
    if (choix?.genre === "premium" && !(await montrer({ id: r.userId, email }, "premium_ajout"))) choix = choix.spontanee ? null : { genre: "bulles", spontanee: false };
    if (!choix) return null;
    const offre = await construire(choix.genre, r, situation, rapportLe);
    await Promise.all([
      choix.spontanee ? compter(cles.spontanee(r.userId), LIMITES_DE_VENTE.spontanee) : null,
      offre.genre === "autre" && offre.prenom ? compter(cles.autre(r.userId, offre.prenom), LIMITES_DE_VENTE.autre) : null,
      offre.genre === "a_jour" ? compter(cles.aJour(r.storyId), LIMITES_DE_VENTE.aJour) : null,
      compterLaVente("vue", offre.genre),
    ]);
    return offre;
  } catch (e) {
    journalErreur("vente du chat non posée", e, { histoire: r.storyId });
    return null;
  }
}

/** L’offre de ce genre, pour l’écran : ce qu’il lui faut, les prix venant du catalogue. */
async function construire(genre: GenreVendu, r: ReponseVendue, s: SituationDeVente, rapportLe: Date | null): Promise<OffreDuChat> {
  switch (genre) {
    case "bulles":
      return { genre, solde: r.solde, enUnGeste: await aUneCarteGardee(r.userId) };
    case "premium":
      return { genre, enUnGeste: await aUneCarteGardee(r.userId) };
    case "autre":
      return { genre, prenom: s.prenomAutre };
    case "a_jour":
      return { genre, prenom: r.prenom, depuis: rapportLe ? jourEnLettres(rapportLe.toISOString()) : null };
    case "reimport":
      return { genre, prenom: r.prenom };
  }
}
