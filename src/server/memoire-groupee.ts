import "server-only";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Echange } from "@prompts/lib/memoire";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { memoireEnLot } from "./env";
import { echangesDepuisLeLot, rapatrier } from "./memoire-en-lot";

/*
 * La mise à jour de la mémoire, groupée. Avant le 22 octobre 2026, chaque échange du chat qui apportait du neuf lançait
 * sa propre mise à jour (memoire_maj, un appel au modèle), qui disait le plus souvent « rien de neuf » ; et chaque
 * mémoire réécrite changeait le bloc que le chat met en cache (l’histoire, les chiffres, la mémoire) : le message
 * suivant payait une écriture du cache au lieu d’une lecture. Désormais, les échanges s’ajoutent à une seule tâche en
 * attente par conv, qui part quand le chat se calme (CALME_S sans nouvel échange), au plus tard au ECHANGES_PAR_MAJ-ième,
 * ou tout de suite quand l’échange l’exige (`maintenant`). En attendant, le chat ne perd rien : il relit ses derniers
 * échanges (le fil, src/server/chat.ts), plus nombreux que ceux qu’une mise à jour attend, et les messages qu’ils ont
 * ajoutés. Ouvrir sa fiche la fait partir aussi (sansAttendre, par ses routes) : la fiche qu’il regarde est à jour.
 * Celle qui part au calme peut partir en lot (src/server/memoire-en-lot.ts, BLUSH_MEMOIRE_EN_LOT) : tant que sa réponse
 * n’est pas revenue, ses échanges et tous ceux d’après comptent ensemble (echangesDepuisLeLot), et ce qui ne peut pas
 * attendre la rapatrie (rapatrier) ; sa réponse déjà là, la mémoire a rattrapé le fil, et ce qui ne partait que pour elle
 * reprend son calme.
 */

/** Sans nouvel échange pendant ce temps, le chat est calme : la mise à jour part (le passage des 5 minutes la prend). */
export const CALME_S = 600;

/**
 * Au plus ce nombre d’échanges par mise à jour : celle qui l’atteint part tout de suite. Moins que les échanges que le
 * fil du chat relit (ECHANGES_DANS_LE_FIL, src/server/chat.ts) : il les voit tous, et un de plus le temps qu’elle s’écrive.
 */
export const ECHANGES_PAR_MAJ = 5;

/**
 * La mise à jour part-elle tout de suite ? L’échange l’exige (`maintenant`), elle a ses ECHANGES_PAR_MAJ échanges (ou
 * autant depuis un lot en vol, retenir), ou elle devait déjà partir (`due` : déjà partie, ou, sans la mémoire en lot, son
 * heure passée : le chat s’était calmé, le passage des 5 minutes ne l’a pas encore prise).
 */
export const partTout = (echanges: number, { maintenant, due }: { maintenant: boolean; due: boolean }) => maintenant || due || echanges >= ECHANGES_PAR_MAJ;

/**
 * Une mise à jour qui attend le calme : en attente, avec son heure (`pas_avant`), venue ou non. Venue, elle attend encore
 * le passage des 5 minutes (qui la lance, ou l’envoie en lot).
 */
const auCalme = () => and(eq(schema.tasks.status, "attente"), isNotNull(schema.tasks.pasAvant));

/**
 * Retient un échange pour la mémoire. Il rejoint la mise à jour qui attend (jamais prise : en attente, sans essai), ou en
 * ouvre une s’il apporte du neuf (`neuf` ; sinon, sans mise à jour qui attend, il n’y a rien à retenir). Elle part tout
 * de suite (`part` : la chaîne est à relancer) si l’échange l’exige (`maintenant`), si elle atteint ECHANGES_PAR_MAJ
 * échanges, ou si elle devait déjà partir ; sinon, son départ recule de CALME_S. Le verrou de la conv : deux échanges en
 * même temps ne s’écrasent pas, et n’ouvrent pas deux mises à jour. `prendre` (src/server/taches.ts) ne prend la tâche
 * qu’une fois écrite : un échange arrivé après rejoint la suivante.
 * Avec la mémoire en lot, une heure passée ne la fait plus partir en direct : elle la garde (le passage des 5 minutes
 * l’envoie en lot, cet échange avec), au lieu de reculer de CALME_S : la séance d’avant ne glisse pas hors du fil.
 * Un lot en vol (src/server/memoire-en-lot.ts) : ses échanges ne sont pas encore dans la mémoire, et le fil du chat les
 * relit avec tous ceux d’après, retenus ou non (un échange sans neuf ne se retient pas). Ils comptent donc tous : au
 * ECHANGES_PAR_MAJ-ième depuis le lot, comme sur un niveau ou un ajout, le lot est rapatrié (rapatrier : sa réponse
 * appliquée s’il a fini, sinon il part en direct avec ceux qui attendent). Sa réponse appliquée, la mémoire a rattrapé le
 * fil : une mise à jour qui ne partait que pour le lot (ni `maintenant`, ni ses ECHANGES_PAR_MAJ échanges à elle) reprend
 * son calme, au lieu de partir en direct pour un ou deux échanges.
 */
export async function retenir(storyId: string, echange: Echange, { neuf, maintenant }: { neuf: boolean; maintenant: boolean }): Promise<{ id: string | null; part: boolean }> {
  const depuisLeLot = await echangesDepuisLeLot(storyId);
  const r = await garder(storyId, echange, { neuf, maintenant, depuisLeLot });
  if (!r.part || !depuisLeLot) return { id: r.id, part: r.part };
  if ((await rapatrier(storyId)) !== "appliquee" || r.urgente) return { id: r.id, part: true };
  if (r.id) await reprendreSonCalme(r.id);
  return { id: r.id, part: false };
}

/**
 * L’échange gardé (retenir), sous le verrou de la conv : `depuisLeLot`, les échanges du fil depuis un lot en vol (0 sans
 * lot). `urgente` : elle part pour elle-même, lot ou non.
 */
function garder(storyId: string, echange: Echange, { neuf, maintenant, depuisLeLot }: { neuf: boolean; maintenant: boolean; depuisLeLot: number }) {
  return db().transaction(async (tx): Promise<{ id: string | null; part: boolean; urgente: boolean }> => {
    await tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");
    const [attend] = await tx
      .select({
        id: schema.tasks.id,
        input: schema.tasks.input,
        /* Déjà partie (sans heure : elle attend seulement que la chaîne la prenne), ou son heure passée */
        partie: sql<boolean>`${schema.tasks.pasAvant} is null`,
        due: sql<boolean>`${schema.tasks.pasAvant} <= now()`,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), eq(schema.tasks.status, "attente"), eq(schema.tasks.attempts, 0)))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(1)
      .for("update");
    /* Rien à retenir ; mais avec un lot en vol, l’échange compte (son ECHANGES_PAR_MAJ-ième le rapatrie) */
    if (!attend && !neuf) return { id: null, part: depuisLeLot >= ECHANGES_PAR_MAJ, urgente: false };
    const echanges = [...(attend?.input ? coffre.lire("tasks.input", attend.input) : []), echange];
    /* Une mise à jour déjà partie le reste ; une heure passée la fait partir, sauf si le passage des 5 minutes l’envoie en lot */
    const enLot = memoireEnLot();
    const due = !!attend && (attend.partie || (attend.due && !enLot));
    const urgente = partTout(echanges.length, { maintenant, due });
    const part = urgente || depuisLeLot >= ECHANGES_PAR_MAJ;
    /* En lot, une heure passée reste passée : le passage suivant l’envoie, cet échange avec */
    const garderSonHeure = !part && !!attend?.due && enLot;
    const valeurs = {
      input: coffre.ecrire("tasks.input", echanges),
      ...(part ? { pasAvant: null } : garderSonHeure ? {} : { pasAvant: sql`now() + make_interval(secs => ${CALME_S})` }),
    };
    if (attend) {
      await tx
        .update(schema.tasks)
        .set({ ...valeurs, updatedAt: new Date() })
        .where(eq(schema.tasks.id, attend.id));
      return { id: attend.id, part, urgente };
    }
    const [t] = await tx
      .insert(schema.tasks)
      .values({ storyId, kind: "memoire_maj", ...valeurs })
      .returning({ id: schema.tasks.id });
    return { id: t?.id ?? null, part, urgente };
  });
}

/** La mise à jour, partie pour le lot seul (retenir), attend de nouveau que le chat se calme : si personne ne l’a prise. */
async function reprendreSonCalme(id: string): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ pasAvant: sql`now() + make_interval(secs => ${CALME_S})`, updatedAt: new Date() })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.status, "attente"), eq(schema.tasks.attempts, 0), isNull(schema.tasks.pasAvant)));
}

/** Une mise à jour attend-elle le calme, ou la réponse de son lot ? Rien ne part pour le savoir (la page de sa fiche). */
export async function majQuiAttend(storyId: string): Promise<boolean> {
  const [t] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), or(auCalme(), eq(schema.tasks.status, "lot"))))
    .limit(1);
  return !!t;
}

/**
 * La mise à jour qui attend le calme part sans attendre (sa fiche s’ouvre), et celle partie en lot est rapatriée (sa
 * réponse si elle est là, sinon le direct). Vrai si une mise à jour en part.
 */
export async function sansAttendre(storyId: string): Promise<boolean> {
  const lot = await rapatrier(storyId);
  const parties = await db()
    .update(schema.tasks)
    .set({ pasAvant: null, updatedAt: new Date() })
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), auCalme()))
    .returning({ id: schema.tasks.id });
  return lot === "direct" || parties.length > 0;
}
