import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, max, ne, or, sql } from "drizzle-orm";
import type { Devinette, Objectif, Pronom } from "@prompts/lib/conv";
import { CASE_IMPORT } from "@/contenu/consentements";
import { CATALOGUE } from "@/contenu/offres";
import { NOM_TOURNAGE_MAX, PRENOM_MAX } from "@/lib/limites";
import { mentionne, renommer } from "@/lib/renommer";
import type { ExportApp } from "@/types";
import type { RefusDuTournage, StatutDuTournage } from "@/types/api";
import type { Utilisateur } from "./auth";
import { crediter } from "./bulles";
import { empreinte, jeton, memeEmpreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { lirePrenomDuTournage, lireTournage } from "./cookies";
import { db, schema, uneLigne } from "./db";
import { GENRES_CHAINE } from "./db/enums";
import { donneesVerdict } from "./depot";
import { relancer, utilisateurCourant } from "./donnees";
import { estEquipe } from "./droits";
import { verdictAffiche } from "./ecrans/rapport";
import { env, estAdmin } from "./env";
import { ErreurInvariant, estBudget } from "./erreurs";
import { voixDisponible } from "./ia/voix";
import { definirQui, histoiresDuCompte, importer, metaDe, personnesDe, supprimerHistoire, UUID, type Meta } from "./histoires";
import type { Consentement } from "./juridique";
import { reparerLaChaine, relancerApres } from "./pipeline";
import { etatDesTaches, planifier } from "./taches";

/*
 * Le mode tournage : les créatrices filment BLUSH sur une conv écrite pour leur campagne, la même pour toutes. Elle est
 * lue une fois par le vrai modèle, dans un compte de l’équipe (une conv comme une autre), puis /admin en fait une conv
 * de tournage : un lien secret (/tournage/<cle>) qui pose le mode tournage sur le téléphone de la créatrice (un cookie,
 * src/server/cookies.ts). Elle filme ensuite le parcours habituel, et rien ne part au modèle :
 * - ses captures ne sont pas lues (le prompt 01) : leur brouillon reprend les participants et les chiffres de la conv
 *   de tournage (brouillonDeTournage) ; l’export ne demande aucun fichier : « Choisir le fichier enregistré » prend la
 *   conv du lien (brouillonDExportDeTournage), avec le prénom de la créatrice (prenomDeLaCreatrice) ;
 * - la lecture (POST /api/analyse) recopie le verdict, le rapport, la mémoire et le vocal déjà écrits (rejouer), et
 *   l’écran de lecture les rejoue en DUREE_RELECTURE_MS (avanceRejouee, src/server/avancement.ts) ;
 * - la chaîne des tâches ne lance plus rien pour cette conv (src/server/pipeline.ts, executer), sauf le vocal d’une prise
 *   qui n’en a pas : celui de la source disait le prénom de sa créatrice (rejouer, renommerLesPrises).
 * Le rapport s’ouvre comme un rapport acheté, avec ses bulles, une fois par conv de tournage et par compte : le chat
 * reste le vrai (une réponse coûte une bulle, et un appel au modèle). Chaque nouvelle prise remplace la précédente de la
 * même conv de tournage dans le compte : « Tes convs » n’en garde qu’une par campagne.
 * L’outil des créatrices prépare aussi ses liens lui-même, par l’API du mode tournage (preparerTournage : un .txt, lu
 * dans le compte COMPTE_DU_TOURNAGE, puis son statut et son lien : etatDuTournage). Et une créatrice dont le lien est
 * arrêté ne déclenche jamais une vraie lecture : elle doit rouvrir le nouveau (lecturePayeeRefusee).
 */

/** Une conv de tournage : son nom (la campagne), et la conv qu’on rejoue. */
export type Tournage = { id: string; nom: string; storyId: string };

/** Les bulles d’une prise, comme celles d’un rapport acheté : une fois par conv de tournage et par compte. */
export const BULLES_DU_TOURNAGE = CATALOGUE.rapport.bulles;

const t = schema.tournages;
const s = schema.stories;

/** Le chemin du lien d’une conv de tournage (sans l’adresse du site : /admin la met devant). */
const cheminDuLien = (cle: string) => `/tournage/${cle}`;

/** La forme d’un secret de lien (un jeton de chiffrement.ts) : ce qui ne l’a pas ne va pas jusqu’à la base. */
const CLE = /^[\w-]{43}$/;

/** La conv de tournage d’un lien (le secret de son cookie), si elle n’est pas arrêtée. */
export async function tournageDeLaCle(cle: string | undefined): Promise<Tournage | null> {
  if (!cle || !CLE.test(cle)) return null;
  const [l] = await db()
    .select({ id: t.id, nom: t.nom, storyId: t.storyId })
    .from(t)
    .where(and(eq(t.cleHash, empreinte(cle)), isNull(t.arreteLe)));
  return l ?? null;
}

/** Le mode tournage de ce navigateur : la conv de tournage de son cookie, si elle n’est pas arrêtée. */
export const tournageDuNavigateur = async () => tournageDeLaCle(await lireTournage());

/**
 * Le repère du mode tournage sur les écrans de l’import (src/components/shell/RepereTournage.tsx) : le nom de la conv
 * de tournage de ce navigateur, pour un compte de BLUSH_ADMINS seulement, qui l’a ouvert pour essayer et ne s’attend pas
 * à voir ses captures ignorées. Jamais pour une créatrice ni pour un visiteur sans compte : elles filment ces écrans.
 * Sans le cookie (presque tout le monde), ni la session ni la base ne sont lues. null : pas de repère.
 */
export async function repereDuTournage(): Promise<string | null> {
  const cle = await lireTournage();
  if (!cle) return null;
  const compte = await utilisateurCourant();
  if (!compte || !estAdmin(compte.email)) return null;
  return (await tournageDeLaCle(cle))?.nom ?? null;
}

/** Une conv de tournage par son id (celle d’un brouillon de tournage), même arrêtée : le brouillon a été fait avant. */
export async function tournageDe(id: string): Promise<Tournage | null> {
  const [l] = await db().select({ id: t.id, nom: t.nom, storyId: t.storyId }).from(t).where(eq(t.id, id));
  return l ?? null;
}

/* ———— La conv qu’on rejoue ———— */

/**
 * Ce qui manque à une conv pour être rejouée : pas lue (pas de verdict fini), une étape encore en route, son rapport
 * pas écrit (pas débloqué), ou sa mémoire pas faite. null : elle est prête.
 */
export type Manque = Exclude<RefusDuTournage, "aucune">;

async function manqueDe(storyId: string): Promise<Manque | null> {
  const [taches, [r], [m]] = await Promise.all([
    db()
      .select({ kind: schema.tasks.kind, status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), inArray(schema.tasks.kind, [...GENRES_CHAINE]))),
    db()
      .select({ data: sql<boolean>`${schema.reports.data} is not null` })
      .from(schema.reports)
      .where(eq(schema.reports.storyId, storyId)),
    db().select({ id: schema.memories.storyId }).from(schema.memories).where(eq(schema.memories.storyId, storyId)),
  ]);
  if (!taches.some((x) => x.kind === "verdict" && x.status === "fini")) return "pas_lue";
  if (taches.some((x) => x.status === "attente" || x.status === "en_cours")) return "en_cours";
  if (!r?.data) return "sans_rapport";
  if (!m) return "sans_memoire";
  return null;
}

/** Une conv du compte de l’équipe, telle que /admin la propose : l’autre, son verdict, et ce qui lui manque. */
export type ConvCandidate = { id: string; autre: string; emoji: string; titre: string; le: string; manque: Manque | null };

/** Les convs lues de ce compte (le compte de l’équipe qui ouvre /admin), les plus récentes d’abord : de quoi créer une conv de tournage. */
export async function convsCandidates(userId: string): Promise<ConvCandidate[]> {
  const lues = (await histoiresDuCompte(userId)).filter((l) => !l.tournageLe).slice(0, 20);
  return Promise.all(
    lues.map(async (l) => {
      const [[v], manque] = await Promise.all([db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, l.id)), manqueDe(l.id)]);
      const verdict = v ? verdictAffiche(coffre.lire("verdicts.data", v.data).sortie) : null;
      return { id: l.id, autre: personnesDe(metaDe(l)).autre.prenom, emoji: verdict?.emoji ?? "", titre: verdict?.title ?? "", le: l.createdAt.toISOString(), manque };
    }),
  );
}

/* ———— /admin ———— */

/** Ce que /admin montre d’une conv de tournage : son lien, sa conv, ses prises. */
export type TournageAffiche = {
  id: string;
  nom: string;
  /** Le chemin du lien à envoyer aux créatrices (cheminDuLien), une fois sa lecture prête ; null avant. */
  lien: string | null;
  /** Sa lecture (préparée par l’API, elle peut être encore en route, ou en échec : `erreur`). */
  statut: StatutDuTournage;
  erreur: string | null;
  autre: string;
  emoji: string;
  titre: string;
  arrete: boolean;
  creeLe: string;
  /** Les comptes qui en gardent une prise (une par compte : chaque prise remplace la précédente). */
  comptes: number;
  /** L’heure de la dernière prise (ISO), ou null. */
  derniere: string | null;
};

/** Les convs de tournage, les plus récentes d’abord, avec leurs prises. */
export async function tournagesAffiches(): Promise<TournageAffiche[]> {
  const lignes = await db()
    .select({ id: t.id, nom: t.nom, cle: t.cle, arreteLe: t.arreteLe, creeLe: t.creeLe, storyId: t.storyId, meta: s.meta, verdict: schema.verdicts.data })
    .from(t)
    .innerJoin(s, eq(s.id, t.storyId))
    .leftJoin(schema.verdicts, eq(schema.verdicts.storyId, t.storyId))
    .orderBy(desc(t.creeLe));
  if (!lignes.length) return [];
  const prises = await db()
    .select({ tournageId: s.tournageId, comptes: count(sql`distinct ${s.userId}`), derniere: max(s.tournageLe) })
    .from(s)
    .where(
      and(
        inArray(
          s.tournageId,
          lignes.map((l) => l.id),
        ),
        isNotNull(s.tournageLe),
      ),
    )
    .groupBy(s.tournageId);
  const statuts = await Promise.all(lignes.map((l) => statutDe(l.storyId)));
  return lignes.map((l, k) => {
    const p = prises.find((x) => x.tournageId === l.id);
    const verdict = l.verdict ? verdictAffiche(coffre.lire("verdicts.data", l.verdict).sortie) : null;
    const { statut, erreur } = statuts[k]!;
    return {
      id: l.id,
      nom: l.nom,
      lien: statut === "pret" ? cheminDuLien(coffre.lire("tournages.cle", l.cle)) : null,
      statut,
      erreur,
      autre: personnesDe(metaDe(l)).autre.prenom,
      emoji: verdict?.emoji ?? "",
      titre: verdict?.title ?? "",
      arrete: !!l.arreteLe,
      creeLe: l.creeLe.toISOString(),
      comptes: p?.comptes ?? 0,
      derniere: p?.derniere ? new Date(p.derniere).toISOString() : null,
    };
  });
}

/* ———— L’API du mode tournage (l’outil des créatrices) ———— */

/**
 * Où en est la lecture de la conv d’une conv de tournage. Prête : rien ne lui manque (manqueDe). En échec pour de bon :
 * une alerte de danger (son rapport doux ne se filme pas), ou une étape du verdict, du rapport ou de la mémoire en échec
 * (hors du budget de l’IA, qui la fait repartir après minuit) ; `erreur` dit laquelle et son code, jamais de contenu.
 * Sinon, elle se lit encore.
 */
async function statutDe(storyId: string): Promise<{ statut: StatutDuTournage; erreur: string | null }> {
  const verdict = await donneesVerdict(storyId);
  if (verdict?.sortie.alerte) return { statut: "echec", erreur: "alerte" };
  if (!(await manqueDe(storyId))) return { statut: "pret", erreur: null };
  const taches = await etatDesTaches(storyId, ["verdict", "rapport_plan", "rapport_chapitres", "memoire"]);
  const echec = Object.values(taches).find((x) => x.status === "echec" && !estBudget(x.error));
  return echec ? { statut: "echec", erreur: `${echec.kind}:${echec.error ?? "inconnue"}` } : { statut: "en_lecture", erreur: null };
}

/** Le compte des convs de tournage préparées par l’API : créé à la première. */
async function compteDuTournage(): Promise<{ id: string }> {
  await db().insert(schema.users).values({ email: COMPTE_DU_TOURNAGE }).onConflictDoNothing();
  return uneLigne(await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, COMPTE_DU_TOURNAGE)), "tournage:compte");
}

/** Un prénom, sans ses accents ni sa casse : celui que l’outil donne retrouve son participant dans le fichier. */
const sansAccent = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Ce que l’outil des créatrices envoie pour préparer un lien : son nom, le .txt de la créatrice (un export WhatsApp,
 * exactement le fichier qu’elle importera), qui elle est dans ce fichier (son prénom) et ses réponses à « Qui es-tu ? »
 * (le rapport s’écrit pour elles). `ref` : sa mission, que la même requête rejouée retrouve sans relire.
 */
export type Preparation = { nom: string; fichier: string; moi: string; pronom: Pronom; devinette: Devinette; objectif: Objectif; ref?: string };

/**
 * Prépare une conv de tournage depuis un .txt : le fichier importé comme un export, rattaché au compte des convs de
 * tournage, son rapport ouvert, « Qui es-tu ? » rempli, puis la vraie lecture lancée après la réponse (le verdict, le
 * rapport, le vocal, la mémoire : quelques minutes). Son lien existe déjà, mais etatDuTournage ne le donne qu’une fois
 * la lecture prête. La même `ref` rend la même conv de tournage (`nouvelle` faux), sans rien relire. Refusée (« qui ») :
 * personne ne porte ce prénom dans le fichier ; un fichier illisible lève son erreur d’import (fichier, groupe, courte).
 */
export async function preparerTournage(p: Preparation): Promise<{ id: string; nouvelle: boolean } | { refus: "qui" }> {
  const deja = p.ref ? await tournageDeLaRef(p.ref) : null;
  if (deja) return { id: deja, nouvelle: false };
  const consentement: Consentement = { version: CASE_IMPORT.version, le: new Date() };
  const imp = await importer({ nom: "WhatsApp Chat.txt", appli: "whatsapp", texte: p.fichier }, consentement);
  const moi = imp.meta.participants.findIndex((x) => sansAccent(x.prenom) === sansAccent(p.moi) || sansAccent(x.nom) === sansAccent(p.moi));
  if (moi !== 0 && moi !== 1) {
    await db().delete(s).where(eq(s.id, imp.id));
    return { refus: "qui" };
  }
  const compte = await compteDuTournage();
  await db().update(s).set({ userId: compte.id, draftToken: null, debloqueLe: new Date(), updatedAt: new Date() }).where(eq(s.id, imp.id));
  await definirQui(imp.id, { moi, pronom: p.pronom, devinette: p.devinette, objectif: p.objectif });
  const cle = jeton();
  const [ligne] = await db()
    .insert(t)
    .values({ nom: p.nom.trim().slice(0, NOM_TOURNAGE_MAX), storyId: imp.id, cle: coffre.ecrire("tournages.cle", cle), cleHash: empreinte(cle), ref: p.ref ?? null })
    .onConflictDoNothing({ target: t.ref })
    .returning({ id: t.id });
  /* La même ref arrivée en même temps : l’autre requête l’a prise, sa conv sert, celle-ci s’efface avant toute lecture */
  if (!ligne) {
    await supprimerHistoire(imp.id);
    const autre = p.ref ? await tournageDeLaRef(p.ref) : null;
    if (!autre) throw new ErreurInvariant("tournages:ref");
    return { id: autre, nouvelle: false };
  }
  await planifier(imp.id, "verdict");
  relancerApres(imp.id);
  return { id: ligne.id, nouvelle: true };
}

/** La conv de tournage déjà préparée pour cette référence (la mission de l’outil des créatrices), ou null. */
export async function tournageDeLaRef(ref: string): Promise<string | null> {
  const [l] = await db().select({ id: t.id }).from(t).where(eq(t.ref, ref));
  return l?.id ?? null;
}

/**
 * La requête vient-elle de l’outil des créatrices ? Sa clé (Authorization: Bearer BLUSH_TOURNAGE_CLE), comparée à temps
 * constant comme le secret du cron. Sans clé configurée, personne.
 */
export function cleDeLApi(req: Request): boolean {
  const cle = env().BLUSH_TOURNAGE_CLE;
  return !!cle && memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${cle}`));
}

/** Ce que l’API dit d’une conv de tournage : sa lecture, et son lien (l’adresse entière) une fois prête et pas arrêtée. */
export type EtatDuTournage = { id: string; nom: string; statut: StatutDuTournage; erreur: string | null; lien: string | null; arrete: boolean };

/**
 * Où en est une conv de tournage (null : aucune de cet id). Pendant sa lecture, ce qui attend ou a été abandonné repart,
 * et ce qui n’a jamais été lancé est planifié (comme quand l’écran de lecture ou le rapport la suivent) : l’outil qui
 * relit le statut fait avancer la chaîne si un relais s’est perdu.
 */
export async function etatDuTournage(id: string): Promise<EtatDuTournage | null> {
  if (!UUID.test(id)) return null;
  const [l] = await db()
    .select({ id: t.id, nom: t.nom, cle: t.cle, arreteLe: t.arreteLe, storyId: t.storyId, userId: s.userId })
    .from(t)
    .innerJoin(s, eq(s.id, t.storyId))
    .where(eq(t.id, id));
  if (!l) return null;
  const { statut, erreur } = await statutDe(l.storyId);
  if (statut === "en_lecture") {
    await relancer(l.storyId);
    await reparerLaChaine({ id: l.storyId, userId: l.userId });
  }
  const lien = statut === "pret" && !l.arreteLe ? new URL(cheminDuLien(coffre.lire("tournages.cle", l.cle)), env().BLUSH_URL).toString() : null;
  return { id: l.id, nom: l.nom, statut, erreur, lien, arrete: !!l.arreteLe };
}

/* ———— Le garde-fou des créatrices ———— */

/** Un compte qui a déjà fait une prise, ou commencé (un brouillon de tournage) : une créatrice. L’équipe n’en est jamais une. */
async function estCreatrice(compte: Pick<Utilisateur, "id" | "email">): Promise<boolean> {
  if (estEquipe(compte)) return false;
  const [l] = await db()
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.userId, compte.id), or(isNotNull(s.tournageId), isNotNull(s.tournageLe))))
    .limit(1);
  return !!l;
}

/**
 * Une vraie lecture (payée par BLUSH : le verdict, ou des captures lues) est-elle refusée, hors du mode tournage ? Oui
 * pour un navigateur qui garde le cookie d’un lien arrêté (ou inconnu), et pour le compte d’une créatrice : elle doit
 * rouvrir le nouveau lien de l’équipe, rien ne part au modèle. À appeler quand aucun mode tournage n’est actif.
 */
export async function lecturePayeeRefusee(compte: Pick<Utilisateur, "id" | "email"> | null): Promise<boolean> {
  if (await lireTournage()) return true;
  return !!compte && (await estCreatrice(compte));
}

/**
 * Fait de cette conv du compte de l’équipe `par` une conv de tournage, sous ce nom : un nouveau lien. Refusée si la conv
 * n’est pas à lui, ou n’est pas prête à rejouer (manqueDe).
 */
export async function creerTournage({ conv, nom, par }: { conv: string; nom: string; par: Pick<Utilisateur, "id"> }): Promise<{ id: string } | { refus: RefusDuTournage }> {
  if (!UUID.test(conv)) return { refus: "aucune" };
  const [l] = await db()
    .select({ id: s.id, tournageLe: s.tournageLe })
    .from(s)
    .where(and(eq(s.id, conv), eq(s.userId, par.id)));
  /* Une prise d’un autre tournage n’en devient pas une : sa lecture n’est pas la sienne */
  if (!l || l.tournageLe) return { refus: "aucune" };
  const manque = await manqueDe(conv);
  if (manque) return { refus: manque };
  const cle = jeton();
  const ligne = uneLigne(
    await db()
      .insert(t)
      .values({ nom: nom.trim().slice(0, NOM_TOURNAGE_MAX), storyId: conv, cle: coffre.ecrire("tournages.cle", cle), cleHash: empreinte(cle), creeParId: par.id })
      .returning({ id: t.id }),
    "tournages:creee",
  );
  return { id: ligne.id };
}

/** Arrête une conv de tournage : son lien ne pose plus le mode tournage. Vrai si elle vient d’être arrêtée. */
export async function arreterTournage(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const arretees = await db()
    .update(t)
    .set({ arreteLe: new Date() })
    .where(and(eq(t.id, id), isNull(t.arreteLe)))
    .returning({ id: t.id });
  return arretees.length > 0;
}

/* ———— La prise ———— */

/**
 * Le brouillon de captures importées en mode tournage, sans les lire : les participants et les chiffres de la conv de
 * tournage, l’utilisateur en « Moi » comme pour toutes les captures (son prénom vient de « Qui es-tu ? »), et pas de
 * conv brute. La lecture (rejouer) le remplira. `secret` : celui du cookie du brouillon (src/server/captures.ts).
 */
export async function brouillonDeTournage(
  tournage: Tournage,
  { appli, captures, secret, consentement }: { appli: Meta["appli"]; captures: number; secret: string; consentement: Consentement },
): Promise<{ id: string; meta: Meta; secret: string; messages: number }> {
  const source = uneLigne(await db().select({ meta: s.meta, messageCount: s.messageCount }).from(s).where(eq(s.id, tournage.storyId)), "tournages:source");
  const { moi, autre } = personnesDe(metaDe(source));
  const meta: Meta = {
    appli,
    format: "captures",
    fichier: `${captures} captures`,
    captures,
    participants: [{ nom: "Moi", prenom: "Moi", messages: moi.messages }, autre],
    resume: metaDe(source).resume,
    moi: 0,
  };
  const ligne = uneLigne(
    await db()
      .insert(s)
      .values({
        draftToken: empreinte(secret),
        messageCount: source.messageCount,
        meta: coffre.ecrire("stories.meta", meta),
        consentementLe: consentement.le,
        consentementVersion: consentement.version,
        tournageId: tournage.id,
      })
      .returning({ id: s.id }),
    "stories:brouillon_de_tournage",
  );
  return { id: ligne.id, meta, secret, messages: source.messageCount };
}

/**
 * Le prénom qu’un lien de tournage porte (`?prenom=`, ajouté par l’outil des créatrices), s’il en est un : des lettres
 * (avec leurs accents), des espaces, des traits d’union et des apostrophes, PRENOM_MAX au plus. Sinon null : rien n’est gardé.
 */
export function prenomDuLien(brut: string | null): string | null {
  const prenom = brut?.trim().replace(/\s+/g, " ") ?? "";
  return prenom.length <= PRENOM_MAX && /^\p{L}[\p{L}\p{M}'’ -]*$/u.test(prenom) ? prenom : null;
}

/** Le prénom que le lien de tournage ouvert sur ce navigateur portait (son cookie), ou null. */
const prenomDuNavigateur = async () => prenomDuLien((await lirePrenomDuTournage()) ?? null);

/**
 * Le prénom de la créatrice qui filme, que l’export sans fichier lui donne à « Qui es-tu ? » : les liens se partagent
 * entre créatrices, et la conv de tournage porte celui de la créatrice dont le fichier a été lu. Celui que son lien porte
 * (`?prenom=`, posé avec le mode tournage), sinon celui de sa dernière prise (son compte, si elle est connectée : elle
 * l’a choisi devant la caméra), sinon null : la conv de tournage garde le sien.
 */
export async function prenomDeLaCreatrice(compte: Pick<Utilisateur, "id"> | null): Promise<string | null> {
  const duLien = await prenomDuNavigateur();
  if (duLien || !compte) return duLien;
  const [derniere] = await db()
    .select({ meta: s.meta })
    .from(s)
    .where(and(eq(s.userId, compte.id), isNotNull(s.tournageLe)))
    .orderBy(desc(s.tournageLe))
    .limit(1);
  const prenom = derniere ? prenomDeMoi(metaDe(derniere)) : null;
  return prenom && prenom !== "Moi" ? prenom : null;
}

/**
 * Le nom d’une conv de tournage tel que la créatrice le lit sur /tournage. Les liens se partagent entre créatrices, et
 * l’outil des créatrices les nomme au prénom de celle dont le fichier a été lu (`source`, « Léa · A1 · Le vu de
 * minuit ») : les autres y lisaient « Léa ». Les morceaux du nom (entre les « · ») qui ne sont que ce prénom tombent ;
 * ailleurs, il devient celui de la créatrice (`prenom`), s’il est connu, sinon le nom ne s’affiche pas (""), plutôt que
 * de montrer le prénom d’une autre.
 */
export function nomPourLaCreatrice(nom: string, source: string | null, prenom: string | null): string {
  if (!source || source === "Moi") return nom;
  const reste = nom
    .split("·")
    .map((m) => m.trim())
    .filter((m) => m && sansAccent(m) !== sansAccent(source))
    .join(" · ");
  if (prenom) return renommer(reste, source, prenom);
  return mentionne(reste, source) ? "" : reste;
}

/**
 * Ce que /tournage montre à la créatrice : le nom de la conv de tournage de ce navigateur, sans le prénom d’une autre
 * (nomPourLaCreatrice), et le sien (prenomDeLaCreatrice : celui de son lien, sinon celui de sa dernière prise). null :
 * pas de mode tournage (pas de lien, ou un lien arrêté).
 */
export async function tournagePourLaCreatrice(): Promise<{ nom: string; prenom: string | null } | null> {
  const tournage = await tournageDuNavigateur();
  if (!tournage) return null;
  const [prenom, [source]] = await Promise.all([utilisateurCourant().then(prenomDeLaCreatrice), db().select({ meta: s.meta }).from(s).where(eq(s.id, tournage.storyId))]);
  return { nom: nomPourLaCreatrice(tournage.nom, source ? prenomDeMoi(metaDe(source)) : null, prenom), prenom };
}

/**
 * Le nom de fichier qu’aurait l’export de cette conv, tel que l’appli le donne : sur iPhone, WhatsApp fait un .zip au nom
 * du contact ; sur Android, un .txt ; Instagram, un .zip au nom du compte (ici le prénom de la créatrice) et du jour.
 */
function nomDExport(appli: ExportApp, { moi, autre }: { moi: string; autre: string }, android: boolean): string {
  if (appli === "instagram") return `instagram-${sansAccent(moi).replace(/[^a-z0-9]+/g, "")}-${new Date().toISOString().slice(0, 10)}.zip`;
  return android ? `Discussion WhatsApp avec ${autre}.txt` : `WhatsApp Chat - ${autre}.zip`;
}

/**
 * Le brouillon d’un export en mode tournage, sans fichier : « Choisir le fichier enregistré » prend la conv du lien
 * (/importer/export, la variante du mode tournage). Le même qu’un export de la conv de tournage, sans rien lire : ses
 * deux personnes (la créatrice sous son prénom, prenomDeLaCreatrice, s’il est connu), ses chiffres, l’appli choisie à
 * l’écran, un nom de fichier de son appli (nomDExport), « Qui es-tu ? » à remplir, et pas de conv brute. Il garde sa conv
 * de tournage (`tournageId`) : la lecture (rejouer) le remplira, même si son lien est arrêté entre-temps.
 */
export async function brouillonDExportDeTournage(
  tournage: Tournage,
  { appli, prenom, android, consentement }: { appli: ExportApp; prenom: string | null; android: boolean; consentement: Consentement },
): Promise<{ id: string; meta: Meta; secret: string }> {
  const source = uneLigne(await db().select({ meta: s.meta, messageCount: s.messageCount }).from(s).where(eq(s.id, tournage.storyId)), "tournages:source");
  const src = metaDe(source);
  /* La créatrice : celle que la conv de tournage dit être l’utilisateur (« Qui es-tu ? » rempli à sa lecture) */
  const k = src.moi ?? 0;
  const l = k === 0 ? 1 : 0;
  const participants: Meta["participants"] = [src.participants[0], src.participants[1]];
  if (prenom) participants[k] = { ...participants[k], nom: prenom, prenom };
  const meta: Meta = {
    appli,
    /* Une conv de tournage faite de captures (depuis /admin) n’a pas de format d’export : celui de l’iPhone */
    format: src.format === "captures" ? "whatsapp-ios" : src.format,
    fichier: nomDExport(appli, { moi: participants[k].prenom, autre: participants[l].nom }, android).slice(0, 200),
    participants,
    resume: src.resume,
    ...(src.coupe ? { coupe: true } : {}),
  };
  const secret = jeton();
  const ligne = uneLigne(
    await db()
      .insert(s)
      .values({
        draftToken: empreinte(secret),
        messageCount: source.messageCount,
        meta: coffre.ecrire("stories.meta", meta),
        consentementLe: consentement.le,
        consentementVersion: consentement.version,
        tournageId: tournage.id,
      })
      .returning({ id: s.id }),
    "stories:export_de_tournage",
  );
  return { id: ligne.id, meta, secret };
}

/**
 * La meta d’une prise : celle de la conv de tournage (les deux personnes, qui est qui, les pronoms, ses chiffres : ce que
 * le rapport a écrit), avec ce que la créatrice a fait devant la caméra : son import (l’appli, des captures ou un export)
 * et le prénom qu’elle s’est donné à « Qui es-tu ? », que le rapport et l’accueil montrent tels qu’elle les a vus.
 */
export function metaDeLaPrise(source: Meta, prise: Meta): Meta {
  const meta: Meta = { ...source, appli: prise.appli, format: prise.format, fichier: prise.fichier };
  if (prise.captures) meta.captures = prise.captures;
  else delete meta.captures;
  const prenom = prise.moi == null ? null : prise.participants[prise.moi].prenom;
  /* Des captures sans prénom donné : « Moi » ne remplace pas un vrai prénom */
  if (source.moi == null || !prenom || prenom === "Moi") return meta;
  const participants: Meta["participants"] = [source.participants[0], source.participants[1]];
  participants[source.moi] = { ...participants[source.moi], prenom };
  return { ...meta, participants };
}

/** Le prénom de celui qui importe (« Qui es-tu ? »), d’après une meta, ou null. */
const prenomDeMoi = (meta: Meta) => (meta.moi == null ? null : (meta.participants[meta.moi]?.prenom ?? null));

/**
 * La lecture d’une prise : tout ce que la conv de tournage a d’écrit est recopié dans cette conv (sa meta et ses
 * chiffres, avec l’import et le prénom de la créatrice : metaDeLaPrise ; le verdict, le rapport, la mémoire, le vocal, et ses tâches
 * telles qu’elles ont fini : la chaîne n’y voit rien à lancer), sa conv brute effacée (celle qu’elle a importée, s’il y
 * en a une), son rapport ouvert. Ce que le modèle a écrit pour la créatrice de la source prend le prénom de celle-ci
 * (renommer : le verdict, le rapport, la mémoire, les chiffres) ; un vocal qui dit l’ancien prénom n’est pas recopié (son
 * audio le prononce : mieux vaut pas de vocal qu’un faux prénom). Sinon, les octets chiffrés passent tels quels : la clé
 * est la même, et rien n’y lie une ligne. Puis ses prises d’avant de la même conv de tournage s’effacent, et ses bulles
 * arrivent (une fois par conv de tournage).
 */
export async function rejouer(storyId: string, tournage: Tournage, utilisateur: Pick<Utilisateur, "id">): Promise<void> {
  const src = tournage.storyId;
  if (await manqueDe(src)) throw new ErreurInvariant("tournage:source_pas_prete");
  /* Le vocal de la source disait l’ancien prénom, et aucune prise d’avant ne l’a refait : la chaîne le refait tout de suite */
  let aRefaire = false;
  await db().transaction(async (tx) => {
    /* Une requête après l’autre : la transaction n’a qu’une connexion */
    const [source] = await tx.select({ meta: s.meta, messageCount: s.messageCount, nextMessage: s.nextMessage, context: s.context }).from(s).where(eq(s.id, src));
    const [prise] = await tx.select({ meta: s.meta }).from(s).where(eq(s.id, storyId));
    const [v] = await tx.select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, src));
    const [r] = await tx.select({ plan: schema.reports.plan, data: schema.reports.data }).from(schema.reports).where(eq(schema.reports.storyId, src));
    const [m] = await tx.select({ data: schema.memories.data }).from(schema.memories).where(eq(schema.memories.storyId, src));
    const [vo] = await tx.select().from(schema.vocals).where(eq(schema.vocals.storyId, src));
    const taches = await tx
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, src), inArray(schema.tasks.kind, [...GENRES_CHAINE]), inArray(schema.tasks.status, ["fini", "echec"])));
    if (!source || !v || !r?.data || !m) throw new ErreurInvariant("tournage:source_pas_prete");
    if (!prise) throw new ErreurInvariant("tournage:prise_introuvable");
    const maintenant = new Date();
    const meta = metaDeLaPrise(metaDe(source), metaDe(prise));
    /* Le prénom de la créatrice de la source, puis celui de cette prise : là où le modèle l’a écrit, il change */
    const ancien = prenomDeMoi(metaDe(source));
    const nouveau = prenomDeMoi(meta);
    const aRenommer = !!ancien && !!nouveau && ancien !== nouveau;
    const recopie = <C extends coffre.Colonne>(colonne: C, octets: Buffer): Buffer =>
      aRenommer ? coffre.ecrire(colonne, renommer(coffre.lire(colonne, octets), ancien, nouveau)) : octets;
    /*
     * Un vocal qui dit l’ancien prénom : son audio le prononcerait, il ne suit pas. Celui de sa prise d’avant de la même
     * conv de tournage, déjà refait à son prénom, le remplace ; sinon la chaîne le refait (sans tâche « vocal » recopiée)
     */
    const vocalDitLAncien = !!vo && aRenommer && mentionne(coffre.lire("vocals.data", vo.data), ancien);
    const [davant] = vocalDitLAncien
      ? await tx
          .select({ vocal: schema.vocals, meta: s.meta })
          .from(schema.vocals)
          .innerJoin(s, eq(s.id, schema.vocals.storyId))
          .where(and(eq(s.userId, utilisateur.id), eq(s.tournageId, tournage.id), ne(s.id, storyId), isNotNull(s.tournageLe)))
          .orderBy(desc(s.tournageLe))
          .limit(1)
      : [];
    const refait = davant && prenomDeMoi(metaDe(davant)) === nouveau && !mentionne(coffre.lire("vocals.data", davant.vocal.data), ancien ?? "") ? davant.vocal : null;
    const vocal = vocalDitLAncien ? refait : vo;
    await tx
      .update(s)
      .set({
        meta: coffre.ecrire("stories.meta", meta),
        messageCount: source.messageCount,
        nextMessage: source.nextMessage,
        context: source.context ? recopie("stories.context", source.context) : source.context,
        conv: null,
        convPurgedAt: maintenant,
        debloqueLe: maintenant,
        tournageId: tournage.id,
        tournageLe: maintenant,
        updatedAt: maintenant,
      })
      .where(eq(s.id, storyId));
    await tx.insert(schema.verdicts).values({ storyId, data: recopie("verdicts.data", v.data) });
    await tx.insert(schema.reports).values({ storyId, plan: r.plan ? recopie("reports.plan", r.plan) : r.plan, data: recopie("reports.data", r.data) });
    await tx.insert(schema.memories).values({ storyId, data: recopie("memories.data", m.data) });
    /*
     * L’heure du vocal et celles des tâches restent les leurs : la chaîne (vocalTente) y lit ce qu’elle lisait chez la
     * source. Sans le vocal (il disait l’ancien prénom), pas de tâche « vocal » non plus : la chaîne le refait
     */
    if (vocal) await tx.insert(schema.vocals).values({ ...vocal, storyId });
    const recopiees = vocal || !vo ? taches : taches.filter((x) => x.kind !== "vocal");
    aRefaire = !!vo && !vocal;
    if (recopiees.length)
      await tx.insert(schema.tasks).values(
        recopiees.map(({ kind, status, attempts, error, progress, detail, createdAt, updatedAt }) => ({
          storyId,
          kind,
          status,
          attempts,
          error,
          progress,
          detail,
          createdAt,
          updatedAt,
        })),
      );
  });
  /* Ses prises d’avant de la même conv de tournage : celle-ci les remplace (« Tes convs » n’en garde qu’une) */
  const avant = await db()
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.userId, utilisateur.id), eq(s.tournageId, tournage.id), ne(s.id, storyId)));
  for (const p of avant) await supprimerHistoire(p.id);
  await crediter(utilisateur.id, BULLES_DU_TOURNAGE, "tournage", `tournage:${tournage.id}:${utilisateur.id}`);
  if (aRefaire && voixDisponible()) {
    await planifier(storyId, "vocal");
    relancerApres(storyId);
  }
}

/**
 * Une prise rejouée avant que rejouer ne renomme (le 16 octobre) : ce que le modèle a écrit pour la créatrice de la
 * source prend le prénom de la sienne (renommer), et son vocal est refait par la chaîne s’il disait l’ancien prénom, ou
 * si rejouer l’avait laissée sans vocal (sa tâche « vocal » recopiée, finie). Vrai si elle a changé ; rien à faire :
 * faux, sans rien écrire.
 */
async function renommerLaPrise(prise: { id: string; userId: string | null; meta: Buffer }, source: { meta: Buffer; vocal: boolean }): Promise<boolean> {
  const ancien = prenomDeMoi(metaDe(source));
  const nouveau = prenomDeMoi(metaDe(prise));
  if (!ancien || !nouveau || ancien === nouveau) return false;
  const { renommee, vocal } = await db().transaction(async (tx) => {
    const id = prise.id;
    const [l] = await tx.select({ context: s.context }).from(s).where(eq(s.id, id));
    const [v] = await tx.select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, id));
    const [r] = await tx.select({ plan: schema.reports.plan, data: schema.reports.data }).from(schema.reports).where(eq(schema.reports.storyId, id));
    const [m] = await tx.select({ data: schema.memories.data }).from(schema.memories).where(eq(schema.memories.storyId, id));
    const [vo] = await tx.select({ data: schema.vocals.data }).from(schema.vocals).where(eq(schema.vocals.storyId, id));
    const [tv] = await tx
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "vocal")));
    /* Une colonne qui dit encore l’ancien prénom, renommée ; null : rien à changer */
    const nomme = <C extends coffre.Colonne>(colonne: C, octets: Buffer | null | undefined): Buffer | null => {
      if (!octets) return null;
      const lu = coffre.lire(colonne, octets);
      return mentionne(lu, ancien) ? coffre.ecrire(colonne, renommer(lu, ancien, nouveau)) : null;
    };
    const [context, verdict, plan, rapport, memoire] = [
      nomme("stories.context", l?.context),
      nomme("verdicts.data", v?.data),
      nomme("reports.plan", r?.plan),
      nomme("reports.data", r?.data),
      nomme("memories.data", m?.data),
    ];
    if (context) await tx.update(s).set({ context }).where(eq(s.id, id));
    if (verdict) await tx.update(schema.verdicts).set({ data: verdict }).where(eq(schema.verdicts.storyId, id));
    if (plan || rapport)
      await tx
        .update(schema.reports)
        .set({ ...(plan && { plan }), ...(rapport && { data: rapport }) })
        .where(eq(schema.reports.storyId, id));
    if (memoire) await tx.update(schema.memories).set({ data: memoire }).where(eq(schema.memories.storyId, id));
    const aRefaire = voixDisponible() && (vo ? mentionne(coffre.lire("vocals.data", vo.data), ancien) : source.vocal && tv?.status === "fini");
    if (aRefaire) {
      await tx.delete(schema.vocals).where(eq(schema.vocals.storyId, id));
      await tx.delete(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "vocal")));
    }
    return { renommee: !!(context || verdict || plan || rapport || memoire), vocal: aRefaire };
  });
  /* La chaîne planifie le vocal qui manque (vocalAFaire, src/server/chaine.ts), et le lance après la réponse */
  if (vocal) await reparerLaChaine({ id: prise.id, userId: prise.userId });
  return renommee || vocal;
}

/* Les prises que ce processus a déjà vues sans rien à y faire : le passage suivant ne les relit pas */
const prisesVues = new Set<string>();

/**
 * Les prises à renommer (renommerLaPrise), à chaque passage des 5 minutes (GET /api/cron/relances) : les prises d’avant
 * le 16 octobre le sont au premier, sans que la créatrice refasse son import. Le nombre de prises changées.
 */
export async function renommerLesPrises(): Promise<number> {
  const prises = (
    await db().select({ id: s.id, userId: s.userId, meta: s.meta, source: t.storyId }).from(s).innerJoin(t, eq(t.id, s.tournageId)).where(isNotNull(s.tournageLe))
  ).filter((p) => !prisesVues.has(p.id));
  if (!prises.length) return 0;
  const sources = await db()
    .select({ id: s.id, meta: s.meta, vocal: schema.vocals.storyId })
    .from(s)
    .leftJoin(schema.vocals, eq(schema.vocals.storyId, s.id))
    .where(inArray(s.id, [...new Set(prises.map((p) => p.source))]));
  const parId = new Map(sources.map((x) => [x.id, { meta: x.meta, vocal: !!x.vocal }]));
  let changees = 0;
  for (const p of prises) {
    const source = parId.get(p.source);
    if (source && (await renommerLaPrise(p, source))) changees++;
    else prisesVues.add(p.id);
  }
  return changees;
}
