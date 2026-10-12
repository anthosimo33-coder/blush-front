/*
 * Ce que les fixtures (tests/aide/fixtures.ts) créent dans la base pendant un fichier de tests : effacé à la fin du
 * fichier par tests/aide/isolation.ts, que ses tests passent ou non. Chaque fichier a son registre : vitest isole les
 * modules d’un fichier à l’autre, et le fichier d’installation partage ceux du fichier qu’il précède.
 */
export const creees = { comptes: [] as string[], histoires: [] as string[] };

/** Efface les comptes créés (en cascade, leurs convs, leurs sessions…), puis les brouillons restés sans compte. */
export async function effacerCeQuiAEteCree(): Promise<void> {
  const comptes = creees.comptes.splice(0);
  const histoires = creees.histoires.splice(0);
  if (!comptes.length && !histoires.length) return;
  /*
   * La base n’est importée qu’ici, après les tests : importée par le fichier d’installation, avant le fichier de tests,
   * elle aurait gardé les vrais modules (src/server/env…) que ses vi.mock remplacent.
   */
  const [{ inArray }, { db, schema }] = await Promise.all([import("drizzle-orm"), import("@/server/db")]);
  /* Un compte effacé laisse ses achats sans compte (les ventes) : ceux des tests partent avec lui */
  if (comptes.length) await db().delete(schema.achats).where(inArray(schema.achats.userId, comptes));
  if (comptes.length) await db().delete(schema.users).where(inArray(schema.users.id, comptes));
  if (histoires.length) await db().delete(schema.stories).where(inArray(schema.stories.id, histoires));
}
