import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { commeInstagram, ecrire, exportInstagram, type Fichier } from "./exports";
import { RESEAU } from "./page";

/**
 * Le temps que BLUSH lit des captures, ou un enregistrement d’écran (regardé pas à pas dans le navigateur, puis lu par
 * lots) : plusieurs allers-retours au serveur de suite, plus long qu’un import.
 */
export const LECTURE_DES_CAPTURES = 45_000;

/*
 * Les aides des parcours Instagram et captures (tests/e2e/instagram-captures-*.spec.ts) : l’export Instagram en HTML,
 * l’export complet à plusieurs convs, un enregistrement d’écran, et ce que la grille des captures montre. Tout est
 * inventé : les prénoms, les messages, la conv filmée.
 */

/* Instagram écrit l’UTF-8 de ses JSON octet par octet (exports.ts, commeInstagram) : on le relit pareil */
const depuisInstagram = (s: string) => new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));

type MessageJson = { sender_name: string; timestamp_ms: number; content?: string; photos?: unknown[]; audio_files?: unknown[] };
type ConvJson = { participants: { name: string }[]; messages: MessageJson[]; title: string; thread_path: string };

/** La conv Instagram de Noé et Maëlys (aide/exports.ts) : 64 messages, 2 vocaux, Noé en écrit 35. */
function convNoeEtMaelys(testInfo: TestInfo): ConvJson {
  return JSON.parse(readFileSync(exportInstagram(testInfo, { format: "json" }).chemin, "utf8")) as ConvJson;
}

/* ———— L’export HTML ———— */

const HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => HTML[c]!).replace(/\n/g, "<br />");
const pad = (n: number) => String(n).padStart(2, "0");
const MOIS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** L’heure du Pacifique en septembre (heure d’été : UTC-7), celle qu’affichent les exports HTML. */
const PACIFIQUE = -7 * 3600e3;
/** « sep 04, 2026 3:02 pm » : un instant tel qu’un export HTML l’affiche, à l’heure du Pacifique. */
function dateAffichee(t: number): string {
  const d = new Date(t + PACIFIQUE);
  const h = d.getUTCHours();
  return `${MOIS_EN[d.getUTCMonth()]} ${pad(d.getUTCDate())}, ${d.getUTCFullYear()} ${h % 12 || 12}:${pad(d.getUTCMinutes())} ${h < 12 ? "am" : "pm"}`;
}

/** Trois heures plus tard que la conv JSON : ses premiers messages tombent juste après minuit à Paris (le 5 septembre). */
const DECALAGE_HTML = 3 * 3600e3;

/**
 * La conv de Noé et Maëlys en export HTML d’Instagram (message_1.html) : un bloc par message, du plus récent au plus
 * ancien, les heures affichées à l’heure du Pacifique (l’en-tête donne l’écart), les photos et vocaux en balises, le
 * texte échappé, et le « a aimé un message » d’Instagram. Les messages commencent le 5 septembre à 0 h 02 à
 * Paris (le 4 à 15 h 02 dans le Pacifique) : une heure mal ramenée à Paris changerait le jour du premier message.
 */
export function exportInstagramHtml(testInfo: TestInfo): Fichier & { periode: string } {
  const conv = convNoeEtMaelys(testInfo);
  const dossier = conv.thread_path;
  const blocs = conv.messages.map((m) => {
    const t = m.timestamp_ms + DECALAGE_HTML;
    const texte = m.content ? `<div>${echapper(depuisInstagram(m.content))}</div>` : "";
    const media = m.audio_files
      ? `<div><div><audio src="${dossier}/audio/${t}.mp4" controls="1"><a href="${dossier}/audio/${t}.mp4">${dossier}/audio/${t}.mp4</a></audio></div></div>`
      : m.photos
        ? `<div><a target="_blank" href="${dossier}/photos/${t}.jpg"><img src="${dossier}/photos/${t}.jpg" class="_a6_o _3-96" /></a></div>`
        : "";
    return (
      `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${echapper(depuisInstagram(m.sender_name))}</h2>` +
      `<div class="_3-95 _a6-p"><div><div></div>${texte}<div></div>${media}<div></div></div></div><div class="_3-94 _a6-o">${dateAffichee(t)}</div></div>`
    );
  });
  /* L’en-tête : l’instant de l’export en UTC, et le même tel qu’affiché (sept heures de moins) */
  const genere = Date.UTC(2026, 8, 10, 8, 0);
  const html = [
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${echapper(depuisInstagram(conv.title))}</title></head><body class="_5vb_ _2yq _a7o5"><div class="_a706" role="main">`,
    `<header><time datetime="2026-09-10T08:00Z">Le jeudi 10 septembre 2026 à ${pad(new Date(genere + PACIFIQUE).getUTCHours())}:00</time></header>`,
    ...blocs,
    "</div></body></html>",
  ].join("\n");
  return { chemin: ecrire(testInfo.outputPath("exports", "message_1.html"), html), nom: "message_1.html", messages: 64, vocaux: 2, periode: "5 sept. → 8 sept." };
}

/* ———— L’export complet, à plusieurs convs ———— */

const PHRASES = ["coucou", "tu fais quoi ce soir ?", "trop bien 😂", "on se voit quand ?", "j’arrive dans 10 min", "bonne nuit", "mdr", "t’as vu le match ?"];

/** Une conv inventée au format JSON d’Instagram : `n` messages, chacun son tour, le dernier le 6 septembre 2026. */
function convInventee(titre: string, noms: string[], n: number, dossier: string): ConvJson {
  const fin = Date.UTC(2026, 8, 6, 18, 0);
  return {
    participants: noms.map((nom) => ({ name: commeInstagram(nom) })),
    /* Du plus récent au plus ancien, comme Instagram */
    messages: Array.from({ length: n }, (_, k) => ({
      sender_name: commeInstagram(noms[k % noms.length]!),
      timestamp_ms: fin - k * 7 * 60e3,
      content: commeInstagram(PHRASES[k % PHRASES.length]!),
    })),
    title: commeInstagram(titre),
    thread_path: dossier.slice(dossier.indexOf("inbox/")),
  };
}

/** Une conv de l’export complet : son titre (ce que « Quelle conv ? » affiche) et son nombre de messages. */
export type ConvDeLExport = { titre: string; messages: number; groupe: boolean };

/*
 * Les autres convs de Noé : douze convs à deux, plus courtes que celle avec Maëlys (Zoé, 30 messages : trop courte pour
 * une lecture), et un groupe à trois, plus long que tout, que « Quelle conv ? » range en dernier.
 */
const AUTRES: { titre: string; noms: string[]; n: number }[] = [
  { titre: "Zoé", noms: ["Zoé", "Noé"], n: 30 },
  { titre: "Sacha", noms: ["Sacha", "Noé"], n: 44 },
  { titre: "Lina", noms: ["Lina", "Noé"], n: 41 },
  { titre: "Côme", noms: ["Côme", "Noé"], n: 38 },
  { titre: "Anaïs", noms: ["Anaïs", "Noé"], n: 35 },
  { titre: "Yanis", noms: ["Yanis", "Noé"], n: 27 },
  { titre: "Romane", noms: ["Romane", "Noé"], n: 24 },
  { titre: "Jules", noms: ["Jules", "Noé"], n: 21 },
  { titre: "Capucine", noms: ["Capucine", "Noé"], n: 18 },
  { titre: "Timéo", noms: ["Timéo", "Noé"], n: 15 },
  { titre: "Margaux", noms: ["Margaux", "Noé"], n: 12 },
  /* La plus courte : la treizième conv à deux, hors des douze que la feuille montre d’abord */
  { titre: "Élise", noms: ["Élise", "Noé"], n: 9 },
  { titre: "Les colocs du 5e", noms: ["Bastien", "Clémence", "Noé"], n: 70 },
];

/**
 * L’export complet d’Instagram (« Télécharger tes informations », tout le compte) : un .zip avec une conv par dossier
 * de your_instagram_activity/messages/inbox/. Celle avec Maëlys (64 messages) est en deux fichiers (message_1.json, les
 * plus récents, et message_2.json), avec ses photos ; il y a aussi les infos du compte, qui ne sont pas une conv.
 */
export function exportInstagramComplet(testInfo: TestInfo): Fichier & { convs: ConvDeLExport[] } {
  const maelys = convNoeEtMaelys(testInfo);
  const racine = "your_instagram_activity/messages/inbox";
  const dossierMaelys = `${racine}/${maelys.thread_path.split("/").at(-1)}`;
  const fichiers: Record<string, Uint8Array> = {
    [`${dossierMaelys}/message_1.json`]: strToU8(JSON.stringify({ ...maelys, messages: maelys.messages.slice(0, 40) })),
    [`${dossierMaelys}/message_2.json`]: strToU8(JSON.stringify({ ...maelys, messages: maelys.messages.slice(40) })),
    [`${dossierMaelys}/photos/1757012411000.jpg`]: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    "personal_information/personal_information/personal_information.json": strToU8(JSON.stringify({ profile_user: [{ string_map_data: { Name: { value: "Noé" } } }] })),
  };
  AUTRES.forEach((c, k) => {
    const dossier = `${racine}/${c.titre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\W+/g, "")}_${9_000_000 + k}`;
    fichiers[`${dossier}/message_1.json`] = strToU8(JSON.stringify(convInventee(c.titre, c.noms, c.n, dossier)));
  });
  const nom = "instagram-noe.dupont-2026-09-10.zip";
  return {
    chemin: ecrire(testInfo.outputPath("exports", nom), zipSync(fichiers)),
    nom,
    messages: 64,
    vocaux: 2,
    convs: [{ titre: "Maëlys", messages: 64, groupe: false }, ...AUTRES.map((c) => ({ titre: c.titre, messages: c.n, groupe: c.noms.length > 2 }))],
  };
}

/* ———— Ce qui part du navigateur ———— */

/** Un champ d’un envoi : du texte, ou un fichier (son type, son nom, ses octets en base64). */
type Champ = { nom: string; texte?: string; type?: string; fichier?: string; octets?: string };
/** Un envoi du navigateur vers /api : son chemin, et son corps (les champs d’un formulaire, ou un texte JSON). */
export type Envoi = { chemin: string; champs: Champ[]; texte?: string };

/**
 * Note tout ce que la page envoie à /api, fichiers compris, au moment où elle l’envoie. À appeler avant d’ouvrir la page.
 * Playwright ne rend pas les fichiers d’un formulaire envoyé par Chromium (seulement ses champs de texte) : on les lit
 * donc dans la page, au départ de fetch. Pour vérifier ce qui quitte le téléphone (la conv choisie, des images et pas la
 * vidéo). Renvoie de quoi relire les envois vers un chemin (sans chemin : tous les envois à /api).
 */
export async function suivreLesEnvois(page: Page): Promise<(chemin?: string) => Promise<Envoi[]>> {
  await page.addInitScript(() => {
    const envois: unknown[] = [];
    Object.assign(window, { __envoisDuTest: envois });
    const fetchDOrigine = window.fetch.bind(window);
    const base64 = async (b: Blob) => {
      const octets = new Uint8Array(await b.arrayBuffer());
      let s = "";
      for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      return btoa(s);
    };
    window.fetch = async (entree, init) => {
      const url = new URL(entree instanceof Request ? entree.url : String(entree), location.href);
      if (url.pathname.startsWith("/api/") && init?.body != null) {
        const corps = init.body;
        if (corps instanceof FormData) {
          const champs: Champ[] = [];
          for (const [nom, v] of corps.entries()) champs.push(typeof v === "string" ? { nom, texte: v } : { nom, type: v.type, fichier: v.name, octets: await base64(v) });
          envois.push({ chemin: url.pathname, champs });
        } else envois.push({ chemin: url.pathname, champs: [], texte: typeof corps === "string" ? corps : `[${Object.prototype.toString.call(corps)}]` });
      }
      return fetchDOrigine(entree, init);
    };
  });
  return async (chemin) => ((await page.evaluate(() => (window as unknown as { __envoisDuTest: Envoi[] }).__envoisDuTest)) ?? []).filter((e) => !chemin || e.chemin === chemin);
}

/** Une requête du navigateur vers /api, vue de Playwright : son chemin, son type, et le poids de son corps (en octets). */
export type RequeteApi = { chemin: string; type: string; octets: number; corps: Buffer };

/**
 * Note toutes les requêtes de ce navigateur vers /api, d’où qu’elles partent (la page, un worker, un XHR, sendBeacon),
 * telles que Playwright les voit passer : leur type et leur corps. À appeler avant d’ouvrir la page. Renvoie de quoi les relire.
 */
export function suivreLesRequetes(page: Page): () => RequeteApi[] {
  const vues: RequeteApi[] = [];
  page.context().on("request", (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api/")) return;
    const corps = r.postDataBuffer() ?? Buffer.alloc(0);
    vues.push({ chemin: url.pathname, type: r.headers()["content-type"] ?? "", octets: corps.length, corps });
  });
  return () => [...vues];
}

/** Le paquet « export » d’un envoi à /api/import (du JSON compressé, préparé dans le navigateur), relu ici. */
export function paquetDe(envoi: Envoi): { nom: string; parties: { nom: string; contenu: string }[] } {
  const champ = envoi.champs.find((c) => c.nom === "export");
  if (!champ?.octets) throw new Error(`pas de paquet « export » dans l’envoi à ${envoi.chemin}`);
  return JSON.parse(gunzipSync(Buffer.from(champ.octets, "base64")).toString("utf8"));
}

/** Ce que contient un message_N.json envoyé : le titre de la conv, qui y écrit (par ordre alphabétique), combien de lignes. */
export function lireConvJson(contenu: string): { titre: string; auteurs: string[]; lignes: number } {
  const conv = JSON.parse(contenu) as ConvJson;
  return {
    titre: depuisInstagram(conv.title),
    auteurs: [...new Set(conv.messages.map((m) => depuisInstagram(m.sender_name)))].sort((a, b) => a.localeCompare(b, "fr")),
    lignes: conv.messages.length,
  };
}

/* ———— Les captures ———— */

/** La grille des captures choisies, dans l’ordre (/importer/captures). */
export const grilleDesCaptures = (page: Page) => page.getByRole("list", { name: "Tes captures, dans l’ordre" });

/** La vignette de la capture à la place `n`, sur `total`. */
export const vignette = (page: Page, n: number, total: number) => page.getByRole("button", { name: `Capture ${n} sur ${total}`, exact: true });

/** Le centre de la vignette à la place `n` sur `total` : là où le pointeur l’attrape, ou la pose. */
export async function centreDeLaVignette(page: Page, n: number, total: number): Promise<{ x: number; y: number }> {
  const b = await vignette(page, n, total).boundingBox();
  if (!b) throw new Error(`la vignette ${n} sur ${total} n’est pas à l’écran`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Une capture qui n’est pas une image (un fichier abîmé, ou un format que le navigateur ne sait pas ouvrir). */
export function captureIllisible(testInfo: TestInfo): string {
  return ecrire(testInfo.outputPath("captures", "capture-abimee.png"), Buffer.from("ceci n’est pas une image, juste du texte"));
}

/**
 * Les captures dans l’ordre où la grille les montre : le numéro du fichier (capture-N.png, aide/exports.ts) que chaque
 * vignette affiche. Chaque capture a sa couleur : on lit celle de l’image affichée dans la vignette, comme on la voit
 * (de capture-1.png à capture-20.png, la limite du serveur). L’image d’une capture qu’on vient de choisir arrive un peu
 * après sa vignette (une image réduite, tirée du fichier hors du fil principal ; le cadre gris en attendant) : on
 * l’attend, comme on l’attendrait à l’écran.
 */
export async function ordreAffiche(page: Page): Promise<number[]> {
  const vignettes = grilleDesCaptures(page).getByRole("button", { name: /^Capture \d+ sur \d+$/ });
  return Promise.all((await vignettes.all()).map(numeroDeLImage));
}

/* L’image d’une vignette, attendue 10 s au plus : au-delà, elle ne viendra pas (-1) */
const IMAGE_DE_LA_VIGNETTE = 10_000;

/* capturesPng peint capture-N.png en rouge 240 − 10 × (N − 1) : la couleur dit quel fichier la vignette montre (de 1 à 20) */
async function numeroDeLImage(vignette: Locator): Promise<number> {
  const rouge = await vignette.evaluate(async (bouton, attente) => {
    const fondAffiche = () => [...bouton.querySelectorAll<HTMLElement>("*")].map((e) => getComputedStyle(e).backgroundImage).find((f) => f.startsWith("url("));
    let fond = fondAffiche();
    for (const fin = performance.now() + attente; !fond && performance.now() < fin; fond = fondAffiche()) await new Promise((r) => setTimeout(r, 50));
    if (!fond) return -1;
    const image = await createImageBitmap(await (await fetch(fond.slice(5, -2))).blob());
    const toile = Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
    const ctx = toile.getContext("2d")!;
    ctx.drawImage(image, 20, 60, 1, 1, 0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[0]!;
  }, IMAGE_DE_LA_VIGNETTE);
  return rouge < 0 ? -1 : Math.round((240 - rouge) / 10) + 1;
}

/* ———— L’enregistrement d’écran ———— */

/**
 * Un enregistrement d’écran, comme celui de l’iPhone : on filme (l’enregistrement vidéo de Playwright, en WebM) une conv
 * inventée qu’on remonte doucement pendant trois secondes. La vidéo est faite par le navigateur du test, puis copiée
 * dans le dossier du test sous le nom d’un enregistrement.
 */
export async function enregistrementEcran(browser: Browser, testInfo: TestInfo): Promise<string> {
  const taille = { width: 200, height: 420 };
  const contexte = await browser.newContext({ viewport: taille, recordVideo: { dir: testInfo.outputPath("tournage"), size: taille } });
  const page = await contexte.newPage();
  const bulles = Array.from({ length: 60 }, (_, k) => {
    const moi = k % 3 !== 0;
    return `<p style="margin:8px 10px;padding:9px 12px;border-radius:16px;max-width:70%;font:15px sans-serif;${moi ? "margin-left:auto;background:#2f7bff;color:#fff" : "background:#e9e9eb"}">${moi ? "toi" : "Elias"} · message ${k + 1}</p>`;
  }).join("");
  /* Le bas de la conv d’abord, puis on remonte vers le début ; `fini` quand le geste est fait */
  await page.setContent(
    `<body style="margin:0;background:#fff">${bulles}<script>
      const haut = document.body.scrollHeight;
      scrollTo(0, haut);
      const t0 = performance.now();
      const pas = () => {
        const t = Math.min(1, (performance.now() - t0) / 3000);
        scrollTo(0, haut * (1 - t));
        if (t < 1) requestAnimationFrame(pas); else window.fini = true;
      };
      requestAnimationFrame(pas);
    </script></body>`,
  );
  await page.waitForFunction(() => (window as unknown as { fini?: boolean }).fini === true, null, { timeout: RESEAU });
  await contexte.close();
  const video = page.video();
  if (!video) throw new Error("pas d’enregistrement");
  const chemin = testInfo.outputPath("captures", "Enregistrement de l’écran.webm");
  mkdirSync(dirname(chemin), { recursive: true });
  copyFileSync(await video.path(), chemin);
  return chemin;
}
