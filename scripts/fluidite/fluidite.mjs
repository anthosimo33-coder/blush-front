/*
 * Banc de fluidité de l’accueil (et du rapport) : Chrome en taille iPhone, processeur ralenti (CPU=4 par défaut, comme
 * un téléphone), chaque scénario joué pour de vrai. Deux mesures :
 *   - « écran » : les images que le compositeur (viz) a vraiment dessinées, et pendant chaque geste (toucher, lettres,
 *     molette) le pire trou entre deux images, les trous de plus de 34 ms (deux images ratées d’affilée), et le délai
 *     entre le toucher et la première image qui suit ;
 *   - « fil » : les images du fil principal (requestAnimationFrame) et ses longues tâches (LoAF).
 * Une animation saine ne touche que transform et opacity : le compositeur la joue même quand le fil principal est occupé.
 * Chrome reste un substitut de l’iPhone : un écart se confirme sur Safari (WebKit) ou sur un vrai téléphone.
 * L’accueil d’un compte BLUSH+ semé dont la conv est lue, sur le serveur des tests : SESSION, la valeur de son cookie
 * blush-session. Le banc écrit au chat de ce compte (pastille, envoi, niveau) : il ne mesure qu’un serveur local (BASE
 * sur localhost), jamais la production, et SESSION n’est jamais le cookie d’un compte réel (c’est un jeton de connexion).
 *   npm run fluidite                                  (le serveur des tests et un compte BLUSH+ semé : scripts/galerie/fluidite.spec.ts)
 *   NORAF=1 RUNS=3 npm run fluidite                   (sans la boucle requestAnimationFrame du fil, trois passages)
 *   ONLY=pastille,feuille DEBUG=1 npm run fluidite    (le détail des longues images et de leurs scripts)
 *   ONLY=vocal,rapport npm run fluidite               (le vocal en cours, au micro factice, et le défilement du rapport)
 * L’ancien compteur (PipelineReporter de Chrome) ne s’affiche plus que sous DEBUG : il marque « perdue » toute image
 * dont le seul changement est en bas de l’écran (la bulle du rapport, par exemple), même quand viz l’a bien dessinée.
 */
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3300";
const CPU = Number(process.env.CPU ?? 4);
const RUNS = Number(process.env.RUNS ?? 2);
const ONLY = process.env.ONLY?.split(",");
const SESSION = process.env.SESSION;
if (!SESSION) throw new Error("SESSION manque : la valeur du cookie blush-session d’un compte BLUSH+ (ou npm run fluidite, qui en sème un)");
/* Un serveur local seulement : le banc écrit au chat du compte, et son cookie ne doit jamais être celui d’un compte réel */
if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE)) throw new Error(`BASE refusée : « ${BASE} » (le banc ne mesure qu’un serveur local, jamais la production)`);

const INIT = (noraf) => {
  window.__f = [];
  window.__loaf = [];
  /* Chaque geste laisse une marque dans la trace (blink.user_timing) : le début de sa fenêtre de mesure */
  for (const type of ["pointerdown", "keydown", "wheel"]) addEventListener(type, () => performance.mark(`geste:${type}`), { capture: true, passive: true });
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

/* Un geste : ses marques à moins de GESTE ms l’une de l’autre (lettres, crans de molette) forment une seule fenêtre,
   qui court jusqu’à GESTE ms après la dernière. TROU : deux images ratées d’affilée à 60 Hz. */
const GESTE = 500;
const TROU = 34;

/**
 * Les images vraiment dessinées par le compositeur (viz, STEP_DRAW_AND_SWAP), et les gestes marqués par la page.
 * PipelineReporter (l’ancien compteur) est gardé pour DEBUG seulement.
 */
async function traced(run) {
  const events = [];
  const onData = (d) => events.push(...d.value);
  CDP.on("Tracing.dataCollected", onData);
  await CDP.send("Tracing.start", { traceConfig: { includedCategories: ["viz", "blink.user_timing", "disabled-by-default-devtools.timeline.frame", "benchmark", "cc"] }, transferMode: "ReportEvents" });
  await run();
  const done = new Promise((r) => CDP.once("Tracing.tracingComplete", r));
  await CDP.send("Tracing.end");
  await done;
  CDP.off("Tracing.dataCollected", onData);
  const threads = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args.name);
  const draws = events
    .filter((e) => e.name === "Graphics.Pipeline" && threads.get(`${e.pid}:${e.tid}`) === "VizCompositorThread" && e.args?.chrome_graphics_pipeline?.step === "STEP_DRAW_AND_SWAP")
    .map((e) => e.ts / 1e3)
    .sort((a, b) => a - b);
  const marks = events
    .filter((e) => e.cat?.includes("blink.user_timing") && /^geste:/.test(e.name) && ["R", "I", "n", "b"].includes(e.ph))
    .map((e) => ({ type: e.name.slice(6), t: e.ts / 1e3 }))
    .sort((a, b) => a.t - b.t);
  /* Les fenêtres de geste, puis dans chacune : le délai jusqu’à la première image, les trous, le pire trou */
  const gestes = [];
  for (const m of marks) {
    const g = gestes.at(-1);
    if (g && m.t - g.fin < GESTE) g.fin = m.t;
    else gestes.push({ type: m.type, debut: m.t, fin: m.t });
  }
  const parGeste = gestes.map((g) => {
    const fin = g.fin + GESTE;
    const premiere = draws.find((t) => t > g.debut);
    const dans = [g.debut, ...draws.filter((t) => t > g.debut && t <= fin)];
    const ecarts = dans.slice(1).map((t, i) => t - dans[i]);
    return { type: g.type, delai: premiere === undefined ? null : premiere - g.debut, pire: Math.max(0, ...ecarts), trous: ecarts.filter((x) => x > TROU).length };
  });
  const states = {};
  for (const e of events) {
    if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
    const fr = e.args?.frame_reporter ?? {};
    const st = fr.state ?? "?";
    states[st] = (states[st] ?? 0) + 1;
  }
  return { draws: draws.length, parGeste, states };
}

async function measure(page, label, run) {
  await page.evaluate(() => {
    window.__f = [];
    window.__loaf = [];
  });
  const t0 = Date.now();
  const { draws, parGeste, states } = await traced(run);
  const ms = Date.now() - t0;
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
    console.log("   gestes", parGeste.map((g) => `${g.type} délai ${g.delai === null ? "?" : Math.round(g.delai)} pire ${Math.round(g.pire)} trous ${g.trous}`).join(" | "));
    /* L’ancien compteur, pour comparer : à ne pas croire seul (voir l’en-tête) */
    console.log("   PipelineReporter (indicatif, faux « perdues » en bas d’écran)", JSON.stringify(states));
  }
  const delais = parGeste.filter((g) => g.type === "pointerdown" && g.delai !== null).map((g) => g.delai);
  return {
    label,
    ms,
    vizImages: draws,
    vizParS: ms ? Math.round((draws / ms) * 1000) : 0,
    gestes: parGeste.length,
    trous: parGeste.reduce((n, g) => n + g.trous, 0),
    pireTrou: Math.round(Math.max(0, ...parGeste.map((g) => g.pire))),
    toucherImage: delais.length ? Math.round(Math.max(...delais)) : null,
    frames: f.length,
    missed,
    dropped,
    smooth: f.length ? Math.round((1 - missed / (f.length + missed)) * 100) : 0,
    worst: Math.round(worst),
    longFrames: loaf.length,
    blocking: Math.round(blocking),
  };
}

const SCENARIOS = {
  async arrivee(page) {
    await page.goto(`${BASE}/app?v=${Date.now()}`, { waitUntil: "commit" });
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
    /* « on est ensemble » : le déclencheur du modèle factice (src/server/ia/factice.ts), un niveau de franchi */
    await input.fill("elle m'a dit on est ensemble");
    const nouveau = page.getByText(/^Nouve(au niveau|lle température) · /);
    const avant = await nouveau.count();
    const r = await measure(page, "11 · niveau qui monte", async () => {
      await input.press("Enter");
      await sleep(4300);
    });
    /* Sans le nouveau niveau dans la conv, la mesure n’est qu’un envoi : le scénario échoue */
    await nouveau.nth(avant).waitFor({ timeout: 5000 }).catch(() => {
      throw new Error("le niveau n’est pas monté (ni anneau ni célébration) : la mesure n’est qu’un envoi");
    });
    return r;
  },
  async vocal(page) {
    /* Champ vide : le bouton du vocal remplace la flèche. Le micro factice de Chromium (un bip) s’enregistre quelques
       secondes, la barre d’enregistrement suit son niveau en direct, puis le vocal est jeté sans rien envoyer */
    const input = page.locator("input[enterkeyhint]");
    await input.fill("");
    const annuler = page.getByRole("button", { name: "Annuler le vocal" });
    let enregistre = false;
    const r = await measure(page, "12 · vocal en cours", async () => {
      await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
      enregistre = await annuler.waitFor({ timeout: 5000 }).then(
        () => true,
        () => false,
      );
      if (!enregistre) return;
      await sleep(3500);
      await annuler.click();
      await sleep(600);
    });
    /* Sans la barre d’enregistrement, la mesure n’est qu’un toucher : le scénario échoue */
    if (!enregistre) throw new Error("l’enregistrement n’a pas démarré (le micro factice de Chromium ?) : la mesure n’est qu’un toucher");
    return r;
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
  async rapport(page) {
    /* Le rapport du compte, lu d’un bout à l’autre à la molette, puis remonté : la progression de lecture et la barre du
       chapitre en cours suivent le défilement */
    await page.goto(`${BASE}/rapport`);
    await page.locator("#chapitre-2").waitFor();
    await sleep(1200);
    await page.mouse.move(200, 400);
    const depart = await page.evaluate(() => scrollY);
    let plusBas = depart;
    const r = await measure(page, "13 · défilement du rapport", async () => {
      for (let i = 0; i < 48; i++) {
        await page.mouse.wheel(0, 120);
        await sleep(16);
      }
      await sleep(400);
      plusBas = await page.evaluate(() => scrollY);
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, -120);
        await sleep(16);
      }
      await sleep(400);
    });
    /* Une page qui n’a pas bougé ne mesure rien : le scénario échoue */
    if (plusBas - depart < 2000) throw new Error(`le rapport n’a défilé que de ${Math.round(plusBas - depart)} px : la mesure ne vaut rien`);
    return r;
  },
};

/*
 * Le Chromium de Playwright (`npx playwright install chromium`), le navigateur complet (channel « chromium ») plutôt que
 * la coquille sans écran, dont le compositeur ne se trace pas pareil ; et son micro factice (un bip), autorisé d’office.
 */
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--enable-features=LongAnimationFrameTiming", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const rows = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "fr-FR", permissions: ["microphone"] });
  /* Un contexte neuf à chaque passage : l’arrivée de l’accueil se joue */
  await ctx.addCookies([{ name: "blush-session", value: SESSION, url: BASE }]);
  await ctx.addInitScript(INIT, !!process.env.NORAF);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  CDP = cdp;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    /* Lancé seul, un scénario de l’accueil l’ouvre d’abord (l’arrivée s’en charge sinon) ; celui du rapport ouvre sa page */
    if (name !== "arrivee" && name !== "rapport" && !page.url().includes("/app")) {
      await page.goto(`${BASE}/app`);
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
    /* Un scénario raté fait échouer le banc (et npm run fluidite) */
    process.exitCode = 1;
    continue;
  }
  const a = by.get(r.label) ?? [];
  a.push(r);
  by.set(r.label, a);
}
console.log(`\nBASE=${BASE} CPU×${CPU} passages=${RUNS} (Chrome, substitut de l’iPhone)`);
console.log("écran : images viz/s, gestes mesurés, trous > 34 ms pendant les gestes, pire trou (ms), toucher → première image (ms, le pire)");
console.log("scénario".padEnd(30), "images/s", "gestes", "trous", "pire trou", "toucher→image", "|", "fil%", "ratées", "pire(ms)", "bloquant(ms)");
for (const [label, a] of by) {
  const avg = (k) => {
    const v = a.map((r) => r[k]).filter((x) => x !== null && x !== undefined);
    return v.length ? String(Math.round(v.reduce((n, x) => n + x, 0) / v.length)) : "–";
  };
  console.log(label.padEnd(30), avg("vizParS").padStart(8), avg("gestes").padStart(6), avg("trous").padStart(5), avg("pireTrou").padStart(9), avg("toucherImage").padStart(13), "|", avg("smooth").padStart(4), avg("missed").padStart(6), avg("worst").padStart(8), avg("blocking").padStart(11));
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows, null, 2));
