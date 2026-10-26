import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppKind, TypeDImport } from "@/types";
import { empreinte, jeton } from "./chiffrement";
import { db, schema } from "./db";
import { auMieux } from "./journal";

/*
 * La mesure des imports (/admin, « L’IA avant l’achat ») : ce que coûte une conv avant que la personne paie, selon
 * comment elle est arrivée. Une ligne par conv importée (imports) : son type (un export, des captures, une vidéo), son
 * appli, ses écrans et ses lots lus, et l’empreinte de son envoi. Rien de son contenu, ni compte, ni email.
 *
 * Ce qu’elle a coûté : les lectures d’avant l’import (des captures, les lots d’un enregistrement) se notent dans
 * ai_usage sous l’empreinte de leur envoi (`envoi`, envoiDe : la clé que le navigateur tire pour l’envoi, jamais
 * gardée telle quelle), dès l’appel au modèle (src/server/ia/claude.ts). L’import qui en naît garde la même empreinte, et
 * relie ces lignes à sa conv (ai_usage.story_id, que les captures n’avaient pas) : /admin additionne par l’empreinte, une
 * ligne notée après l’import comprise. Une lecture dont aucun import ne garde l’empreinte (un enregistrement abandonné,
 * des captures refusées) a été lue pour rien : /admin la compte à part. Un morceau ajouté avant « Qui es-tu ? »
 * (src/server/morceaux.ts) range ses lectures sous l’empreinte de sa conv, et ajoute ses écrans et ses lots aux siens :
 * la conv garde le type de son premier envoi.
 *
 * Ce qu’elle devient (le paywall, le paiement) se lit par sa conv, au moment du calcul (src/server/stats.ts). La mesure ne
 * fait jamais échouer un import (auMieux) ; une prise du mode tournage, qui ne lit rien, n’en a pas.
 */

/** Combien de jours on garde la mesure d’un import : comme les jalons du tunnel (la purge de la nuit, src/server/purge.ts). */
export const IMPORTS_GARDES_JOURS = 90;

/**
 * L’empreinte de l’envoi d’un import, d’après sa clé (venue du navigateur, déjà vérifiée par cleEnvoi) : ce que gardent
 * ai_usage et imports, jamais la clé, qui sert aussi à reprendre l’envoi (src/server/captures.ts). null sans clé.
 */
export const envoiDe = (cle: string | null): string | null => (cle ? empreinte(`mesure:${cle}`) : null);

/** Comme envoiDe, mais un envoi sans clé (un onglet d’avant la clé) en reçoit une à lui : sa lecture se range sous son import. */
export const envoiOuNouveau = (cle: string | null): string => empreinte(`mesure:${cle ?? jeton()}`);

/** Un import à noter : sa conv, comment elle est arrivée, ce que le modèle en a lu, et l’empreinte de son envoi (null : un export, ou sans clé). */
type Import = { storyId: string; type: TypeDImport; appli: AppKind; ecrans: number; lots: number; envoi: string | null };

/**
 * Note une conv tout juste importée (la première fois seulement : un nouvel essai du même envoi retrouve sa ligne), et
 * relie à elle les lectures de son envoi. Sans empreinte (un export, un envoi sans clé), une empreinte à elle, que
 * rien ne retrouve dans ai_usage. Ne lève jamais.
 */
export async function noterImport({ storyId, type, appli, ecrans, lots, envoi }: Import): Promise<void> {
  await auMieux(
    async () => {
      const e = envoi ?? envoiOuNouveau(null);
      await db().insert(schema.imports).values({ storyId, envoi: e, type, appli, ecrans, lots }).onConflictDoNothing();
      if (envoi) await relier(envoi, { storyId, envoi: e });
    },
    "import non mesuré",
    { type },
  );
}

/**
 * Un morceau ajouté à une conv (avant « Qui es-tu ? ») : ses écrans et ses lots s’ajoutent aux siens, et ses lectures
 * passent sous l’empreinte de la conv. Une conv sans mesure (importée avant elle) ne relie que ses lectures. Ne lève jamais.
 */
export async function noterAjout(storyId: string, { ecrans, lots, envoi }: Pick<Import, "ecrans" | "lots" | "envoi">): Promise<void> {
  await auMieux(async () => {
    const [ligne] = await db()
      .update(schema.imports)
      .set({ ecrans: sql`${schema.imports.ecrans} + ${ecrans}`, lots: sql`${schema.imports.lots} + ${lots}` })
      .where(eq(schema.imports.storyId, storyId))
      .returning({ envoi: schema.imports.envoi });
    if (envoi) await relier(envoi, { storyId, envoi: ligne?.envoi ?? envoi });
  }, "morceau non mesuré");
}

/** Les lectures de l’envoi `de`, rangées sous la conv et l’empreinte de son import (`envoi`, la même pour un premier envoi). */
async function relier(de: string, { storyId, envoi }: { storyId: string; envoi: string }): Promise<void> {
  await db()
    .update(schema.aiUsage)
    .set({ storyId, envoi })
    .where(and(eq(schema.aiUsage.envoi, de), isNull(schema.aiUsage.storyId)));
}
