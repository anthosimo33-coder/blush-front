/*
 * Banc de fluidité de l’accueil : Chrome en taille iPhone, processeur ralenti (CPU=4 par défaut, comme un téléphone),
 * chaque scénario joué pour de vrai. Deux mesures :
 *   - « écran » : les images que Chrome affiche vraiment (compositeur compris) ; « perdues » = saccades visibles ;
 *   - « fil » : les images du fil principal (requestAnimationFrame) et ses longues tâches (LoAF).
 * Une animation saine ne touche que transform et opacity : le compositeur la joue même quand le fil principal est occupé.
 *   npm run fluidite                                  (serveur de production lancé sur http://localhost:3300)
 *   BASE=https://blush-front.vercel.app NORAF=1 RUNS=3 npm run fluidite
 *   ONLY=pastille,feuille DEBUG=1 npm run fluidite    (le détail des longues images et de leurs scripts)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const BASE = process.env.BASE ?? "http://localhost:3300";
const CPU = Number(process.env.CPU ?? 4);
const RUNS = Number(process.env.RUNS ?? 2);
const ONLY = process.env.ONLY?.split(",");

function chromePath() {
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  for (const b of fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const full = path.join(cache, b, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (fs.existsSync(full)) return full;
  }
  throw new Error("Chromium introuvable");
}

const INIT = (noraf) => {
  window.__f = [];
  window.__loaf = [];
  let last = 0;
  const loop = (t) => {
    if (noraf) return;
    if (last) window.__f.push(t - last);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({ d: e.duration, b: e.blockingDuration, s: e.startTime, render: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0, style: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0, scripts: (e.scripts || []).map((x) => `${x.invoker}:${Math.round(x.duration)}ms ${x.sourceFunctionName || ""} ${(x.sourceURL || "").split("/").pop()}`) }))).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let CDP = null;

/** Les images vues par Chrome lui-même (compositeur compris) : présentées, partielles, ratées. */
async function traced(run) {
  const events = [];
  const onData = (d) => events.push(...d.value);
  CDP.on("Tracing.dataCollected", onData);
  await CDP.send("Tracing.start", { traceConfig: { includedCategories: ["disabled-by-default-devtools.timeline.frame", "benchmark", "cc"] }, transferMode: "ReportEvents" });
  await run();
  const done = new Promise((r) => CDP.once("Tracing.tracingComplete", r));
  await CDP.send("Tracing.end");
  await done;
  CDP.off("Tracing.dataCollected", onData);
  const states = {};
  for (const e of events) {
    if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
    const fr = e.args?.frame_reporter ?? {};
    const st = fr.state ?? "?";
    states[st] = (states[st] ?? 0) + 1;
    if (fr.has_main_animation) states.MAIN_ANIM = (states.MAIN_ANIM ?? 0) + 1;
    if (fr.has_main_animation && st !== "STATE_PRESENTED_ALL") states.MAIN_ANIM_LATE = (states.MAIN_ANIM_LATE ?? 0) + 1;
  }
  return states;
}

async function measure(page, label, run) {
  await page.evaluate(() => {
    window.__f = [];
    window.__loaf = [];
  });
  const t0 = Date.now();
  const states = await traced(run);
  const ms = Date.now() - t0;
  const shown = (states.STATE_PRESENTED_ALL ?? 0) + (states.STATE_PRESENTED_PARTIAL ?? 0);
  const lost = states.STATE_DROPPED ?? 0;
  const { f, loaf } = await page.evaluate(() => ({ f: window.__f, loaf: window.__loaf }));
  const dropped = f.filter((d) => d > 25).length;
  const missed = f.reduce((n, d) => n + Math.max(0, Math.round(d / 16.67) - 1), 0);
  const worst = Math.max(0, ...f);
  const blocking = loaf.reduce((n, e) => n + e.b, 0);
  if (process.env.DEBUG) {
    let t = 0;
    const big = [];
    f.forEach((d) => { t += d; if (d > 25) big.push(`${Math.round(t)}:${Math.round(d)}`); });
    console.log(label, "images longues (t:durée)", big.join(" "));
    for (const e of loaf) console.log("   LoAF", Math.round(e.d), "ms, rendu", e.render, "style+layout", e.style, e.scripts.join(" | "));
  }
  return { label, ms, gpuShown: shown, gpuLost: lost, gpuPartial: states.STATE_PRESENTED_PARTIAL ?? 0, mainAnim: states.MAIN_ANIM ?? 0, mainLate: states.MAIN_ANIM_LATE ?? 0, gpuSmooth: shown + lost ? Math.round((shown / (shown + lost)) * 100) : 100, frames: f.length, missed, dropped, smooth: f.length ? Math.round((1 - missed / (f.length + missed)) * 100) : 0, worst: Math.round(worst), longFrames: loaf.length, blocking: Math.round(blocking) };
}

const SCENARIOS = {
  async arrivee(page) {
    await page.goto(`${BASE}/app?plan=blushplus&arrivee=1&v=${Date.now()}`, { waitUntil: "commit" });
    await page.waitForFunction(() => !!window.__f);
    return measure(page, "1 · arrivée", () => sleep(4200));
  },
  async frappe(page) {
    const input = page.locator("input[enterkeyhint]");
    await input.click();
    const r = await measure(page, "2 · frappe (30 lettres)", () => input.pressSequentially("elle m'a dit on verra samedi ok", { delay: 70 }));
    await input.fill("");
    return r;
  },
  async pastille(page) {
    const chip = page.locator("button[value]").nth(1);
    return measure(page, "3+5 · pastille → réponse", async () => {
      await chip.click();
      await sleep(3600);
    });
  },
  async envoi(page) {
    const input = page.locator("input[enterkeyhint]");
    await input.fill("elle m'a dit on verra");
    return measure(page, "4+5 · envoi → réponse", async () => {
      await input.press("Enter");
      await sleep(3600);
    });
  },
  async repli(page) {
    return measure(page, "8 · défilement (repli)", async () => {
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, -40);
        await sleep(16);
      }
      await sleep(300);
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, 40);
        await sleep(16);
      }
      await sleep(400);
    });
  },
  async feuille(page) {
    await page.mouse.move(200, 400);
    const logo = page.locator(".home-head [data-blush-logo]");
    return measure(page, "9 · feuille ouverte/fermée", async () => {
      await logo.click();
      await sleep(1100);
      await page.getByRole("button", { name: "Fermer" }).first().click();
      await sleep(900);
    });
  },
  async niveau(page) {
    const input = page.locator("input[enterkeyhint]");
    await input.fill("elle veut qu'on soit ensemble");
    return measure(page, "11 · niveau qui monte", async () => {
      await input.press("Enter");
      await sleep(4300);
    });
  },
  async fiche(page) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(300);
    return measure(page, "10 · vers sa fiche et retour", async () => {
      await page.locator(".home-head a[href='/app/fiche']").click();
      await page.waitForURL("**/app/fiche");
      await sleep(900);
      await page.locator("header a[href='/app']").first().click();
      await page.waitForURL(/\/app(\?|$)/);
      await sleep(900);
    });
  },
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ["--enable-features=LongAnimationFrameTiming"] });
const rows = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "fr-FR" });
  await ctx.addInitScript(INIT, !!process.env.NORAF);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  CDP = cdp;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    /* Lancé seul, un scénario ouvre d’abord l’accueil (l’arrivée s’en charge sinon) */
    if (name !== "arrivee" && !page.url().includes("/app")) {
      await page.goto(`${BASE}/app?plan=blushplus`);
      await sleep(1500);
    }
    try {
      rows.push({ run, ...(await fn(page)) });
    } catch (e) {
      rows.push({ run, label: name, error: String(e).slice(0, 120) });
    }
  }
  await ctx.close();
}
await browser.close();

/* Moyenne des passages, par scénario */
const by = new Map();
for (const r of rows) {
  if (r.error) {
    console.log("ERREUR", r.label, r.error);
    continue;
  }
  const a = by.get(r.label) ?? [];
  a.push(r);
  by.set(r.label, a);
}
console.log(`\nBASE=${BASE} CPU×${CPU} passages=${RUNS}`);
console.log("scénario".padEnd(30), "écran%", "perdues", "partielles", "anim.fil", "en retard", "|", "fil%", "ratées", "pire(ms)", "bloquant(ms)");
for (const [label, a] of by) {
  const avg = (k) => Math.round(a.reduce((n, r) => n + r[k], 0) / a.length);
  console.log(label.padEnd(30), String(avg("gpuSmooth")).padStart(6), String(avg("gpuLost")).padStart(7), String(avg("gpuPartial")).padStart(10), String(avg("mainAnim")).padStart(8), String(avg("mainLate")).padStart(9), "|", String(avg("smooth")).padStart(4), String(avg("missed")).padStart(6), String(avg("worst")).padStart(8), String(avg("blocking")).padStart(11));
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows, null, 2));
