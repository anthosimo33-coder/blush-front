/*
 * Galerie des écrans CRUSH — capture tous les états puis génère la page.
 *
 *   npm run galerie                         (serveur déjà lancé sur http://localhost:3100)
 *   BASE=http://localhost:3300 npm run galerie
 *
 * Sortie : .galerie/ (galerie.html, img/, ref/, files.json) — à publier en artefact.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PLANCHES, SECTIONS, STATES } from "./screens.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, ".galerie");
const MAQ = path.resolve(ROOT, "../maquettes/png");
const BASE = process.env.BASE ?? "http://localhost:3100";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
/* Noms horodatés : un nouveau fichier à chaque capture, jamais d’image périmée en cache */
const STAMP = Date.now().toString(36);
const VP = {
  m: { width: 390, height: 844, dsf: 2 },
  d: { width: 1280, height: 900, dsf: 1.5 },
};

function chromePath() {
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const builds = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const b of builds) {
    for (const p of [
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-linux/chrome",
    ]) {
      const full = path.join(cache, b, p);
      if (fs.existsSync(full)) return full;
    }
  }
  const sys = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(sys)) return sys;
  throw new Error("Chromium introuvable (cache Playwright ou Google Chrome).");
}

function jpegFromPng(src, dest) {
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", src, "--out", dest], { stdio: "ignore" });
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", dest]).toString();
  const w = +out.match(/pixelWidth: (\d+)/)[1];
  const h = +out.match(/pixelHeight: (\d+)/)[1];
  return { w, h };
}

async function shoot(browser, st, key) {
  const vp = VP[key];
  /* `touch` : le mobile est capturé comme un vrai écran tactile (pas de survol, pointeur grossier) */
  const touch = !!st.touch && key === "m";
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    reducedMotion: st.motion ? "no-preference" : "reduce",
    locale: "fr-FR",
    hasTouch: touch,
    isMobile: touch,
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write", "microphone"], { origin: BASE });
  await ctx.addInitScript(
    ({ journey, server }) => {
      try {
        if (journey) sessionStorage.setItem("crush.journey.v1", JSON.stringify(journey));
        const s = { ...server };
        if (s.analysisStartedAgo) {
          s.analysisStartedAt = Date.now() - s.analysisStartedAgo;
          delete s.analysisStartedAgo;
        }
        if (Object.keys(s).length) sessionStorage.setItem("crush.mock-server.v1", JSON.stringify(s));
      } catch {
        /* rien */
      }
    },
    { journey: st.journey ?? null, server: st.server ?? {} },
  );
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + st.route, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(st.wait ?? 600);
    if (st.steps) await st.steps(page, key);
    if (st.hover) {
      const target = typeof st.hover === "string" ? page.locator(st.hover).first() : page.getByRole(st.hover.role, { name: st.hover.name }).first();
      await target.hover();
      await page.waitForTimeout(700);
    }
    /* États animés : les entrées (rebond, montée) sont figées à leur état final, la progression continue */
    if (st.motion) await page.addStyleTag({ content: "[data-popin],[data-rise],[data-pop]{animation:none!important}" });
    const full = !st.sheet;
    const h = full ? await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight)) : vp.height;
    const rel = `img/${key}-${st.id}-${STAMP}.jpg`;
    /* Au-delà de ~16 000 px, le navigateur recolle mal l’image : on capture alors en pixels CSS */
    await page.screenshot({ path: path.join(OUT, rel), type: "jpeg", quality: 85, fullPage: full, scale: h * vp.dsf > 15000 ? "css" : "device" });
    return { src: rel, w: vp.width, h };
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (!ONLY) fs.rmSync(path.join(OUT, "img"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "ref"), { recursive: true });

  /* Micro factice (un bip) : les états « vocal » s’enregistrent sans vrai micro ni question d’autorisation */
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const jobs = [];
  for (const st of STATES) {
    if (ONLY && !ONLY.includes(st.id)) continue;
    for (const key of st.only ? [st.only] : ["m", "d"]) jobs.push({ st, key });
  }
  const shots = {};
  const queue = [...jobs];
  let done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const { st, key } = queue.shift();
        try {
          (shots[st.id] ??= {})[key] = await shoot(browser, st, key);
        } catch (e) {
          console.error(`✗ ${st.id} ${key}: ${e.message.split("\n")[0]}`);
        }
        done++;
        process.stdout.write(`\r${done}/${jobs.length} captures`);
      }
    }),
  );
  await browser.close();
  process.stdout.write("\n");

  /* Maquettes de référence */
  const refs = {};
  for (const st of STATES) {
    if (!st.ref) continue;
    refs[st.id] = {};
    for (const [key, dir] of [["m", "mobile"], ["d", "desktop"]]) {
      const src = path.join(MAQ, dir, `${st.ref}.png`);
      if (!fs.existsSync(src)) continue;
      const rel = `ref/${key}-${st.ref}.jpg`;
      refs[st.id][key] = { src: rel, ...jpegFromPng(src, path.join(OUT, rel)) };
    }
  }
  const TITLES = ["Couverture", "Couleurs", "Typographie", "Boutons et contrôles", "Composants", "Logo", "Logo en mouvement", "Objets 3D", "Mode sobre", "Règles"];
  const planches = PLANCHES.map((name, i) => {
    const rel = `ref/ds-${name}.jpg`;
    return { name, title: TITLES[i], src: rel, ...jpegFromPng(path.join(MAQ, "design-system", `${name}.png`), path.join(OUT, rel)) };
  });

  /* Avec ONLY, on garde les captures déjà faites pour les autres états */
  let prev = {};
  try {
    const old = fs.readFileSync(path.join(OUT, "galerie.html"), "utf8").match(/const DATA = (\{.*?\});\n/s);
    if (old) for (const s of JSON.parse(old[1]).states) prev[s.id] = s.shots;
  } catch {
    prev = {};
  }
  const previous = (id) => (ONLY ? prev[id] ?? {} : {});

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const part = (t) => fmt.find((p) => p.type === t)?.value ?? "";
  const manifest = {
    generatedAt: now.toISOString(),
    generatedLabel: `${part("day")} ${part("month")} à ${part("hour")} h ${part("minute")}`,
    sections: SECTIONS,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- on retire du manifeste ce qui ne sert qu’à la capture
    states: STATES.map(({ steps, journey, server, hover, motion, wait, touch, ...s }) => ({ ...s, shots: shots[s.id] ?? previous(s.id), ref: refs[s.id] ?? null })),
    planches,
  };

  const tpl = fs.readFileSync(path.join(import.meta.dirname, "template.html"), "utf8");
  const html = tpl.replace("__MANIFEST__", JSON.stringify(manifest).replace(/</g, "\\u003c"));
  fs.writeFileSync(path.join(OUT, "galerie.html"), html);

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
