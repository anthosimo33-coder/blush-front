#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * La lecture d’un enregistrement d’écran (prompt 01, par lots de six écrans) avec le VRAI modèle, modèle contre modèle.
 * Une conv de test (prompts/evals) est dessinée comme un fil iMessage, filmée écran par écran comme la vidéo qu’on remonte
 * (un écran gardé tous les 40 % de hauteur, réduit comme dans le navigateur), lue lot par lot (cinq à la fois), puis
 * les lots sont rassemblés comme en ligne (fusionnerLots) et comparés mot pour mot à la conv.
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:video -- <cas> <n messages> <modèle[:effort]>…
 * Sans modèle : les écrans seulement, dans ESSAI_ECRANS. ESSAI_FLOU (px) et ESSAI_QUALITE (JPEG) les dégradent.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requeteCaptures } from "@prompts/lib/contextes";
import { lire, type Histoire } from "@prompts/lib/conv";
import { Sortie01, type Captures } from "@prompts/lib/schemas";
import { appeler, definirFournisseur, prestataireSDK } from "@/server/ia/claude";
import { fusionnerLots } from "@/server/video";
import { createRequire } from "node:module";

const [id = "10", n = "200", ...variantes] = process.argv.slice(2);
/* Un cas du banc (prompts/evals/cas.json), lu comme l’appli le lit */
const EVALS = join(import.meta.dirname, "../prompts/evals");
type Cas = Pick<Histoire, "utilisateur" | "autre" | "format"> & { id: string; fichier: string };
const cas = (JSON.parse(readFileSync(join(EVALS, "cas.json"), "utf8")) as Cas[]).find((c) => c.id === id);
if (!cas) throw new Error(`cas inconnu : ${id}`);
const MEDIAS = { vocal: "vocal", photo: "photo", vidéo: "video", autocollant: "autocollant" } as const;
const messages = lire(readFileSync(join(EVALS, cas.fichier), "utf8"), cas)
  .messages.filter((m) => !m.media || m.media in MEDIAS)
  .slice(-+n);
const pad = (x: number) => String(x).padStart(2, "0");
const derniere = messages.at(-1)!.t;
const aujourdhui = Date.parse(`${new Date(derniere + 86400e3).toISOString().slice(0, 10)}T00:00:00Z`);

/* La vérité, et les repères comme iMessage les écrit */
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const etiquette = (t: number) => {
  const d = new Date(t);
  const h = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const jours = Math.round((aujourdhui - Date.parse(`${d.toISOString().slice(0, 10)}T00:00:00Z`)) / 86400e3);
  if (jours === 0) return `Aujourd’hui ${h}`;
  if (jours === 1) return `Hier ${h}`;
  if (jours < 7) return `${JOURS[d.getUTCDay()]} ${h}`;
  return `${JOURS[d.getUTCDay()]!.slice(0, 3)}. ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} à ${h}`;
};
type Vrai = { de: "moi" | "autre"; texte: string; media: string | null; reaction: string | null };
const blocs: { repere: { date: string; heure: string }; label: string; messages: Vrai[] }[] = [];
let avant: number | null = null;
messages.forEach((m, k) => {
  const d = new Date(m.t);
  if (avant === null || m.t - avant > 3600e3)
    blocs.push({ repere: { date: d.toISOString().slice(0, 10), heure: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }, label: etiquette(m.t), messages: [] });
  const media = m.media ? MEDIAS[m.media as keyof typeof MEDIAS] : null;
  blocs.at(-1)!.messages.push({ de: m.role === "toi" ? "moi" : "autre", texte: media ? "" : m.texte, media, reaction: k === 5 || k === 40 ? "❤️" : null });
  avant = m.t;
});

/* Le fil iMessage (clair), 393 × 852 points comme un iPhone, l’en-tête et le champ du bas fixes */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
const bulle = (m: Vrai, dernier: boolean) => {
  const cote = m.de === "moi" ? "r" : "l";
  const re = m.reaction ? `<span class="re">${m.reaction}</span>` : "";
  if (m.media === "photo" || m.media === "video")
    return `<div class="${cote}"><div class="img">${m.media === "video" ? '<span class="play">▶</span><span class="duree">0:23</span>' : ""}${re}</div></div>`;
  if (m.media === "autocollant") return `<div class="${cote}"><div class="sticker">🐻${re}</div></div>`;
  if (m.media === "vocal")
    return `<div class="${cote}"><div class="b ${dernier ? "queue" : ""} vocal"><span class="pl">▶</span>${"<i></i>".repeat(26)}<span class="dv">0:14</span>${re}</div></div>`;
  return `<div class="${cote}"><div class="b ${dernier ? "queue" : ""}">${esc(m.texte)}${re}</div></div>`;
};
const fil = blocs
  .map(
    (b) =>
      `<div class="sep"><b>${b.label.split(" ").slice(0, -1).join(" ")}</b> ${b.label.split(" ").at(-1)}</div>` +
      b.messages.map((m, i) => bulle(m, i === b.messages.length - 1 || b.messages[i + 1]!.de !== m.de)).join(""),
  )
  .join("");
const autre = cas.autre.prenom;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,system-ui,"SF Pro Text",sans-serif;background:#fff;width:393px;-webkit-font-smoothing:antialiased}
.haut{position:fixed;top:0;left:0;right:0;height:132px;background:rgba(249,249,249,.94);border-bottom:.5px solid #d1d1d6;z-index:2}
.st{display:flex;justify-content:space-between;padding:16px 32px 0 42px;font:600 17px -apple-system,system-ui}
.nav{position:absolute;bottom:8px;left:0;right:0;text-align:center}
.av{width:52px;height:52px;border-radius:50%;background:linear-gradient(#a5abb8,#858994);color:#fff;font:500 22px/52px system-ui;margin:0 auto 4px}
.nom{font:400 12px system-ui;color:#000}
.ret{position:absolute;left:10px;top:20px;color:#0a84ff;font:400 34px system-ui}
.bas{position:fixed;bottom:0;left:0;right:0;height:84px;background:#fff;display:flex;gap:10px;padding:8px 12px;z-index:2}
.plus{width:34px;height:34px;border-radius:50%;background:#e9e9eb;color:#8e8e93;font:300 26px/32px system-ui;text-align:center}
.champ{flex:1;height:36px;border:1px solid #c7c7cc;border-radius:18px;color:#c7c7cc;font:17px/34px system-ui;padding:0 14px}
.fil{padding:142px 0 96px}
.sep{text-align:center;color:#8e8e93;font:400 12px system-ui;margin:16px 0 8px}.sep b{font-weight:600}
.l,.r{display:flex;padding:0 16px;margin-top:2px}.r{justify-content:flex-end}
.l+.r,.r+.l{margin-top:10px}
.b{position:relative;max-width:264px;padding:7px 13px;border-radius:19px;font:17px/22px system-ui;letter-spacing:-.2px;word-wrap:break-word}
.l .b{background:#e9e9eb;color:#000}.r .b{background:#0a84ff;color:#fff}
.vocal{display:flex;align-items:center;gap:2px;width:210px}.vocal i{display:inline-block;width:3px;border-radius:2px;background:currentColor;opacity:.75;height:6px}
.vocal i:nth-child(3n){height:16px}.vocal i:nth-child(4n){height:11px}.vocal i:nth-child(5n){height:20px}
.pl{margin-right:6px;font-size:14px}.dv{margin-left:8px;font-size:14px;opacity:.85}
.img{position:relative;width:220px;height:290px;border-radius:18px;background:linear-gradient(160deg,#f6c8a0,#c77d6a 45%,#3d4f73)}
.play{position:absolute;inset:0;margin:auto;width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font:24px/56px system-ui;text-align:center}
.duree{position:absolute;right:10px;bottom:8px;color:#fff;font:600 13px system-ui}
.sticker{position:relative;font-size:96px;line-height:110px}
.re{position:absolute;top:-16px;right:-10px;background:#e9e9eb;border:2px solid #fff;border-radius:16px;padding:2px 7px;font-size:15px;line-height:20px}
.l .re{right:auto;left:auto;right:-14px}
</style></head><body>
<div class="haut"><div class="st"><span>21:41</span><span>●●● 5G ▭</span></div><span class="ret">‹</span><div class="nav"><div class="av">${esc(autre.slice(0, 1).toUpperCase())}</div><div class="nom">${esc(autre)} ›</div></div></div>
<div class="fil">${fil}</div>
<div class="bas"><span class="plus">+</span><span class="champ">iMessage</span></div>
</body></html>`;

/* Filmé comme une vidéo qu’on remonte : un écran tous les 40 % de hauteur, du bas vers le haut, puis remis dans l’ordre */
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core") as typeof import("playwright-core");
const H = 852;
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 393, height: H }, deviceScaleFactor: 1568 / H });
await page.setContent(html);
/* ESSAI_FLOU (en px) et ESSAI_QUALITE : des écrans dégradés, comme une vidéo compressée qui défile */
if (process.env.ESSAI_FLOU) await page.addStyleTag({ content: `.fil{filter:blur(${process.env.ESSAI_FLOU}px)}` });
const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
const positions: number[] = [];
for (let y = hauteur - H; y > 0; y -= Math.round(H * 0.4)) positions.push(y);
positions.push(0);
const ecrans: Buffer[] = [];
for (const y of positions) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  ecrans.push(await page.screenshot({ type: "jpeg", quality: +(process.env.ESSAI_QUALITE ?? 72) }));
}
await navigateur.close();
ecrans.reverse();
/* Sans variante : seulement les écrans, dans le dossier ESSAI_ECRANS, pour les regarder */
if (!variantes.length) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const dossier = process.env.ESSAI_ECRANS ?? "ecrans-essai";
  mkdirSync(dossier, { recursive: true });
  ecrans.forEach((b, k) => writeFileSync(`${dossier}/ecran-${pad(k + 1)}.jpg`, b));
  console.log(`${ecrans.length} écrans dans ${dossier}`);
  process.exit(0);
}

/* Les lots de l’import : six écrans, chacun reprenant le dernier du précédent */
const lots: Buffer[][] = [];
for (let i = 0; i < ecrans.length;) {
  const j = Math.min(ecrans.length, i + 6);
  lots.push(ecrans.slice(i, j));
  if (j >= ecrans.length) break;
  i = j - 1;
}

/* Le vrai SDK, avec le modèle de la variante, et l’usage de chaque réponse noté au passage */
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sdk = prestataireSDK(() => client);
let modele = "claude-opus-5-5";
const usages: { input_tokens: number; output_tokens: number }[] = [];
definirFournisseur({
  async envoyer(d, o, e) {
    const r = await sdk.envoyer({ ...d, params: { ...d.params, model: modele } }, o, e);
    const u = r.usage;
    usages.push({ input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output_tokens: u.output_tokens ?? 0 });
    return r;
  },
});

const norm = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/(\p{Extended_Pictographic})\s+(?=\p{Extended_Pictographic})/gu, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const cle = (m: { de: string; texte: string; media: string | null }) => `${m.de}|${m.media ? `[${m.media}]` : norm(m.texte)}`;
const vrais = blocs.flatMap((b) => b.messages);
const reperesVrais = blocs.map((b) => `${b.repere.date} ${b.repere.heure}`);

console.log(`cas ${cas.id} (${autre}) · ${vrais.length} messages · ${blocs.length} repères · ${ecrans.length} écrans · ${lots.length} lots`);
for (const v of variantes) {
  const [m, effort] = v.split(":") as [string, "low" | "medium" | "high" | undefined];
  modele = m;
  usages.length = 0;
  const t0 = Date.now();
  const lus: Captures[] = new Array(lots.length);
  const durees: number[] = [];
  let cout = 0;
  let suivant = 0;
  const lecteur = async () => {
    while (suivant < lots.length) {
      const k = suivant++;
      const t = Date.now();
      const req = {
        ...requeteCaptures({
          prenom: "l’utilisateur",
          autre: null,
          appli: "imessage",
          aujourdhui,
          images: lots[k]!.map((b) => ({ media: "image/jpeg" as const, base64: b.toString("base64") })),
        }),
        ...(effort ? { effort } : {}),
      };
      const a = await appeler(req, Sortie01, { etiquette: "essai_video" });
      if (!a.sortie) throw new Error(`lot ${k + 1} : sortie illisible (${a.stop})`);
      lus[k] = a.sortie;
      cout += a.cout;
      durees.push((Date.now() - t) / 1000);
    }
  };
  await Promise.all(Array.from({ length: 5 }, lecteur));
  const f = fusionnerLots(lus, "imessage");
  const lusMsgs = f.blocs.flatMap((b) => b.messages);
  const A = vrais.map(cle);
  const B = lusMsgs.map(cle);
  const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i]![j] = A[i] === B[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const manques: string[] = [];
  const enTrop: string[] = [];
  for (let i = 0, j = 0; i < A.length || j < B.length;) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      i++;
      j++;
    } else if (j < B.length && (i === A.length || L[i]![j + 1]! >= L[i + 1]![j]!)) enTrop.push(B[j++]!);
    else manques.push(A[i++]!);
  }
  const reperes = f.blocs.filter((b) => b.repere).map((b) => `${b.repere!.date} ${b.repere!.heure ?? ""}`.trim());
  const entree = usages.reduce((s, u) => s + u.input_tokens, 0) / usages.length;
  const sortie = usages.reduce((s, u) => s + u.output_tokens, 0) / usages.length;
  console.log(
    `\n== ${v} · ${((Date.now() - t0) / 1000).toFixed(0)} s en tout · ${(cout / lots.length).toFixed(4)} $ par lot (${cout.toFixed(3)} $) · ${Math.round(entree)} jetons en entrée, ${Math.round(sortie)} en sortie par lot · ${(durees.reduce((a, b) => a + b, 0) / durees.length).toFixed(1)} s par lot`,
  );
  console.log(
    `messages : ${L[0]![0]} / ${A.length} mot pour mot (${((100 * L[0]![0]!) / A.length).toFixed(1)} %) · ${B.length} écrits · manquants ${manques.length} · en trop ${enTrop.length} · repères justes ${reperes.filter((r) => reperesVrais.includes(r)).length} / ${reperesVrais.length} · réactions ${lusMsgs.filter((x) => x.reaction).length} / 2 · autre : ${f.autre}`,
  );
  for (const x of manques) console.log(`  − manque : ${x}`);
  for (const x of enTrop) console.log(`  + en trop : ${x}`);
}
process.exit(0);
