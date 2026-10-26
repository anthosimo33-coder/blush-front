import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Maj07, type Maj } from "@prompts/lib/schemas";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { donneesMemoire } from "./depot";
import { memoireEnLot } from "./env";
import { ErreurTache, estBudget } from "./erreurs";
import type { EtatDuLot, IssueDuLot } from "./ia/claude";
import { auMieux, journal, journalErreur } from "./journal";
import { passerLaMain } from "./relais";
import { autreEnCours, entreeDe, ESSAIS_MAX, finir, sansLotEnVol, type Tache } from "./taches";

/*
 * La mise à jour de la mémoire, en différé. Celle qui part au calme (src/server/memoire-groupee.ts : 10 minutes sans
 * échange), personne ne l’attend : la personne est partie, le chat relit ses derniers échanges, et sa fiche la rapatrie
 * quand elle s’ouvre. Avec BLUSH_MEMOIRE_EN_LOT, le passage des 5 minutes (GET /api/cron/relances) l’envoie donc en lot au
 * prestataire (l’API Message Batches, src/server/ia/claude.ts : la même requête qu’en direct, deux fois moins chère), puis
 * relève les lots à chaque passage :
 *   - fini : la réponse s’applique à la mémoire gardée à l’envoi (tasks.lot_avant), ou à elle et aux alertes que le chat
 *     a notées depuis (majDuLot, src/server/analyse.ts) ; la tâche finit ;
 *   - un refus (le repli du prestataire n’existe pas en lot), une erreur, une expiration, une annulation, une sortie
 *     illisible, des preuves introuvables, la mémoire changée autrement : la mise à jour repart en direct (versLeDirect) ;
 *   - toujours en cours au bout de LOT_AU_PLUS_S : le lot est annulé, la mise à jour part en direct.
 * Puis le lot est effacé chez le prestataire, sa réponse avec : elle n’y reste pas 29 jours. Une tâche en lot (statut
 * `lot`) ne repart pas en direct d’elle-même, et aucune autre mise à jour de la conv ne part avant elle (sansLotEnVol,
 * src/server/taches.ts) : la même mise à jour n’est jamais payée deux fois, sauf une annulation arrivée trop tard (un lot
 * déjà en cours de traitement finit quand même : sa réponse, facturée, est notée puis ignorée).
 * Ce qui ne peut pas attendre la rapatrie (rapatrier) : sa fiche ouverte pour de bon, un niveau atteint, un ajout, et le
 * ECHANGES_PAR_MAJ-ième échange depuis le lot (le fil du chat ne relit que les 6 derniers). Une alerte du chat, elle, n’a
 * rien à rapatrier : elle est notée tout de suite dans la mémoire (noterLAlerte, src/server/chat.ts), le lot ne la voit
 * pas, ne peut pas l’effacer, et sa réponse s’applique par-dessus (src/server/memoire-relue.ts).
 */

/** Au-delà, un lot qui tourne encore est annulé et sa mise à jour part en direct : la plupart finissent en quelques minutes. */
export const LOT_AU_PLUS_S = 3600;
/** Un lot dont la tâche n’y est pas (ou plus) est annulé passé ce temps : l’envoi garde le lot avant d’y mettre sa tâche. */
const GRACE_S = 120;
/** Ses réponses en cours de lecture depuis plus que ça : la lecture a été coupée, un passage suivant la reprend. */
const LECTURE_COUPEE_S = 600;
/** Ce que le passage des 5 minutes envoie en lot au plus. */
const ENVOIS_PAR_PASSAGE = 20;
/** L’étiquette de leur coût au suivi (ai_usage.task) : le poste « Mémoire (en lot) » de /admin. */
const ETIQUETTE = "memoire_maj_lot";

const claude = () => import("./ia/claude");
const analyse = () => import("./analyse");

const t = schema.tasks;

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
 * elle est encore `depuis` (en lot, ou prise pour lire sa réponse) : sinon, une autre exécution l’a déjà fait. Rend sa
 * conv, dont la chaîne est à relancer, ou null.
 */
async function versLeDirect(id: string, depuis: "lot" | "en_cours", code: string): Promise<string | null> {
  const [r] = await db()
    .update(t)
    .set({ status: "attente", pasAvant: null, lotAvant: null, error: code.slice(0, 120), updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, depuis)))
    .returning({ storyId: t.storyId });
  if (!r) return null;
  journal("mémoire : du lot au direct", { tache: id, code });
  await reunir(r.storyId);
  return r.storyId;
}

/** Annule le lot chez le prestataire, et le note annulé ; un échec (il a pu finir entre-temps) se retente au passage suivant. */
async function annuler(lot: string): Promise<void> {
  try {
    await (await claude()).annulerLeLot(lot);
    await db().update(schema.lots).set({ annuleLe: new Date() }).where(eq(schema.lots.id, lot));
  } catch (e) {
    journalErreur("lot non annulé", e, { lot });
  }
}

/* ———— La réponse d’un lot ———— */

type Lot = typeof schema.lots.$inferSelect;

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
 * Une réponse d’un lot fini. Facturée, son coût est noté (lireLeResultat), même si sa mise à jour n’attend plus. Si elle
 * attend encore (en lot), elle est prise pour la lire, comme une tâche qu’on exécute, puis finie, ou envoyée en direct.
 * Rend sa conv si sa mise à jour part en direct.
 */
async function lireLaReponse(l: Lot, { id, issue }: { id: string; issue: IssueDuLot }): Promise<string | null> {
  const ia = await claude();
  const appel =
    issue.type === "succeeded"
      ? await ia.lireLeResultat(issue.message, Maj07, { storyId: l.storyId ?? undefined, etiquette: ETIQUETTE, ms: Date.now() - l.envoyeLe.getTime() })
      : null;
  const [tache] =
    id === l.tacheId
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
      return null;
    }
    return await versLeDirect(tache.id, "en_cours", code);
  } catch (e) {
    /* La base qui tombe en route : la mise à jour part en direct (au pire, son battement perdu, prendre la reprend) */
    journalErreur("lot : réponse non appliquée", e, { lot: l.id, tache: id });
    try {
      return await versLeDirect(tache.id, "en_cours", "lot:erreur");
    } catch (encore) {
      journalErreur("lot : la mise à jour ne repart pas en direct", encore, { tache: id });
      return null;
    }
  }
}

/**
 * Un lot fini : ses réponses lues et appliquées (lireLaReponse), puis le lot effacé chez le prestataire, et ici. Un seul
 * passage à la fois (lu_le), repris s’il a été coupé (LECTURE_COUPEE_S). Rend les convs dont une mise à jour part en
 * direct, ou null si un autre passage le relève déjà.
 */
async function releverLeLot(lot: string): Promise<string[] | null> {
  const [l] = await db()
    .update(schema.lots)
    .set({ luLe: new Date() })
    .where(and(eq(schema.lots.id, lot), or(isNull(schema.lots.luLe), lt(schema.lots.luLe, sql`now() - make_interval(secs => ${LECTURE_COUPEE_S})`))))
    .returning();
  if (!l) return null;
  const ia = await claude();
  const directs: string[] = [];
  for (const r of await ia.resultatsDuLot(lot)) {
    const conv = await lireLaReponse(l, r);
    if (conv) directs.push(conv);
  }
  await ia.effacerLeLot(lot);
  await db().delete(schema.lots).where(eq(schema.lots.id, lot));
  journal("lot relevé et effacé", { lot, directs: directs.length });
  return directs;
}

/* ———— Rapatrier ———— */

/**
 * Une mise à jour doit partir tout de suite alors que la conv a un lot en vol (sa fiche ouverte pour de bon, le
 * ECHANGES_PAR_MAJ-ième échange depuis le lot, un niveau atteint, un ajout) : s’il a fini, sa réponse s’applique d’abord ;
 * sinon il est annulé, et sa mise à jour part en direct, réunie à celles qui attendaient. Sans réponse du prestataire, elle
 * part en direct aussi (un passage suivant annulera le lot) : ce qui doit partir part. Vrai si une mise à jour en est
 * partie en direct (l’appelant relance la chaîne). Ne lève jamais.
 */
export async function rapatrier(storyId: string): Promise<boolean> {
  try {
    const [l] = await db()
      .select({ lot: schema.lots.id, tache: t.id })
      .from(schema.lots)
      .innerJoin(t, eq(t.id, schema.lots.tacheId))
      .where(and(eq(t.storyId, storyId), eq(t.status, "lot")))
      .limit(1);
    if (!l) return false;
    let etat: EtatDuLot | null = null;
    try {
      etat = await (await claude()).etatDuLot(l.lot);
      /* Fini : relevé ici, ou par un autre passage qui l’applique en ce moment (null) ; rien de plus à faire */
      if (etat === "fini") return !!(await releverLeLot(l.lot))?.length;
    } catch (e) {
      journalErreur("lot illisible, la mise à jour part en direct", e, { lot: l.lot });
    }
    if (etat === "en_cours") await annuler(l.lot);
    return !!(await versLeDirect(l.tache, "lot", "lot:rapatrie"));
  } catch (e) {
    journalErreur("lot non rapatrié", e, { histoire: storyId });
    return false;
  }
}

/* ———— Le passage des 5 minutes ———— */

/**
 * Envoie en lot une mise à jour dont le chat s’est calmé : prise comme une tâche qu’on exécute (personne d’autre ne la
 * prend pendant l’envoi), sa requête faite sur la mémoire d’aujourd’hui (preparerLaMaj, la même qu’en direct), puis le lot
 * gardé, et la tâche en lot avec la mémoire de l’envoi. Le budget du jour atteint : elle attend (ErreurTache « budget »).
 * Sans mémoire, ou un envoi impossible : elle part en direct (`direct`, sa conv).
 */
async function envoyer(id: string): Promise<{ envoyee: boolean; direct: string | null }> {
  const [tache] = await db()
    .update(t)
    .set({ status: "en_cours", heartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, "attente"), lt(t.attempts, ESSAIS_MAX), isNotNull(t.pasAvant), lte(t.pasAvant, sql`now()`), autreEnCours, sansLotEnVol))
    .returning();
  if (!tache) return { envoyee: false, direct: null };
  try {
    const [[story], lue] = await Promise.all([db().select().from(schema.stories).where(eq(schema.stories.id, tache.storyId)), donneesMemoire(tache.storyId)]);
    const echanges = entreeDe(tache);
    /* Sans mémoire (la vraie en échec, celle de secours pas encore écrite) : le direct sait l’écrire d’abord */
    if (!story || !lue || !echanges?.length) return { envoyee: false, direct: await versLeDirect(tache.id, "en_cours", "lot:sans_memoire") };
    const { req } = (await analyse()).preparerLaMaj(story, lue, echanges);
    const ia = await claude();
    const lot = await ia.envoyerEnLot(tache.id, req, Maj07, { storyId: tache.storyId, partie: "mise à jour" });
    try {
      await db().insert(schema.lots).values({ id: lot, tacheId: tache.id, storyId: tache.storyId });
    } catch (e) {
      /* Sans sa ligne, rien ne l’effacerait chez le prestataire : annulé tout de suite, et dit (son identifiant seul) */
      await auMieux(ia.annulerLeLot(lot), "lot non gardé, ni annulé", { lot });
      throw e;
    }
    await db()
      .update(t)
      .set({ status: "lot", lotAvant: coffre.ecrire("tasks.lot_avant", lue), updatedAt: new Date() })
      .where(eq(t.id, tache.id));
    journal("mémoire envoyée en lot", { tache: tache.id, lot, echanges: echanges.length });
    return { envoyee: true, direct: null };
  } catch (e) {
    if (e instanceof ErreurTache && estBudget(e)) {
      /* Le budget du jour atteint : elle attend, et partira à un passage d’après (ou en direct, si la conv reprend) */
      await db()
        .update(t)
        .set({ status: "attente", updatedAt: new Date() })
        .where(and(eq(t.id, tache.id), eq(t.status, "en_cours")));
      return { envoyee: false, direct: null };
    }
    journalErreur("mémoire : envoi en lot impossible, en direct", e, { tache: tache.id });
    return { envoyee: false, direct: await versLeDirect(tache.id, "en_cours", "lot:envoi") };
  }
}

/** Les mises à jour dont le chat s’est calmé, envoyées en lot : la plus ancienne de chaque conv qui peut partir. */
async function envoyerLesMajEnLot(): Promise<{ envoyes: number; directs: string[] }> {
  if (!memoireEnLot()) return { envoyes: 0, directs: [] };
  const pretes = await db()
    .selectDistinctOn([t.storyId], { id: t.id })
    .from(t)
    .where(and(eq(t.kind, "memoire_maj"), eq(t.status, "attente"), lt(t.attempts, ESSAIS_MAX), isNotNull(t.pasAvant), lte(t.pasAvant, sql`now()`), autreEnCours, sansLotEnVol))
    .orderBy(t.storyId, asc(t.createdAt))
    .limit(ENVOIS_PAR_PASSAGE);
  let envoyes = 0;
  const directs: string[] = [];
  for (const p of pretes) {
    const r = await envoyer(p.id);
    if (r.envoyee) envoyes++;
    if (r.direct) directs.push(r.direct);
  }
  return { envoyes, directs };
}

/**
 * Les lots chez le prestataire, un à un : fini, il est relevé (releverLeLot) ; disparu, sa mise à jour part en direct ;
 * en cours depuis plus de LOT_AU_PLUS_S, ou sans sa tâche (partie en direct, effacée avec sa conv), il est annulé (et
 * relevé quand il aura fini, pour être effacé).
 */
async function releverLesLots(): Promise<{ lus: number; annules: number; directs: string[] }> {
  const enVol = await db()
    .select({ id: schema.lots.id, envoyeLe: schema.lots.envoyeLe, annuleLe: schema.lots.annuleLe, tache: t.id, statut: t.status })
    .from(schema.lots)
    .leftJoin(t, eq(t.id, schema.lots.tacheId));
  let lus = 0;
  let annules = 0;
  const directs: string[] = [];
  if (!enVol.length) return { lus, annules, directs };
  const ia = await claude();
  for (const l of enVol) {
    try {
      const etat = await ia.etatDuLot(l.id);
      const enLot = l.statut === "lot" && l.tache ? l.tache : null;
      if (etat === "fini") {
        const d = await releverLeLot(l.id);
        if (d) {
          lus++;
          directs.push(...d);
        }
      } else if (etat === "introuvable") {
        await db().delete(schema.lots).where(eq(schema.lots.id, l.id));
        const d = enLot && (await versLeDirect(enLot, "lot", "lot:introuvable"));
        if (d) directs.push(d);
      } else if (!l.annuleLe && Date.now() - l.envoyeLe.getTime() > (enLot ? LOT_AU_PLUS_S : GRACE_S) * 1000) {
        await annuler(l.id);
        annules++;
        const d = enLot && (await versLeDirect(enLot, "lot", "lot:delai"));
        if (d) directs.push(d);
      }
    } catch (e) {
      journalErreur("lot non relevé", e, { lot: l.id });
    }
  }
  return { lus, annules, directs };
}

/**
 * Au passage des 5 minutes : les lots relevés d’abord (une réponse revenue laisse partir la mise à jour suivante de sa
 * conv), puis les mises à jour calmées envoyées (seulement avec BLUSH_MEMOIRE_EN_LOT : éteint, les lots déjà partis sont
 * encore relevés). Celles qui partent en direct le font chacune dans sa fonction (le relais). Des nombres seulement.
 */
export async function traiterLesLots(): Promise<{ envoyes: number; lus: number; annules: number }> {
  const releves = await releverLesLots();
  const envois = await envoyerLesMajEnLot();
  await Promise.all([...new Set([...releves.directs, ...envois.directs])].map((id) => passerLaMain(id, 1)));
  return { envoyes: envois.envoyes, lus: releves.lus, annules: releves.annules };
}
