import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, max, ne, or, sql } from "drizzle-orm";
import type { Devinette, Objectif, Pronom } from "@prompts/lib/conv";
import { CASE_IMPORT } from "@/contenu/consentements";
import { CATALOGUE } from "@/contenu/offres";
import { NOM_TOURNAGE_MAX } from "@/lib/limites";
import type { RefusDuTournage, StatutDuTournage } from "@/types/api";
import type { Utilisateur } from "./auth";
import { crediter } from "./bulles";
import { empreinte, jeton, memeEmpreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { lireTournage } from "./cookies";
import { db, schema, uneLigne } from "./db";
import { GENRES_CHAINE } from "./db/enums";
import { donneesVerdict } from "./depot";
import { relancer } from "./donnees";
import { estEquipe } from "./droits";
import { verdictAffiche } from "./ecrans/rapport";
import { env } from "./env";
import { ErreurInvariant, estBudget } from "./erreurs";
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
 *   de tournage (brouillonDeTournage) ; un export se lit comme d’habitude, sans modèle ;
 * - la lecture (POST /api/analyse) recopie le verdict, le rapport, la mémoire et le vocal déjà écrits (rejouer), et
 *   l’écran de lecture les rejoue en DUREE_RELECTURE_MS (avanceRejouee, src/server/avancement.ts) ;
 * - la chaîne des tâches ne lance plus rien pour cette conv (src/server/pipeline.ts, executer).
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

/**
 * La lecture d’une prise : tout ce que la conv de tournage a d’écrit est recopié dans cette conv (sa meta et ses
 * chiffres, avec l’import et le prénom de la créatrice : metaDeLaPrise ; le verdict, le rapport, la mémoire, le vocal, et ses tâches
 * telles qu’elles ont fini : la chaîne n’y voit rien à lancer), sa conv brute effacée (celle qu’elle a importée, s’il y
 * en a une), son rapport ouvert. Les autres octets chiffrés passent tels quels : la clé est la même, et rien n’y lie une
 * ligne. Puis ses prises d’avant de la même conv de tournage s’effacent, et ses bulles arrivent (une fois par conv de
 * tournage).
 */
export async function rejouer(storyId: string, tournage: Tournage, utilisateur: Pick<Utilisateur, "id">): Promise<void> {
  const src = tournage.storyId;
  if (await manqueDe(src)) throw new ErreurInvariant("tournage:source_pas_prete");
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
    await tx
      .update(s)
      .set({
        meta: coffre.ecrire("stories.meta", metaDeLaPrise(metaDe(source), metaDe(prise))),
        messageCount: source.messageCount,
        nextMessage: source.nextMessage,
        context: source.context,
        conv: null,
        convPurgedAt: maintenant,
        debloqueLe: maintenant,
        tournageId: tournage.id,
        tournageLe: maintenant,
        updatedAt: maintenant,
      })
      .where(eq(s.id, storyId));
    await tx.insert(schema.verdicts).values({ storyId, data: v.data });
    await tx.insert(schema.reports).values({ storyId, plan: r.plan, data: r.data });
    await tx.insert(schema.memories).values({ storyId, data: m.data });
    /* L’heure du vocal et celles des tâches restent les leurs : la chaîne (vocalTente) y lit ce qu’elle lisait chez la source */
    if (vo) await tx.insert(schema.vocals).values({ ...vo, storyId });
    if (taches.length)
      await tx.insert(schema.tasks).values(
        taches.map(({ kind, status, attempts, error, progress, detail, createdAt, updatedAt }) => ({
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
}
