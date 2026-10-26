import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { Maj07, type Maj } from "@prompts/lib/schemas";
import { payeurDe, payeurDuCompte, type Payeur, type Reserve } from "./budget";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { donneesMemoire } from "./depot";
import { memoireEnLot } from "./env";
import { ErreurTache, estBudget } from "./erreurs";
import type { EtatDuLot, IssueDuLot, Presse } from "./ia/claude";
import { auMieux, journal, journalErreur } from "./journal";
import { passerLaMain } from "./relais";
import { aRelancer, autreEnCours, entreeDe, ESSAIS_MAX, finir, sansLotEnVol, type Tache } from "./taches";

/*
 * La mise à jour de la mémoire, en différé. Celle qui part au calme (src/server/memoire-groupee.ts : 10 minutes sans
 * échange), personne ne l’attend : la personne est partie, le chat relit ses derniers échanges, et sa fiche la rapatrie
 * quand elle s’ouvre. Avec BLUSH_MEMOIRE_EN_LOT, le passage des 5 minutes (GET /api/cron/relances) l’envoie donc en lot au
 * prestataire (l’API Message Batches, src/server/ia/claude.ts : la même requête qu’en direct, deux fois moins chère), puis
 * relève les lots à chaque passage :
 *   - fini : la réponse s’applique à la mémoire gardée à l’envoi (tasks.lot_avant), ou à elle et aux alertes que le chat
 *     a notées depuis (majDuLot, src/server/analyse.ts) ; la tâche finit ;
 *   - un refus (le repli du prestataire n’existe pas en lot), une erreur, une expiration, une annulation, une sortie
 *     illisible, des preuves introuvables, la mémoire changée autrement, pas de réponse pour elle : la mise à jour repart
 *     en direct (versLeDirect) ;
 *   - toujours en cours au bout de LOT_AU_PLUS_S, ou illisible passé ce délai (le prestataire qui ne répond plus pour
 *     lui) : le lot est annulé, la mise à jour part en direct.
 * Puis le lot est effacé chez le prestataire, sa réponse avec : elle n’y reste pas 29 jours. Le coût de ses réponses n’est
 * noté qu’une fois (lots.traite_le), même si l’effacement rate et se retente. Une tâche en lot (statut `lot`) ne repart
 * pas en direct d’elle-même, et aucune autre mise à jour de la conv ne part avant elle (sansLotEnVol, src/server/taches.ts) :
 * la même mise à jour n’est jamais payée deux fois, sauf une annulation arrivée trop tard (un lot déjà en cours de
 * traitement finit quand même : sa réponse, facturée, est notée puis ignorée). Une tâche en lot qui a perdu son lot (sa
 * ligne de `lots` disparue en route) part en direct au passage suivant (sansLeurLot) : rien ne reste en lot pour toujours.
 * Ce qui ne peut pas attendre la rapatrie (rapatrier) : sa fiche ouverte pour de bon, un niveau atteint, un ajout, et le
 * ECHANGES_PAR_MAJ-ième échange depuis le lot (le fil du chat ne relit que les 6 derniers). Une alerte du chat, elle, n’a
 * rien à rapatrier : elle est notée tout de suite dans la mémoire (noterLAlerte, src/server/chat.ts), le lot ne la voit
 * pas, ne peut pas l’effacer, et sa réponse s’applique par-dessus (src/server/memoire-relue.ts).
 * Le ménage (menage) retrouve chez le prestataire un lot à nous que la base ne connaît pas (l’instance coupée juste après
 * l’envoi, une connexion coupée pendant l’envoi, sa ligne qui n’a pas pu s’écrire) : gardé sans tâche, il est relevé (son
 * coût noté) et effacé comme les autres, au lieu de rester 29 jours chez le prestataire.
 */

/** Au-delà, un lot qui tourne encore est annulé et sa mise à jour part en direct : la plupart finissent en quelques minutes. */
export const LOT_AU_PLUS_S = 3600;
/** Une tâche encore en lot passé ce temps (le passage des 5 minutes ne tourne plus) : le tableau de bord la compte « bloquée ». */
export const LOT_BLOQUE_S = LOT_AU_PLUS_S + 600;
/** Un lot dont la tâche n’y est pas (ou plus) est annulé passé ce temps : l’envoi garde le lot avant d’y mettre sa tâche. */
const GRACE_S = 120;
/** Ses réponses en cours de lecture depuis plus que ça : la lecture a été coupée, un passage suivant la reprend. */
const LECTURE_COUPEE_S = 600;
/** Ce que le passage des 5 minutes envoie en lot au plus. */
const ENVOIS_PAR_PASSAGE = 20;
/**
 * Le temps que le passage des 5 minutes donne aux lots : au-delà, il ne relève ni n’envoie plus rien, le reste attend le
 * passage suivant (un prestataire lent ne retient pas la fonction ; le filet des chaînes, lui, ne les attend pas).
 */
const PASSAGE_MS = 60_000;
/** Ce que le ménage regarde chez le prestataire : les lots créés depuis 48 h (un lot finit en 24 h au plus). */
const MENAGE_S = 48 * 3600;
/**
 * Ce que coûtera un lot en vol, en millionièmes de dollar (environ 0,07 $ en moyenne, à moitié prix) : compté d’avance
 * dans le budget du jour, avec de la marge, tant que sa réponse n’est pas lue (son coût n’est noté qu’à ce moment-là).
 */
const RESERVE_PAR_LOT = 100_000;
/** L’étiquette de leur coût au suivi (ai_usage.task) : le poste « Mémoire (en lot) » de /admin. */
const ETIQUETTE = "memoire_maj_lot";
/** Le code d’un envoi raté pour une raison passagère, une première fois : la seconde, la mise à jour part en direct. */
const REPORTE = "lot:reporte";
/** Sur le chemin d’une requête (sa fiche, le chat) : des appels courts au prestataire, le direct sans sa réponse. */
const COURT: Presse = { court: true };

const claude = () => import("./ia/claude");
const analyse = () => import("./analyse");

const t = schema.tasks;
const lots = schema.lots;

/* ———— Le fil du chat ———— */

/**
 * Les échanges du fil que la mémoire n’a pas encore à cause d’un lot en vol : le premier de sa mise à jour (celui qui a
 * ouvert sa tâche), et tous ceux d’après, retenus ou non (un échange sans neuf ne se retient pas, mais le fil le relit et
 * il en pousse un plus ancien). 0 sans lot en vol.
 */
export async function echangesDepuisLeLot(storyId: string): Promise<number> {
  const [l] = await db()
    .select({
      /* Écrit en entier : dans ce qu’elle sélectionne, drizzle nomme une colonne sans sa table, que la sous-requête prendrait pour la sienne */
      n: sql<number>`1 + (select count(*) from ${schema.chatMessages} as "c" where "c"."story_id" = ${storyId} and "c"."role" = 'toi' and "c"."created_at" > "tasks"."created_at")`.mapWith(
        Number,
      ),
    })
    .from(t)
    .where(and(eq(t.storyId, storyId), eq(t.kind, "memoire_maj"), eq(t.status, "lot")))
    .limit(1);
  return l?.n ?? 0;
}

/* ———— Du lot au direct ———— */

/**
 * Les mises à jour de la conv qui attendent sans avoir été prises se réunissent dans la plus ancienne, leurs échanges dans
 * l’ordre, et partent tout de suite : celle qui quitte son lot emmène celles qui attendaient le calme, un seul appel pour
 * tous. Sous le verrou de la conv, comme retenir.
 */
async function reunir(storyId: string): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");
    const attendent = await tx
      .select({ id: t.id, input: t.input })
      .from(t)
      .where(and(eq(t.storyId, storyId), eq(t.kind, "memoire_maj"), eq(t.status, "attente"), eq(t.attempts, 0)))
      .orderBy(asc(t.createdAt))
      .for("update");
    const [premiere, ...autres] = attendent;
    if (!premiere || !autres.length) return;
    const echanges = attendent.flatMap((a) => (a.input ? coffre.lire("tasks.input", a.input) : []));
    await tx
      .update(t)
      .set({ input: coffre.ecrire("tasks.input", echanges), pasAvant: null, updatedAt: new Date() })
      .where(eq(t.id, premiere.id));
    await tx.delete(t).where(
      inArray(
        t.id,
        autres.map((a) => a.id),
      ),
    );
  });
}

/**
 * La mise à jour quitte son lot pour le direct : en attente, à prendre tout de suite (sans heure), sans la mémoire gardée
 * pour le lot, réunie à celles qui attendaient (reunir). `code` (tasks.error) dit pourquoi, sans contenu. Seulement si
 * elle est encore `depuis` (en lot, ou prise pour lire sa réponse ou l’envoyer), et, avec `battement`, encore tenue par
 * cette exécution : sinon, une autre exécution l’a déjà fait, ou la tient. Rend sa conv, dont la chaîne est à relancer,
 * ou null.
 */
async function versLeDirect(id: string, depuis: "lot" | "en_cours", code: string, battement?: Date): Promise<string | null> {
  const [r] = await db()
    .update(t)
    .set({ status: "attente", pasAvant: null, lotAvant: null, error: code.slice(0, 120), updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, depuis), battement ? eq(t.heartbeatAt, battement) : undefined))
    .returning({ storyId: t.storyId });
  if (!r) return null;
  journal("mémoire : du lot au direct", { tache: id, code });
  await reunir(r.storyId);
  return r.storyId;
}

/** Annule le lot chez le prestataire, et le note annulé ; un échec (il a pu finir entre-temps) se retente au passage suivant. */
async function annuler(lot: string, o?: Presse): Promise<boolean> {
  try {
    await (await claude()).annulerLeLot(lot, o);
    await db().update(lots).set({ annuleLe: new Date() }).where(eq(lots.id, lot));
    return true;
  } catch (e) {
    journalErreur("lot non annulé", e, { lot });
    return false;
  }
}

/* ———— La réponse d’un lot ———— */

type Lot = typeof lots.$inferSelect;

/** Ce qu’un relevé a fait : les convs dont la mise à jour part en direct, et celles dont la réponse s’est appliquée. */
type Releve = { directs: string[]; appliquees: string[] };

/**
 * Qui paie les réponses d’un lot : le compte de sa conv, ou, la conv effacée depuis l’envoi, le compte qu’elle avait
 * (lots.user_id) : effacer une conv ne fait pas passer ce qu’elle a coûté dans la part sans compte (src/server/budget.ts).
 */
async function payeurDuLot(l: Lot): Promise<Payeur> {
  const deLaConv = l.storyId ? await payeurDe(l.storyId) : null;
  if (deLaConv || !l.userId) return deLaConv;
  const [u] = await db().select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, l.userId));
  return u ? payeurDuCompte(u) : null;
}

/** La réponse appliquée à la mémoire (majDuLot) : null, c’est fait ; sinon, le code qui la fait repartir en direct. */
async function appliquer(tache: Tache, maj: Maj): Promise<string | null> {
  const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, tache.storyId));
  const echanges = entreeDe(tache);
  const lue = tache.lotAvant ? coffre.lire("tasks.lot_avant", tache.lotAvant) : null;
  if (!story || !echanges?.length || !lue) return "lot:sans_memoire";
  const issue = await (await analyse()).majDuLot(story, echanges, lue, maj);
  return issue === "faite" ? null : `lot:${issue}`;
}

/** Le code d’une réponse qui ne s’applique pas, sans contenu : l’issue d’un lot, ou celle de sa lecture. */
const codeDe = (issue: Exclude<IssueDuLot, { type: "succeeded" }>) => (issue.type === "errored" ? `lot:errored:${issue.code}` : `lot:${issue.type}`);

/**
 * Une réponse d’un lot fini, lue une seule fois (releverLeLot). Facturée, son coût est noté (lireLeResultat), au compte
 * qui paie (`payeur`), même si sa mise à jour n’attend plus. Si elle attend encore (en lot), elle est prise pour la lire,
 * comme une tâche qu’on exécute, puis finie, ou envoyée en direct. Rend sa conv, et si sa mise à jour part en direct.
 */
async function lireLaReponse(l: Lot, payeur: Payeur, { id, issue }: { id: string | null; issue: IssueDuLot }): Promise<{ conv: string; direct: boolean } | null> {
  const ia = await claude();
  const appel =
    issue.type === "succeeded"
      ? await ia.lireLeResultat(issue.message, Maj07, { storyId: l.storyId ?? undefined, payeur, etiquette: ETIQUETTE, ms: Date.now() - l.envoyeLe.getTime() })
      : null;
  const [tache] =
    id && id === l.tacheId
      ? await db()
          .update(t)
          .set({ status: "en_cours", heartbeatAt: new Date(), updatedAt: new Date() })
          .where(and(eq(t.id, id), eq(t.status, "lot")))
          .returning()
      : [];
  if (!tache) {
    if (appel) journal("lot : réponse d’une mise à jour partie ailleurs, ignorée", { lot: l.id, tache: id }, "alerte");
    return null;
  }
  try {
    const code = issue.type !== "succeeded" ? codeDe(issue) : appel?.refus ? "lot:refus" : appel?.sortie ? await appliquer(tache, appel.sortie) : "lot:illisible";
    if (!code) {
      await finir(tache.id);
      return { conv: tache.storyId, direct: false };
    }
    const conv = await versLeDirect(tache.id, "en_cours", code);
    return conv ? { conv, direct: true } : null;
  } catch (e) {
    /* La base qui tombe en route : la mise à jour part en direct (au pire, son battement perdu, prendre la reprend) */
    journalErreur("lot : réponse non appliquée", e, { lot: l.id, tache: id });
    try {
      const conv = await versLeDirect(tache.id, "en_cours", "lot:erreur");
      return conv ? { conv, direct: true } : null;
    } catch (encore) {
      journalErreur("lot : la mise à jour ne repart pas en direct", encore, { tache: id });
      return null;
    }
  }
}

/**
 * Un lot fini : ses réponses lues et appliquées (lireLaReponse), une seule fois (traite_le, posé avant de noter leur coût :
 * au pire, une coupure juste là perd ce coût, jamais ne le double), puis le lot effacé chez le prestataire, et ici. Sa
 * tâche encore en lot après (sa réponse n’y était pas, ou la lecture a été coupée avant elle) part en direct. Un seul
 * passage à la fois (lu_le), repris s’il a été coupé (LECTURE_COUPEE_S) ; une lecture ratée rend la main tout de suite.
 * Un effacement raté se retente au passage d’après, sans relire les réponses. Rend ce qu’il a fait, ou null si un autre
 * passage le relève déjà. `o` : le délai des appels au prestataire.
 */
async function releverLeLot(lot: string, o?: Presse): Promise<Releve | null> {
  const [l] = await db()
    .update(lots)
    .set({ luLe: new Date() })
    .where(and(eq(lots.id, lot), or(isNull(lots.luLe), lt(lots.luLe, sql`now() - make_interval(secs => ${LECTURE_COUPEE_S})`))))
    .returning();
  if (!l) return null;
  const ia = await claude();
  const releve: Releve = { directs: [], appliquees: [] };
  if (!l.traiteLe) {
    let resultats: Awaited<ReturnType<typeof ia.resultatsDuLot>>;
    try {
      resultats = await ia.resultatsDuLot(lot, o);
    } catch (e) {
      /* Rien de lu : la main rendue tout de suite, un passage d’après (ou le rapatriement) le relira */
      await auMieux(db().update(lots).set({ luLe: null }).where(eq(lots.id, lot)), "lot : lecture non rendue", { lot });
      throw e;
    }
    const payeur = resultats.some((r) => r.issue.type === "succeeded") ? await payeurDuLot(l) : null;
    await db().update(lots).set({ traiteLe: new Date() }).where(eq(lots.id, lot));
    for (const r of resultats) {
      const lue = await lireLaReponse(l, payeur, r);
      if (lue) (lue.direct ? releve.directs : releve.appliquees).push(lue.conv);
    }
  }
  const sansReponse = l.tacheId && (await versLeDirect(l.tacheId, "lot", "lot:sans_reponse"));
  if (sansReponse) releve.directs.push(sansReponse);
  try {
    await ia.effacerLeLot(lot, o);
    await db().delete(lots).where(eq(lots.id, lot));
    journal("lot relevé et effacé", { lot, directs: releve.directs.length });
  } catch (e) {
    journalErreur("lot relevé, pas encore effacé", e, { lot });
  }
  return releve;
}

/* ———— Rapatrier ———— */

/** Ce qu’un rapatriement a fait : la mise à jour du lot partie en direct, sa réponse appliquée, ou rien (null). */
export type Rapatrie = "direct" | "appliquee" | null;

/**
 * Une mise à jour doit partir tout de suite alors que la conv a un lot en vol (sa fiche ouverte pour de bon, le
 * ECHANGES_PAR_MAJ-ième échange depuis le lot, un niveau atteint, un ajout) : s’il a fini, sa réponse s’applique d’abord ;
 * sinon il est annulé, et sa mise à jour part en direct, réunie à celles qui attendaient. Sans réponse du prestataire, elle
 * part en direct aussi (un passage suivant annulera le lot) : ce qui doit partir part. Sur le chemin d’une requête (la
 * fiche, le chat) : des appels courts (COURT), quelques secondes au pire. Un passage qui lit sa réponse en ce moment
 * (lu_le frais) : rien à demander au prestataire, ce passage l’applique puis relance la chaîne de la conv (traiterLesLots).
 * Rend ce qui s’est passé (l’appelant relance la chaîne si une mise à jour part en direct). Ne lève jamais.
 */
export async function rapatrier(storyId: string): Promise<Rapatrie> {
  try {
    const [l] = await db()
      .select({ lot: lots.id, tache: t.id, enLecture: sql<boolean>`coalesce(${lots.luLe} > now() - make_interval(secs => ${LECTURE_COUPEE_S}), false)` })
      .from(lots)
      .innerJoin(t, eq(t.id, lots.tacheId))
      .where(and(eq(t.storyId, storyId), eq(t.status, "lot")))
      .limit(1);
    if (!l || l.enLecture) return null;
    let etat: EtatDuLot | null = null;
    try {
      etat = await (await claude()).etatDuLot(l.lot, COURT);
      if (etat === "fini") {
        const r = await releverLeLot(l.lot, COURT);
        return r?.directs.includes(storyId) ? "direct" : r?.appliquees.includes(storyId) ? "appliquee" : null;
      }
    } catch (e) {
      journalErreur("lot illisible, la mise à jour part en direct", e, { lot: l.lot });
    }
    if (etat === "en_cours") await annuler(l.lot, COURT);
    return (await versLeDirect(l.tache, "lot", "lot:rapatrie")) ? "direct" : null;
  } catch (e) {
    journalErreur("lot non rapatrié", e, { histoire: storyId });
    return null;
  }
}

/* ———— Le passage des 5 minutes ———— */

/**
 * Ce que coûteront les lots pas encore relevés (leur coût n’est noté qu’à la lecture de leur réponse), en millionièmes de
 * dollar : pour tous, et pour ce compte (les lots partis pour lui, ou sans compte). Le budget du jour les compte d’avance.
 */
async function reserveDesLots(userId: string | null): Promise<Reserve> {
  const [r] = await db()
    .select({
      tous: sql<number>`count(*)`.mapWith(Number),
      compte: sql<number>`count(*) filter (where ${lots.userId} is not distinct from ${userId}::uuid)`.mapWith(Number),
    })
    .from(lots)
    .where(isNull(lots.traiteLe));
  return { jour: (r?.tous ?? 0) * RESERVE_PAR_LOT, payeur: (r?.compte ?? 0) * RESERVE_PAR_LOT };
}

/**
 * Envoie en lot une mise à jour dont le chat s’est calmé : prise comme une tâche qu’on exécute (personne d’autre ne la
 * prend pendant l’envoi), sa requête faite sur la mémoire d’aujourd’hui (preparerLaMaj, la même qu’en direct), un
 * battement juste avant l’envoi (qui tient sous PERIME_S : personne ne la croit abandonnée), puis le lot gardé, et la
 * tâche en lot avec la mémoire de l’envoi, seulement si elle est encore à cet envoi (son battement est le sien) : prise
 * entre-temps par une autre exécution, le lot est annulé, et effacé quand il aura fini. Le budget du jour atteint (les
 * lots en vol comptés d’avance) : elle attend (ErreurTache « budget »). Une erreur passagère du prestataire, une première
 * fois : elle attend le passage suivant (REPORTE). Sans mémoire, ou un envoi impossible : elle part en direct (`direct`).
 */
async function envoyer(id: string): Promise<{ envoyee: boolean; direct: string | null }> {
  const prise = new Date();
  const [tache] = await db()
    .update(t)
    .set({ status: "en_cours", heartbeatAt: prise, updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, "attente"), lt(t.attempts, ESSAIS_MAX), isNotNull(t.pasAvant), lte(t.pasAvant, sql`now()`), autreEnCours, sansLotEnVol))
    .returning();
  if (!tache) return { envoyee: false, direct: null };
  let battement = prise;
  const encoreANous = () => and(eq(t.id, tache.id), eq(t.status, "en_cours"), eq(t.heartbeatAt, battement));
  try {
    const [[story], lue] = await Promise.all([db().select().from(schema.stories).where(eq(schema.stories.id, tache.storyId)), donneesMemoire(tache.storyId)]);
    const echanges = entreeDe(tache);
    /* Sans mémoire (la vraie en échec, celle de secours pas encore écrite) : le direct sait l’écrire d’abord */
    if (!story || !lue || !echanges?.length) return { envoyee: false, direct: await versLeDirect(tache.id, "en_cours", "lot:sans_memoire", battement) };
    const { req } = (await analyse()).preparerLaMaj(story, lue, echanges);
    const ia = await claude();
    const reserve = await reserveDesLots(story.userId);
    const bat = new Date();
    const [battue] = await db().update(t).set({ heartbeatAt: bat }).where(encoreANous()).returning({ id: t.id });
    if (!battue) return { envoyee: false, direct: null };
    battement = bat;
    const lot = await ia.envoyerEnLot(tache.id, req, Maj07, { storyId: tache.storyId, partie: "mise à jour", reserve });
    try {
      await db().insert(lots).values({ id: lot, tacheId: tache.id, storyId: tache.storyId, userId: story.userId });
    } catch (e) {
      /* Sans sa ligne, rien ne l’effacerait chez le prestataire : annulé, et gardé annulé sans tâche pour être effacé une fois fini (sinon, le ménage le retrouvera) */
      await auMieux(ia.annulerLeLot(lot), "lot non gardé, ni annulé", { lot });
      await auMieux(db().insert(lots).values({ id: lot, storyId: tache.storyId, userId: story.userId, annuleLe: new Date() }).onConflictDoNothing(), "lot non gardé", { lot });
      throw e;
    }
    const [enLot] = await db()
      .update(t)
      .set({ status: "lot", lotAvant: coffre.ecrire("tasks.lot_avant", lue), error: null, updatedAt: new Date() })
      .where(encoreANous())
      .returning({ id: t.id });
    if (!enLot) {
      /* Prise entre-temps par une autre exécution (la chaîne, en direct) : le lot ne lui sert plus ; annulé, effacé une fois fini, sa réponse ignorée */
      await db().update(lots).set({ tacheId: null }).where(eq(lots.id, lot));
      await annuler(lot);
      journal("lot : sa mise à jour prise ailleurs pendant l’envoi, annulé", { tache: tache.id, lot }, "alerte");
      return { envoyee: false, direct: null };
    }
    journal("mémoire envoyée en lot", { tache: tache.id, lot, echanges: echanges.length });
    return { envoyee: true, direct: null };
  } catch (e) {
    /* Le budget du jour atteint : elle attend, et partira à un passage d’après (ou en direct, si la conv reprend) */
    if (e instanceof ErreurTache && estBudget(e)) {
      await db().update(t).set({ status: "attente", updatedAt: new Date() }).where(encoreANous());
      return { envoyee: false, direct: null };
    }
    /* Passagère, et pas déjà la fois d’avant : elle attend le passage suivant, son heure gardée, plutôt que le direct à plein tarif */
    if ((await claude()).erreurPassagere(e) && tache.error !== REPORTE) {
      journalErreur("mémoire : envoi en lot remis au passage suivant", e, { tache: tache.id });
      await db().update(t).set({ status: "attente", error: REPORTE, updatedAt: new Date() }).where(encoreANous());
      return { envoyee: false, direct: null };
    }
    journalErreur("mémoire : envoi en lot impossible, en direct", e, { tache: tache.id });
    return { envoyee: false, direct: await versLeDirect(tache.id, "en_cours", "lot:envoi", battement) };
  }
}

/**
 * Les mises à jour dont le chat s’est calmé, envoyées en lot : la plus ancienne de chaque conv qui peut partir, les convs
 * calmées depuis le plus longtemps d’abord (une conv que le budget retient repasse derrière : son updated_at bouge).
 */
async function envoyerLesMajEnLot(fin: number): Promise<{ envoyes: number; directs: string[] }> {
  if (!memoireEnLot()) return { envoyes: 0, directs: [] };
  const premieres = db()
    .selectDistinctOn([t.storyId], { id: t.id, depuis: t.updatedAt })
    .from(t)
    .where(and(eq(t.kind, "memoire_maj"), eq(t.status, "attente"), lt(t.attempts, ESSAIS_MAX), isNotNull(t.pasAvant), lte(t.pasAvant, sql`now()`), autreEnCours, sansLotEnVol))
    .orderBy(t.storyId, asc(t.createdAt))
    .as("premieres");
  const pretes = await db().select({ id: premieres.id }).from(premieres).orderBy(asc(premieres.depuis)).limit(ENVOIS_PAR_PASSAGE);
  let envoyes = 0;
  const directs: string[] = [];
  for (const p of pretes) {
    if (Date.now() > fin) break;
    const r = await envoyer(p.id);
    if (r.envoyee) envoyes++;
    if (r.direct) directs.push(r.direct);
  }
  return { envoyes, directs };
}

/**
 * Les lots chez le prestataire, un à un, les plus anciens d’abord : fini, il est relevé (releverLeLot) ; disparu, sa mise
 * à jour part en direct (avant que sa ligne s’efface : une base qui tombe entre les deux ne laisse pas une tâche en lot
 * sans lot) ; en cours depuis plus de LOT_AU_PLUS_S, illisible passé ce délai, ou sans sa tâche (partie en direct, effacée
 * avec sa conv) depuis GRACE_S, il est annulé (retenté à chaque passage tant que ça n’a pas pris), sa mise à jour en
 * direct, et il sera relevé quand il aura fini, pour être effacé.
 */
async function releverLesLots(fin: number): Promise<{ lus: number; annules: number } & Releve> {
  const enVol = await db()
    .select({ id: lots.id, envoyeLe: lots.envoyeLe, annuleLe: lots.annuleLe, tache: t.id, statut: t.status })
    .from(lots)
    .leftJoin(t, eq(t.id, lots.tacheId))
    .orderBy(asc(lots.envoyeLe));
  const r = { lus: 0, annules: 0, directs: [] as string[], appliquees: [] as string[] };
  if (!enVol.length) return r;
  const ia = await claude();
  for (const l of enVol) {
    if (Date.now() > fin) break;
    const enLot = l.statut === "lot" && l.tache ? l.tache : null;
    let etat: EtatDuLot | null = null;
    try {
      etat = await ia.etatDuLot(l.id);
    } catch (e) {
      journalErreur("lot illisible", e, { lot: l.id });
    }
    try {
      if (etat === "fini") {
        const releve = await releverLeLot(l.id);
        if (releve) {
          r.lus++;
          r.directs.push(...releve.directs);
          r.appliquees.push(...releve.appliquees);
        }
      } else if (etat === "introuvable") {
        const d = enLot && (await versLeDirect(enLot, "lot", "lot:introuvable"));
        if (d) r.directs.push(d);
        await db().delete(lots).where(eq(lots.id, l.id));
      } else if (Date.now() - l.envoyeLe.getTime() > (enLot ? LOT_AU_PLUS_S : GRACE_S) * 1000) {
        if (!l.annuleLe && (await annuler(l.id))) r.annules++;
        const d = enLot && (await versLeDirect(enLot, "lot", etat ? "lot:delai" : "lot:illisible"));
        if (d) r.directs.push(d);
      }
    } catch (e) {
      journalErreur("lot non relevé", e, { lot: l.id });
    }
  }
  return r;
}

/** Une tâche en lot qui n’a plus de lot (sa ligne de `lots` disparue en route), depuis GRACE_S : rien ne la relèverait. */
const sansLot: SQL = sql`not exists (select 1 from ${lots} where ${lots.tacheId} = ${t.id})`;

/** Les mises à jour en lot qui ont perdu leur lot : en direct, leurs convs (à relancer). */
async function sansLeurLot(): Promise<string[]> {
  const perdues = await db()
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.kind, "memoire_maj"), eq(t.status, "lot"), lt(t.updatedAt, sql`now() - make_interval(secs => ${GRACE_S})`), sansLot));
  const convs: string[] = [];
  for (const p of perdues) {
    const d = await versLeDirect(p.id, "lot", "lot:sans_lot");
    if (d) convs.push(d);
  }
  return convs;
}

/** Les lots d’un autre outil déjà regardés par le ménage (une requête qui n’est pas à nous) : plus relus par cette instance. */
const ETRANGERS = new Set<string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le ménage : les lots finis de l’espace de travail, d’une seule requête, créés depuis MENAGE_S, que la base ne connaît
 * pas. Le nôtre (l’identifiant de sa requête le dit : src/server/ia/claude.ts) y est gardé, sans tâche (la sienne est
 * partie autrement) et annulé, pour que le relevé note son coût puis l’efface. Celui d’un autre outil (les évals des
 * prompts, sur la même clé) n’est jamais touché. Un lot qui tourne encore ne se reconnaît pas (ses identifiants ne se
 * lisent qu’une fois fini) : il attend sa fin, au plus 24 h. Rend combien ont été retrouvés.
 */
async function menage(fin: number): Promise<number> {
  if (!memoireEnLot()) return 0;
  const ia = await claude();
  const finis = (await ia.lotsRecents(new Date(Date.now() - MENAGE_S * 1000))).filter(
    (b) => b.fini && b.requetes === 1 && !ETRANGERS.has(b.id) && Date.now() - b.creeLe.getTime() > GRACE_S * 1000,
  );
  if (!finis.length) return 0;
  const connus = new Set(
    (
      await db()
        .select({ id: lots.id })
        .from(lots)
        .where(
          inArray(
            lots.id,
            finis.map((b) => b.id),
          ),
        )
    ).map((l) => l.id),
  );
  let retrouves = 0;
  for (const b of finis) {
    if (connus.has(b.id)) continue;
    if (Date.now() > fin) break;
    const [r, ...autres] = await ia.resultatsDuLot(b.id);
    if (!r?.id || autres.length || !UUID.test(r.id)) {
      if (ETRANGERS.size >= 1000) ETRANGERS.clear();
      ETRANGERS.add(b.id);
      continue;
    }
    const [de] = await db().select({ storyId: t.storyId, userId: schema.stories.userId }).from(t).innerJoin(schema.stories, eq(schema.stories.id, t.storyId)).where(eq(t.id, r.id));
    await db()
      .insert(lots)
      .values({ id: b.id, storyId: de?.storyId ?? null, userId: de?.userId ?? null, envoyeLe: b.creeLe, annuleLe: new Date() })
      .onConflictDoNothing();
    journal("lot inconnu retrouvé, gardé pour être effacé", { lot: b.id }, "alerte");
    retrouves++;
  }
  return retrouves;
}

/** Une étape du passage, qui ne fait pas tomber les suivantes : son échec au journal, et sa valeur à vide. */
async function etape<T>(evenement: string, f: () => Promise<T>, vide: T): Promise<T> {
  try {
    return await f();
  } catch (e) {
    journalErreur(evenement, e);
    return vide;
  }
}

/**
 * Au passage des 5 minutes, en PASSAGE_MS au plus : le ménage, les lots relevés (une réponse revenue laisse partir la mise
 * à jour suivante de sa conv), les mises à jour en lot sans lot remises en direct, puis les mises à jour calmées envoyées
 * (seulement avec BLUSH_MEMOIRE_EN_LOT : éteint, les lots déjà partis sont encore relevés, et rien d’autre ne part chez le
 * prestataire). Celles qui partent en direct le font chacune par son relais, comme les convs dont une réponse vient de
 * s’appliquer et qui ont une étape à prendre tout de suite (une mise à jour qui attendait le lot). Des nombres seulement.
 * Ne lève jamais : chaque étape a son échec à elle.
 */
export async function traiterLesLots(): Promise<{ envoyes: number; lus: number; annules: number }> {
  const fin = Date.now() + PASSAGE_MS;
  await etape("ménage des lots impossible", () => menage(fin), 0);
  const releves = await etape("relevé des lots impossible", () => releverLesLots(fin), { lus: 0, annules: 0, directs: [], appliquees: [] });
  const perdues = await etape("tâches en lot sans lot non reprises", sansLeurLot, []);
  const envois = await etape("envoi des lots impossible", () => envoyerLesMajEnLot(fin), { envoyes: 0, directs: [] as string[] });
  const suites = await etape(
    "suites des lots non relancées",
    async () => (await Promise.all([...new Set(releves.appliquees)].map(async (id) => ((await aRelancer(id)).length ? id : null)))).filter((id) => id !== null),
    [],
  );
  await Promise.all([...new Set([...releves.directs, ...perdues, ...envois.directs, ...suites])].map((id) => passerLaMain(id, 1)));
  return { envoyes: envois.envoyes, lus: releves.lus, annules: releves.annules };
}
