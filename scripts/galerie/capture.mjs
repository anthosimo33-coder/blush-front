/*
 * Galerie des écrans BLUSH — capture tous les états sur le vrai back-end, puis génère la page.
 *
 *   npm run e2e:build && npm run galerie     aucun serveur à lancer : Playwright lance celui des tests (tests/e2e/serveur.mjs)
 *   ONLY=13b,16d npm run galerie             ces états seulement (les autres captures restent)
 *   npm run galerie -- --page                la page seulement, avec les captures déjà faites
 *   E2E_PORT=3700 E2E_DB=blush_e2e_galerie_b npm run galerie   un autre port (et le suivant) ou une autre base
 *   MAQUETTES=<dossier>                      les maquettes de référence (par défaut ../maquettes/png, facultatives)
 *   npm run fluidite                         le banc de fluidité de l’accueil (scripts/fluidite) sur un compte BLUSH+ semé,
 *                                            sur la même infrastructure (scripts/galerie/fluidite.spec.ts) ; ni page ni captures
 *
 * Les captures : scripts/galerie/galerie.spec.ts, dans les projets galerie-* de playwright.config.ts (BLUSH_GALERIE=1),
 * sur une base neuve (blush_e2e_galerie, effacée à la fin), avec le modèle factice et sans aucune clé d’API.
 * Sortie : .galerie/ (galerie.html, img/, ref/, etats/, files.json, publish.json) — à publier en artefact.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { PLANCHES, RETIRES, SECTIONS, STATES } from "./screens.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, ".galerie");
const MAQ = path.resolve(ROOT, process.env.MAQUETTES ?? "../maquettes/png");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()).filter(Boolean) : null;
const PAGE_SEULEMENT = process.argv.includes("--page");
const FLUIDITE = process.argv.includes("--fluidite");
/* Le serveur des tests, à part : un port (et le suivant, pour la bêta fermée) et une base à la galerie (ou au banc) */
const PORT = process.env.E2E_PORT ?? (FLUIDITE ? "3490" : "3480");
const BASE = process.env.E2E_DB ?? (FLUIDITE ? "blush_e2e_galerie_fluidite" : "blush_e2e_galerie");
const POSTGRES = (process.env.E2E_POSTGRES ?? "postgres://localhost:5432").replace(/\/$/, "");

/** Lance les captures (galerie.spec.ts), ou le banc de fluidité (fluidite.spec.ts), dans Playwright. Renvoie son code de sortie. */
function capturer() {
  /* La base est recréée par le serveur des tests : jamais une autre que celle de la galerie */
  if (!/^blush_e2e_galerie[a-z0-9_]*$/.test(BASE)) {
    console.error(`✗ base refusée : « ${BASE} » (le nom doit commencer par blush_e2e_galerie)`);
    process.exit(1);
  }
  /* Le banc lit ONLY lui-même (ses scénarios) */
  if (FLUIDITE) return lancer(["test", "--project=galerie-fluidite"]);
  if (!ONLY) for (const dossier of ["img", "etats"]) fs.rmSync(path.join(OUT, dossier), { recursive: true, force: true });
  const args = ["test", "--project=galerie-mobile", "--project=galerie-ordinateur"];
  /* Les titres des tests commencent par l’identifiant de l’état : « 13b · Accueil · … » */
  if (ONLY) args.push("--grep", `(^|\\s)(${ONLY.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}) · `);
  return lancer(args);
}

/** Playwright, avec les projets de la galerie (BLUSH_GALERIE=1), sur le port et la base de la galerie. */
function lancer(args) {
  const r = spawnSync(path.join(ROOT, "node_modules/.bin/playwright"), args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BLUSH_GALERIE: "1", E2E_PORT: PORT, E2E_DB: BASE },
  });
  return r.status ?? 1;
}

/** Efface la base de la galerie : elle ne sert plus une fois les captures faites. */
async function oublierLaBase() {
  const admin = postgres(`${POSTGRES}/postgres`, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${BASE}" with (force)`);
  } catch (e) {
    console.error(`la base ${BASE} n’a pas pu être effacée : ${e.message}`);
  } finally {
    await admin.end();
  }
}

/** Une maquette PNG en JPEG (sips, sur macOS) ; null si ce n’est pas possible ici. */
function jpegFromPng(src, dest) {
  try {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", src, "--out", dest], { stdio: "ignore" });
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", dest]).toString();
    return { w: +out.match(/pixelWidth: (\d+)/)[1], h: +out.match(/pixelHeight: (\d+)/)[1] };
  } catch {
    return null;
  }
}

/** Assemble la page de la galerie avec les captures de .galerie/etats, les maquettes (s’il y en a) et le gabarit. */
function assembler() {
  fs.mkdirSync(path.join(OUT, "ref"), { recursive: true });

  /* Les captures faites : une fiche par état et par écran (galerie.spec.ts) */
  const shots = {};
  const dossier = path.join(OUT, "etats");
  for (const f of fs.existsSync(dossier) ? fs.readdirSync(dossier) : []) {
    const m = f.match(/^(.+)-([md])\.json$/);
    if (!m) continue;
    const shot = JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8"));
    if (fs.existsSync(path.join(OUT, shot.src))) (shots[m[1]] ??= {})[m[2]] = shot;
  }

  /* Maquettes de référence : facultatives (hors du dépôt) */
  const maquettes = fs.existsSync(MAQ);
  if (!maquettes) console.log(`maquettes absentes (${MAQ}) : la galerie sans elles`);
  const refs = {};
  for (const st of STATES) {
    if (!st.ref || !maquettes) continue;
    refs[st.id] = {};
    for (const [key, dir] of [["m", "mobile"], ["d", "desktop"]]) {
      const src = path.join(MAQ, dir, `${st.ref}.png`);
      if (!fs.existsSync(src)) continue;
      const rel = `ref/${key}-${st.ref}.jpg`;
      const taille = jpegFromPng(src, path.join(OUT, rel));
      if (taille) refs[st.id][key] = { src: rel, ...taille };
    }
  }
  const TITLES = ["Couverture", "Couleurs", "Typographie", "Boutons et contrôles", "Composants", "Logo", "Logo en mouvement", "Objets 3D", "Mode sobre", "Règles"];
  const planches = PLANCHES.flatMap((name, i) => {
    const src = path.join(MAQ, "design-system", `${name}.png`);
    const rel = `ref/ds-${name}.jpg`;
    const taille = fs.existsSync(src) ? jpegFromPng(src, path.join(OUT, rel)) : null;
    return taille ? [{ name, title: TITLES[i], src: rel, ...taille }] : [];
  });

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const part = (t) => fmt.find((p) => p.type === t)?.value ?? "";
  const manifest = {
    generatedAt: now.toISOString(),
    generatedLabel: `${part("day")} ${part("month")} à ${part("hour")} h ${part("minute")}`,
    sections: SECTIONS,
    retires: RETIRES,
    /* Ce que la page affiche, sans ce qui ne sert qu’à la capture (le compte, les gestes…) */
    states: STATES.map(({ id, section, title, state, route, note, changement, full, only }) => ({ id, section, title, state, route, note, changement, full, only, shots: shots[id] ?? {}, ref: refs[id] ?? null })),
    planches,
  };

  const tpl = fs.readFileSync(path.join(import.meta.dirname, "template.html"), "utf8");
  const html = tpl.replace("__MANIFEST__", JSON.stringify(manifest).replace(/</g, "\\u003c"));
  fs.writeFileSync(path.join(OUT, "galerie.html"), html);

  /* Les captures manquantes : un état raté (son test a échoué) ou pas encore capturé */
  const manquantes = manifest.states.flatMap((s) => (s.only ? [s.only] : ["m", "d"]).filter((k) => !s.shots[k]).map((k) => `${s.id} ${k}`));
  if (manquantes.length) console.log(`✗ ${manquantes.length} capture(s) manquante(s) : ${manquantes.join(", ")}`);

  /* Fichiers référencés par la page, et ce qu’il faut retirer de la version publiée précédente */
  const files = [
    ...manifest.states.flatMap((s) => [s.shots.m, s.shots.d, s.ref?.m, s.ref?.d]).filter(Boolean).map((x) => x.src),
    ...manifest.planches.map((p) => p.src),
  ];
  const uniq = [...new Set(files)].sort();
  fs.writeFileSync(path.join(OUT, "files.json"), JSON.stringify(uniq, null, 1));
  let published = [];
  try {
    published = JSON.parse(fs.readFileSync(path.join(OUT, "published.json"), "utf8"));
  } catch {
    published = [];
  }
  const remove = published.filter((f) => !uniq.includes(f));
  const map = Object.fromEntries([...uniq.filter((f) => !published.includes(f)).map((f) => [f, f]), ...remove.map((f) => [f, null])]);
  fs.writeFileSync(path.join(OUT, "publish.json"), JSON.stringify(map, null, 1));
  console.log(`${Object.values(map).filter(Boolean).length} fichiers à envoyer, ${remove.length} à retirer (publish.json)`);
  const size = uniq.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`${uniq.length} fichiers, ${(size / 1e6).toFixed(1)} Mo → .galerie/galerie.html`);
}

async function main() {
  let code = 0;
  if (!PAGE_SEULEMENT) {
    code = capturer();
    await oublierLaBase();
  }
  if (!FLUIDITE) assembler();
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
