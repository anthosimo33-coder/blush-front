import "server-only";
import { and, eq, sql } from "drizzle-orm";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { DonneesMemoire, DonneesRapport, DonneesVerdict } from "./stockage/types";

/*
 * Le dépôt : les lectures et les écritures de la base que plusieurs modules partagent, ou qu’une route ferait sinon
 * elle-même. Les routes /api n’importent ni la base (src/server/db) ni drizzle-orm : elles passent par ici, par le
 * coffre ou par les modules de leur domaine (eslint.config.mjs). Chaque lecture déchiffre par le coffre
 * (src/server/coffre.ts), qui sait ce que garde chaque colonne.
 * Ici, la base telle qu’elle est : ce qu’on en tire pour un écran est dans donnees.ts, et les comptes dans comptes.ts.
 */

/* ———— Les prédicats communs ———— */

/**
 * Les conditions sur une conv (la table stories) que plusieurs requêtes posent, écrites une fois. Elles se glissent
 * dans un `where`, ou dans un `select` pour `convGardee`.
 */
export const PREDICATS = {
  /** Cette conv, si elle est à ce compte : jamais une conv désignée par son seul identifiant (l’IDOR). */
  convDuCompte: (id: string, userId: string) => and(eq(schema.stories.id, id), eq(schema.stories.userId, userId)),
  /** La conv a été lue (sa lecture lancée) : les tâches restent après coup, leur présence suffit. */
  lue: sql<boolean>`exists (select 1 from ${schema.tasks} where ${schema.tasks.storyId} = ${schema.stories.id})`,
  /** La conv brute n’a pas été effacée (après la mémoire, ou par la purge). */
  convGardee: sql<boolean>`${schema.stories.conv} is not null`,
  /** Le rapport de la conv est assemblé (pas seulement son plan ou ses chapitres en cours). */
  rapportPret: sql<boolean>`exists (select 1 from ${schema.reports} where ${schema.reports.storyId} = ${schema.stories.id} and ${schema.reports.data} is not null)`,
};

/* ———— Le verdict, le rapport, la mémoire ———— */

/** Le verdict de la conv (prompt 04, et ses scores), déchiffré, ou null : sa lecture n’est pas finie. */
export async function donneesVerdict(storyId: string): Promise<DonneesVerdict | null> {
  const [v] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  return v ? coffre.lire("verdicts.data", v.data) : null;
}

/** La ligne du rapport, encore chiffrée (son plan, le rapport assemblé, les chapitres finis), ou null : rien d’écrit. */
export async function ligneRapport(storyId: string): Promise<typeof schema.reports.$inferSelect | null> {
  const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, storyId));
  return r ?? null;
}

/**
 * Les chapitres qu’on peut déjà lire : ceux du rapport assemblé, ou pendant son écriture ceux déjà finis (`partiel`).
 * Sans tri ni contrôle d’accès : à l’appelant de dire ce qu’il en montre.
 */
export async function chapitresEcrits(storyId: string): Promise<DonneesRapport["chapitres"]> {
  const r = await ligneRapport(storyId);
  if (r?.data) return coffre.lire("reports.data", r.data).chapitres;
  return r?.partiel ? coffre.lire("reports.partiel", r.partiel) : [];
}

/** La mémoire de la conv (prompt 07 : sa fiche, les messages qu’elle cite), déchiffrée, ou null : pas encore écrite. */
export async function donneesMemoire(storyId: string): Promise<DonneesMemoire | null> {
  const [m] = await db().select({ data: schema.memories.data }).from(schema.memories).where(eq(schema.memories.storyId, storyId));
  return m ? coffre.lire("memories.data", m.data) : null;
}

/**
 * Ce que rend une modification de la mémoire (modifierMemoire) : écrite ; inchangée (la modification n’avait rien à
 * écrire) ; absente (pas encore de mémoire) ; occupée (une autre écriture est passée avant chaque essai).
 */
export type Modification = "ecrite" | "inchangee" | "absente" | "occupee";

/**
 * La boucle d’écriture optimiste, sans la base : lit la valeur et sa version, la fait modifier, puis n’écrit que si
 * personne n’a écrit entre-temps (`ecrire` rend false si la version a changé) ; sinon recommence sur la nouvelle, au plus
 * `essais` fois. `modifier` rend null quand il n’y a rien à écrire.
 */
export async function ecrireSurCeQuiAEteLu<T>(
  { lire, ecrire }: { lire: () => Promise<{ valeur: T; version: number } | null>; ecrire: (valeur: T, version: number) => Promise<boolean> },
  modifier: (avant: T) => T | null | Promise<T | null>,
  essais: number,
): Promise<Modification> {
  for (let essai = 0; essai < essais; essai++) {
    const lu = await lire();
    if (!lu) return "absente";
    const apres = await modifier(lu.valeur);
    if (apres === null) return "inchangee";
    if (await ecrire(apres, lu.version)) return "ecrite";
  }
  return "occupee";
}

/**
 * Modifie la mémoire de la conv sans rien effacer de ce qu’une autre écriture vient d’y mettre : la modification se fait
 * sur la mémoire lue, et ne s’écrit que si sa version n’a pas changé ; sinon elle se refait sur la nouvelle, au plus
 * `essais` fois. Ses écrivains : la mise à jour après le chat (src/server/analyse.ts, memoireMaj : elle appelle le
 * modèle, 20 à 60 s), la fiche corrigée à la main (PUT /api/fiche), et le chat, qui y note l’alerte d’une réponse
 * (src/server/chat.ts, noterLAlerte).
 */
export function modifierMemoire(
  storyId: string,
  modifier: (avant: DonneesMemoire) => DonneesMemoire | null | Promise<DonneesMemoire | null>,
  { essais }: { essais: number },
): Promise<Modification> {
  const m = schema.memories;
  return ecrireSurCeQuiAEteLu(
    {
      lire: async () => {
        const [ligne] = await db().select({ data: m.data, version: m.version }).from(m).where(eq(m.storyId, storyId));
        return ligne ? { valeur: coffre.lire("memories.data", ligne.data), version: ligne.version } : null;
      },
      ecrire: async (donnees, version) => {
        const ecrite = await db()
          .update(m)
          .set({ data: coffre.ecrire("memories.data", donnees), version: version + 1, updatedAt: new Date() })
          .where(and(eq(m.storyId, storyId), eq(m.version, version)))
          .returning({ version: m.version });
        return ecrite.length > 0;
      },
    },
    modifier,
    essais,
  );
}

/* ———— Les convs ———— */

/** Cette conv est-elle à ce compte ? */
export async function estConvDuCompte(id: string, userId: string): Promise<boolean> {
  const [s] = await db().select({ id: schema.stories.id }).from(schema.stories).where(PREDICATS.convDuCompte(id, userId));
  return !!s;
}

/* ———— La base elle-même ———— */

/** Une requête minuscule, pour réveiller la base (Neon s’endort après quelques minutes sans requête). */
export async function reveillerLaBase(): Promise<void> {
  await db().execute(sql`select 1`);
}
