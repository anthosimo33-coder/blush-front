import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Echange } from "@prompts/lib/memoire";
import * as coffre from "./coffre";
import { db, schema } from "./db";

/*
 * La mise à jour de la mémoire, groupée. Avant le 22 octobre 2026, chaque échange du chat qui apportait du neuf lançait
 * sa propre mise à jour (memoire_maj, un appel au modèle), qui disait le plus souvent « rien de neuf » ; et chaque
 * mémoire réécrite changeait le bloc que le chat met en cache (l’histoire, les chiffres, la mémoire) : le message
 * suivant payait une écriture du cache au lieu d’une lecture. Désormais, les échanges s’ajoutent à une seule tâche en
 * attente par conv, qui part quand le chat se calme (CALME_S sans nouvel échange), au plus tard au ECHANGES_PAR_MAJ-ième,
 * ou tout de suite quand l’échange l’exige (`maintenant`). En attendant, le chat ne perd rien : il relit ses derniers
 * échanges (le fil, src/server/chat.ts), plus nombreux que ceux qu’une mise à jour attend, et les messages qu’ils ont
 * ajoutés. Ouvrir sa fiche la fait partir aussi (sansAttendre, par ses routes) : la fiche qu’il regarde est à jour.
 */

/** Sans nouvel échange pendant ce temps, le chat est calme : la mise à jour part (le passage des 5 minutes la prend). */
export const CALME_S = 600;

/**
 * Au plus ce nombre d’échanges par mise à jour : celle qui l’atteint part tout de suite. Moins que les échanges que le
 * fil du chat relit (ECHANGES_DANS_LE_FIL, src/server/chat.ts) : il les voit tous, et un de plus le temps qu’elle s’écrive.
 */
export const ECHANGES_PAR_MAJ = 5;

/**
 * La mise à jour part-elle tout de suite ? L’échange l’exige (`maintenant`), elle a ses ECHANGES_PAR_MAJ échanges, ou
 * son heure était déjà passée (`due` : le chat s’était calmé, le passage des 5 minutes ne l’a pas encore prise).
 */
export const partTout = (echanges: number, { maintenant, due }: { maintenant: boolean; due: boolean }) => maintenant || due || echanges >= ECHANGES_PAR_MAJ;

/** Une mise à jour qui attend que le chat se calme : en attente, pas encore à prendre. */
const differee = () => and(eq(schema.tasks.status, "attente"), gt(schema.tasks.pasAvant, sql`now()`));

/**
 * Retient un échange pour la mémoire. Il rejoint la mise à jour qui attend (jamais prise : en attente, sans essai), ou en
 * ouvre une s’il apporte du neuf (`neuf` ; sinon, sans mise à jour qui attend, il n’y a rien à retenir). Elle part tout
 * de suite (`part` : la chaîne est à relancer) si l’échange l’exige (`maintenant`), si elle atteint ECHANGES_PAR_MAJ
 * échanges, ou si son heure était déjà passée ; sinon, son départ recule de CALME_S. Le verrou de la conv : deux échanges
 * en même temps ne s’écrasent pas, et n’ouvrent pas deux mises à jour. `prendre` (src/server/taches.ts) ne prend la tâche
 * qu’une fois écrite : un échange arrivé après rejoint la suivante.
 */
export async function retenir(storyId: string, echange: Echange, { neuf, maintenant }: { neuf: boolean; maintenant: boolean }): Promise<{ id: string | null; part: boolean }> {
  return db().transaction(async (tx) => {
    await tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");
    const [attend] = await tx
      .select({ id: schema.tasks.id, input: schema.tasks.input, due: sql<boolean>`${schema.tasks.pasAvant} is null or ${schema.tasks.pasAvant} <= now()` })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), eq(schema.tasks.status, "attente"), eq(schema.tasks.attempts, 0)))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(1)
      .for("update");
    if (!attend && !neuf) return { id: null, part: false };
    const echanges = [...(attend?.input ? coffre.lire("tasks.input", attend.input) : []), echange];
    const part = partTout(echanges.length, { maintenant, due: !!attend?.due });
    const valeurs = { input: coffre.ecrire("tasks.input", echanges), pasAvant: part ? null : sql`now() + make_interval(secs => ${CALME_S})` };
    if (attend) {
      await tx
        .update(schema.tasks)
        .set({ ...valeurs, updatedAt: new Date() })
        .where(eq(schema.tasks.id, attend.id));
      return { id: attend.id, part };
    }
    const [t] = await tx
      .insert(schema.tasks)
      .values({ storyId, kind: "memoire_maj", ...valeurs })
      .returning({ id: schema.tasks.id });
    return { id: t?.id ?? null, part };
  });
}

/** Une mise à jour attend-elle que le chat se calme ? */
export async function majQuiAttend(storyId: string): Promise<boolean> {
  const [t] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), differee()))
    .limit(1);
  return !!t;
}

/** La mise à jour qui attend que le chat se calme part sans attendre (sa fiche s’ouvre). Vrai s’il y en avait une. */
export async function sansAttendre(storyId: string): Promise<boolean> {
  const parties = await db()
    .update(schema.tasks)
    .set({ pasAvant: null, updatedAt: new Date() })
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), differee()))
    .returning({ id: schema.tasks.id });
  return parties.length > 0;
}
