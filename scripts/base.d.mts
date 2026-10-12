/*
 * Les types de scripts/base.mjs, pour le TypeScript qui l’importe (drizzle.config.ts, scripts/acces.mts,
 * src/server/db/index.ts, tests/verifier-migrations.test.ts, tests/unit/db-url.test.ts) : sans allowJs, tsc ne lit plus un .mjs. Le script reste en JavaScript (node le
 * lance sans compiler, au build) ; ces déclarations se tiennent à la main, à côté de lui, et changent avec lui.
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms, les fonctions en
 * fonctions ; les signatures, elles, se relisent à la main.
 */

/** L’URL vise-t-elle le Postgres de la machine (ou un socket local) ? */
export function estLocale(url: string): boolean;

/** Le réglage TLS d’une connexion postgres.js (S-36) : rien en local, sinon un certificat vérifié (`verify-full`). */
export function sslPour(url: string): false | "verify-full";

/** La même règle écrite dans l’URL (`sslmode=verify-full`), pour ce qui ne prend qu’une URL : drizzle-kit, le pool pg de l’appli. */
export function urlVerifiee(url: string): string;

/**
 * Les migrations du journal (drizzle/meta/_journal.json, ses `entries`) que drizzle sauterait sans un mot : plus
 * anciennes (`when`) que la dernière appliquée à la base, sans l’avoir été elles-mêmes. `appliquees` : les
 * `created_at` de la table drizzle.__drizzle_migrations.
 */
export function migrationsSautees<E extends { when: number }>(entrees: readonly E[], appliquees: readonly number[]): E[];

/** Les bulles données aux testeurs de la bêta (BULLES_DE_LA_BETA de src/contenu/offres.ts, recopié). */
export const BULLES_DE_LA_BETA: number;

/** Le rattrapage des testeurs de la bêta, en une requête qui se rejoue sans effet : ce qu’il a servi (testeurs, convs). */
export const RATTRAPAGE_BETA: string;

/** Passe les rattrapages sur une base déjà migrée (`client` : postgres.js), et dit ce qu’ils ont fait. */
export function rattraper(client: { unsafe: (requete: string) => PromiseLike<readonly unknown[]> }): Promise<{ testeurs: number; convs: number }>;
