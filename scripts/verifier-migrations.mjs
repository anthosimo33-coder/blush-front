#!/usr/bin/env node
/*
 * Avant chaque build et chaque `npm test` : les migrations de drizzle/ sont-elles cohérentes ? La production les applique
 * au build (scripts/migrer.mjs), dans l’ordre du journal, et drizzle n’applique qu’une migration plus récente (`when`) que
 * la dernière passée : une migration mal rangée serait sautée sans un mot. Le build échoue plutôt.
 *   1. drizzle/meta/_journal.json : des idx qui se suivent (0, 1, 2…), des `when` strictement croissants, chaque tag
 *      préfixé de son numéro, son .sql et son instantané (meta/NNNN_snapshot.json) présents ;
 *   2. aucun .sql ni instantané hors du journal (drizzle ne l’appliquerait jamais) ;
 *   3. `drizzle-kit check` : les instantanés s’enchaînent sans collision (deux branches qui ont chacune généré la sienne) ;
 *   4. `drizzle-kit generate`, sur une copie du dossier : schema.ts ne demande aucune migration de plus. Sinon, un
 *      changement de schéma sans sa migration (une liste de src/server/db/enums.ts qui change l’index unique
 *      tasks_une_par_etape) passerait les tests, dont les bases sont migrées depuis drizzle/, et la production garderait
 *      l’ancien.
 * `node scripts/verifier-migrations.mjs [dossier]` : un autre dossier que drizzle/ (les tests du script).
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = resolve(process.argv[2] ?? join(RACINE, "drizzle"));

function arreter(problemes) {
  console.error(`✗ Migrations incohérentes dans ${DOSSIER} :\n${problemes.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

/* 1. Le journal */
let journal;
try {
  journal = JSON.parse(readFileSync(join(DOSSIER, "meta/_journal.json"), "utf8"));
} catch (e) {
  arreter([`meta/_journal.json illisible : ${e.message}`]);
}
const entrees = Array.isArray(journal?.entries) ? journal.entries : null;
if (!entrees?.length) arreter(["meta/_journal.json n’a aucune migration (entries)"]);

const problemes = [];
const numero = (idx) => String(idx).padStart(4, "0");
entrees.forEach((e, i) => {
  const nom = `la migration n° ${i} (${e.tag ?? "sans tag"})`;
  if (e.idx !== i) problemes.push(`${nom} a l’idx ${e.idx} : les idx doivent se suivre depuis 0`);
  if (!Number.isInteger(e.when)) problemes.push(`${nom} n’a pas de \`when\``);
  else if (i > 0 && !(e.when > entrees[i - 1].when))
    problemes.push(`${nom} a un \`when\` (${e.when}) qui n’est pas après celui de la précédente (${entrees[i - 1].when}) : drizzle la sauterait en production`);
  if (typeof e.tag !== "string" || !e.tag.startsWith(`${numero(i)}_`)) problemes.push(`${nom} : son tag doit commencer par ${numero(i)}_`);
  else if (!existsSync(join(DOSSIER, `${e.tag}.sql`))) problemes.push(`${nom} : ${e.tag}.sql manque`);
  if (!existsSync(join(DOSSIER, "meta", `${numero(i)}_snapshot.json`))) problemes.push(`${nom} : meta/${numero(i)}_snapshot.json manque`);
});

/* 2. Rien hors du journal */
const tags = new Set(entrees.map((e) => e.tag));
for (const f of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")))
  if (!tags.has(f.slice(0, -4))) problemes.push(`${f} n’est pas dans le journal : drizzle ne l’appliquerait jamais (npx drizzle-kit generate la range)`);
for (const f of readdirSync(join(DOSSIER, "meta")).filter((f) => f.endsWith("_snapshot.json")))
  if (Number(f.slice(0, 4)) >= entrees.length) problemes.push(`meta/${f} n’a pas de migration dans le journal`);
if (problemes.length) arreter(problemes);

/* 3. drizzle-kit check (sans drizzle.config.ts : le dialecte et le dossier suffisent ; il veut un chemin relatif) */
const bin = join(RACINE, "node_modules/drizzle-kit/bin.cjs");
const check = spawnSync(process.execPath, [bin, "check", "--dialect", "postgresql", "--out", basename(DOSSIER)], { cwd: dirname(DOSSIER), encoding: "utf8" });
if (check.status !== 0) arreter([`drizzle-kit check a échoué :\n${`${check.stdout ?? ""}${check.stderr ?? ""}`.trim()}`]);

/* 4. drizzle-kit generate sur une copie : il ne doit rien trouver à migrer (la copie est effacée avant de s’arrêter) */
const copie = mkdtempSync(join(tmpdir(), "blush-generer-"));
const manque = (() => {
  try {
    cpSync(DOSSIER, join(copie, "drizzle"), { recursive: true });
    const schema = join(RACINE, "src/server/db/schema.ts");
    /* Sans entrée : une question (un renommage ?) échoue au lieu d’attendre une réponse */
    const gen = spawnSync(process.execPath, [bin, "generate", "--dialect", "postgresql", "--schema", schema, "--out", "drizzle"], {
      cwd: copie,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    const sortie = `${gen.stdout ?? ""}${gen.stderr ?? ""}`.trim();
    const nouvelles = readdirSync(join(copie, "drizzle")).filter((f) => f.endsWith(".sql") && !existsSync(join(DOSSIER, f)));
    if (nouvelles.length)
      return `schema.ts a changé sans sa migration : \`npm run db:generer\` l’écrit dans drizzle/. drizzle-kit generate propose :\n${nouvelles.map((f) => readFileSync(join(copie, "drizzle", f), "utf8").trim()).join("\n")}`;
    if (gen.status !== 0 || !sortie.includes("No schema changes"))
      return `drizzle-kit generate n’a pas pu comparer schema.ts aux migrations (\`npm run db:generer\` le refait) :\n${sortie || gen.error?.message || "aucune sortie"}`;
    return null;
  } finally {
    rmSync(copie, { recursive: true, force: true });
  }
})();
if (manque) arreter([manque]);

console.log(`✓ Migrations cohérentes : ${entrees.length} dans le journal, de ${entrees[0].tag} à ${entrees.at(-1).tag}.`);
