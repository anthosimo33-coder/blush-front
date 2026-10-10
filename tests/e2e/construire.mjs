#!/usr/bin/env node
/*
 * `npm run e2e:build` : le build de production que servent les tests de bout en bout, puis sa marque
 * (.next/e2e-build.json). Le serveur des tests (tests/e2e/serveur.mjs) refuse tout autre build : un build refait depuis
 * autrement (un simple `npm run build`, qui verrait Vercel, la base ou la bêta fermée du shell).
 * Ni Vercel, ni base, ni bêta fermée au build : `prebuild` ne migre aucune base (scripts/migrer.mjs), et les pages
 * prérendues sont celles de la bêta ouverte.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
for (const cle of ["VERCEL", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "BLUSH_BETA_FERMEE"]) delete env[cle];

const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: RACINE, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const buildId = readFileSync(join(RACINE, ".next/BUILD_ID"), "utf8").trim();
writeFileSync(join(RACINE, ".next/e2e-build.json"), `${JSON.stringify({ buildId, fait: new Date().toISOString() }, null, 2)}\n`);
console.log(`✓ build des tests de bout en bout prêt (${buildId})`);
