import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { detecterFormat, lire, participantsDe, PROBLEMES_MAX, type Histoire } from "@prompts/lib/conv";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";
import { imagesDe } from "@/server/captures";
import { borner, depuisFichier, depuisPaquet, ErreurImport, LIGNE_MAX, LIGNES_MAX, TEXTE_LU_MAX_CARACTERES } from "@/server/import";

/*
 * L’import anonyme (S-11) : ce que lit le serveur est borné avant la lecture, et la lecture reste linéaire, même sur un
 * export forgé pour la faire durer. Chaque piège ci-dessous prenait des secondes (ou des Go) avant ; il doit se lire
 * à peu près comme une conv ordinaire de même taille. Les prénoms sont inventés.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const debut = Date.UTC(2024, 0, 1, 9, 0);
const entete = (k: number) => {
  const d = new Date(debut + k * 7 * 60e3);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] `;
};
/** Un export WhatsApp de `n` messages ; `suite` : chaque message a une seconde ligne. */
const exporter = (n: number, texte = (k: number) => `message ${k}`, suite = false) =>
  Array.from({ length: n }, (_, k) => `${entete(k)}${k % 2 ? "Léa" : "Tom"}: ${texte(k)}${suite ? "\nla suite" : ""}`).join("\n");

const h: Pick<Histoire, "utilisateur" | "autre" | "format"> = {
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
  format: "whatsapp-ios",
};

/** La durée d’un appel, en millisecondes. */
const chrono = async <T>(f: () => T | Promise<T>): Promise<[T, number]> => {
  const t0 = performance.now();
  const r = await f();
  return [r, performance.now() - t0];
};

const paquet = (contenu: string, nom = "_chat.txt") => new File([gzipSync(JSON.stringify({ nom: "export", parties: [{ nom, contenu }] }))], "export.json.gz");
/** Un paquet lu comme à l’import (src/server/histoires.ts, importer) : le format, les participants, puis la lecture. */
const importer = async (p: File) => {
  const { texte } = await depuisPaquet(p);
  detecterFormat(texte);
  participantsDe(texte);
  return lire(texte, h, { autresEnTexte: true });
};

describe("borner : ce que lit le serveur d’un export", () => {
  it("une conv ordinaire passe telle quelle, sans être dite coupée", () => {
    const lu = { appli: "whatsapp" as const, texte: exporter(500), nom: "chat.txt" };
    expect(borner(lu)).toBe(lu);
  });

  it("au-delà de TEXTE_LU_MAX_CARACTERES, garde sa partie la plus récente, coupée au début d’un message, et le dit", () => {
    const texte = exporter(Math.ceil(TEXTE_LU_MAX_CARACTERES / 100_000) + 20, (k) => `${k} ${"x".repeat(100_000)}`);
    expect(texte.length).toBeGreaterThan(TEXTE_LU_MAX_CARACTERES);
    const b = borner({ appli: "whatsapp", texte, nom: "chat.txt" });
    expect(b.coupe).toBe(true);
    expect(b.texte.length).toBeLessThanOrEqual(TEXTE_LU_MAX_CARACTERES);
    expect(b.texte).toMatch(/^\[\d{2}\/\d{2}\/\d{4} /);
    expect(texte.endsWith(b.texte)).toBe(true);
  });

  it("au-delà de LIGNES_MAX, garde les plus récentes, sans couper un message en deux", () => {
    const texte = exporter(LIGNES_MAX / 2 + 10, undefined, true);
    expect(texte.length).toBeLessThan(TEXTE_LU_MAX_CARACTERES);
    const b = borner({ appli: "whatsapp", texte, nom: "chat.txt" });
    expect(b.coupe).toBe(true);
    expect(b.texte.split("\n").length).toBeLessThanOrEqual(LIGNES_MAX);
    expect(b.texte).toMatch(/^\[\d{2}\/\d{2}\/\d{4} /);
    expect(texte.endsWith(b.texte)).toBe(true);
    /* La coupe garde ce qui était déjà dit coupé (par le navigateur) */
    expect(borner({ appli: "whatsapp", texte: exporter(10), nom: "x", coupe: true }).coupe).toBe(true);
  });

  it("une ligne de plus de LIGNE_MAX : tronquée, sans couper un emoji, et l’import continue", () => {
    const texte = exporter(100, (k) => (k === 50 ? "a".repeat(LIGNE_MAX + 1) : `message ${k}`));
    const b = borner({ appli: "whatsapp", texte, nom: "chat.txt" });
    expect(b.coupe).toBeUndefined();
    const lignes = b.texte.split("\n");
    expect(lignes).toHaveLength(100);
    expect(lignes[50]).toHaveLength(LIGNE_MAX);
    expect(lignes.filter((_, k) => k !== 50)).toEqual(texte.split("\n").filter((_, k) => k !== 50));
    /* Des emojis (deux unités chacun) : la coupe ne laisse pas une moitié d’emoji */
    const emojis = borner({ appli: "whatsapp", texte: exporter(3, (k) => (k === 1 ? "😀".repeat(LIGNE_MAX) : "ok")), nom: "chat.txt" }).texte.split("\n")[1]!;
    expect(emojis.length).toBeLessThanOrEqual(LIGNE_MAX);
    expect(emojis.endsWith("😀")).toBe(true);
    expect(borner({ appli: "whatsapp", texte: exporter(100, (k) => (k === 50 ? "a".repeat(LIGNE_MAX - 100) : `${k}`)), nom: "chat.txt" }).coupe).toBeUndefined();
  });

  it("un message de 65 536 caractères (le plus long que WhatsApp permet) passe tel quel, et se lit", async () => {
    const long = "x".repeat(65_536);
    const texte = exporter(200, (k) => (k === 100 ? long : `message ${k}`));
    const lu = await depuisFichier(new File([texte], "chat.txt"));
    expect(lu.texte).toBe(texte);
    expect(lu.coupe).toBeUndefined();
    expect(lire(lu.texte, h).messages).toHaveLength(200);
  });

  it("une conv que le navigateur envoie entière (des Mo, des centaines de milliers de messages) n’est pas coupée", () => {
    const texte = exporter(400_000, (k) => `message numéro ${k}, on se voit quand ?`);
    expect(texte.length).toBeGreaterThan(20_000_000);
    const lu = { appli: "whatsapp" as const, texte, nom: "chat.txt" };
    expect(borner(lu)).toBe(lu);
  });

  it("le fichier et le paquet passent par là", async () => {
    const texte = `${"x\n".repeat(LIGNES_MAX + 5)}${exporter(10)}`;
    /* Des lignes illisibles par centaines de milliers, puis quelques messages : seuls les plus récents restent */
    const lu = await depuisPaquet(paquet(texte));
    expect(lu).toMatchObject({ coupe: true });
    expect(lu.texte).toBe(exporter(10));
    /* Que des lignes illisibles, sans un début de message après la coupe : ce n’est pas un export */
    await expect(depuisPaquet(paquet("x\n".repeat(LIGNES_MAX + 5)))).rejects.toBeInstanceOf(ErreurImport);
    expect((await depuisFichier(new File([exporter(20, (k) => (k === 3 ? "b".repeat(LIGNE_MAX + 1) : "ok"))], "chat.txt"))).texte.split("\n")[3]).toHaveLength(LIGNE_MAX);
  });
});

describe("des exports piégés, lus en temps borné", () => {
  /*
   * La borne suit la machine : chaque piège se mesure à l’import d’une conv ordinaire de 6 Mo (la taille du plus gros),
   * chronométré dans le même fichier, donc sur la même machine et sous la même couverture. Une borne en millisecondes
   * (1,5 s) a fait échouer deux mises en ligne : la CI, sous la couverture v8, lit trois à cinq fois plus lentement qu’en
   * local, et le plus gros piège, 0,3 s ici, y a pris 1,6 s. Un piège lu en temps linéaire coûte au plus une fois cette
   * conv ; avant les correctifs, ceux qui duraient en coûtaient de 20 à plus de 1 000 fois (de 6 s à plus de 10 min).
   */
  const FOIS = 4;
  let ordinaireMs = 0;
  beforeAll(async () => {
    const texte = exporter(93_000, (k) => `message numéro ${k}, on se voit quand ?`);
    expect(texte.length).toBeGreaterThan(6_000_000);
    const ordinaire = paquet(texte);
    const [lu, ms] = await chrono(() => importer(ordinaire));
    expect(lu.messages).toHaveLength(93_000);
    ordinaireMs = ms;
  });
  /** Le piège s’est lu en moins de FOIS fois la conv ordinaire. */
  const viteLu = (ms: number) => expect(ms, `${Math.round(ms)} ms, pour ${Math.round(ordinaireMs)} ms la conv ordinaire`).toBeLessThan(FOIS * ordinaireMs);

  it("des en-têtes suivis de « a: » des milliers de fois, finis par un « \\r » seul, un U+2028 ou un U+2029", async () => {
    for (const fin of ["\r", "\u2028", "\u2029"]) {
      const piege = Array.from({ length: 100 }, (_, k) => `${entete(k)}${k % 2 ? "Léa" : "Tom"}: ${"a: ".repeat(21_000)}${fin}`).join("\n");
      expect(piege.length).toBeGreaterThan(6_000_000);
      /* Chaque étape de l’import relit chaque en-tête ; le paquet se prépare avant, comme dans le navigateur */
      const p = paquet(piege);
      const [lu, ms] = await chrono(() => importer(p));
      viteLu(ms);
      /* Le texte va jusqu’au bout de la ligne, quoi qu’il contienne : chaque en-tête est un message */
      expect(lu.messages).toHaveLength(100);
    }
  });

  it("des centaines de milliers de lignes illisibles : 100 problèmes notés, pas un de plus", async () => {
    const texte = `${entete(0)}Tom: audio omitted\n${"?\n".repeat(400_000)}`;
    const [lu, ms] = await chrono(() => lire(texte, h));
    expect(lu.problemes).toHaveLength(PROBLEMES_MAX);
    viteLu(ms);
  });

  it("un message de milliers d’espaces (la marque « modifié », un média en légende)", async () => {
    const espaces = " ".repeat(150_000);
    const texte = [
      `${entete(0)}Tom: a${espaces}b`,
      `${entete(1)}Léa: a${espaces}<This message was edited>x`,
      `${entete(2)}Tom: x${espaces}image omitted${espaces}y`,
      `${entete(3)}Léa: ok${espaces}<Ce message a été modifié>${espaces}`,
    ].join("\n");
    const [lu, ms] = await chrono(() => lire(texte, h));
    viteLu(ms);
    expect(lu.messages).toHaveLength(4);
    /* La marque d’un message modifié, et les espaces qui l’entourent, partent toujours */
    expect(lu.messages[3]!.texte).toBe("ok");
  });

  it("un nom de fichier joint forgé (« -AUDIO- » des milliers de fois)", async () => {
    const texte = `${entete(0)}Tom: <attached: ${"-AUDIO-".repeat(9000)}\n${entete(1)}Léa: <attached: 00000012-AUDIO-2024-01-01-09-07-00.opus>`;
    const [lu, ms] = await chrono(() => lire(texte, h));
    viteLu(ms);
    expect(lu.messages.map((m) => m.media ?? null)).toEqual([null, "vocal"]);
  });

  it("Instagram HTML : des « <audio » sans fin, des « < » sans « > », des <h2 et des liens sans fin", async () => {
    const bloc = (contenu: string, nom = "Léa") =>
      `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${nom}</h2><div class="_3-95 _a6-p"><div>${contenu}</div></div><div class="_3-94 _a6-o">sep 18, 2026 8:29 am</div></div>`;
    for (const piege of [
      bloc("<audio ".repeat(120_000)),
      bloc("<video x".repeat(120_000)),
      bloc("<".repeat(200_000)),
      bloc('<a href="x/audio/1.ogg">'.repeat(50_000)),
      bloc(`${"<a b".repeat(100_000)}>`),
      bloc('<ul class="_a6-q">'.repeat(80_000)),
      bloc("<img".repeat(50_000)),
      bloc("salut", "<h2".repeat(120_000)),
    ]) {
      const [r, ms] = await chrono(() => depuisInstagramHtml(`<html><body>${piege}${bloc("on se voit ?")}</body></html>`));
      viteLu(ms);
      expect(r.texte).toContain("on se voit ?");
    }
  });

  it("Instagram HTML : une entité au-delà d’Unicode (« &#x110000; ») reste telle quelle, le fichier se lit", async () => {
    const html = `<html><body><div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Léa</h2><div class="_3-95 _a6-p"><div>salut &#x110000; &#99999999999; &#x1F600;</div></div><div class="_3-94 _a6-o">sep 18, 2026 8:29 am</div></div></body></html>`;
    expect(depuisInstagramHtml(html).texte).toContain("salut &#x110000; &#99999999999; 😀");
    const lu = await depuisFichier(new File([html], "message_1.html"));
    expect(lu.texte).toContain("&#x110000;");
  });

  it("Instagram JSON : un message forgé pour la reconnaissance des lignes système", async () => {
    const messages = [
      { sender_name: "Léa", timestamp_ms: debut, content: `${"reacted ".repeat(60_000)}x` },
      { sender_name: "Léa", timestamp_ms: debut + 60e3, content: "Léa a réagi ❤️ à votre message" },
      { sender_name: "Tom", timestamp_ms: debut + 120e3, content: "on se voit ?" },
    ];
    const [r, ms] = await chrono(() => depuisInstagramJson(JSON.stringify({ messages })));
    viteLu(ms);
    /* La réaction reste une ligne système (retirée) ; le texte forgé, trop long pour en être une, reste un message */
    expect(r.messages).toBe(2);
  });
});

describe("les captures : le type lu dans les octets (S-39)", () => {
  const image = (octets: number[], type: string) => new File([new Uint8Array([...octets, ...new Uint8Array(16)])], "capture", { type });
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

  it("PNG, JPEG et WEBP, d’après leurs octets, quel que soit le type déclaré", async () => {
    const images = await imagesDe([image(PNG, "image/jpeg"), image(JPEG, "image/png"), image(WEBP, "image/png")]);
    expect(images.map((i) => i.media)).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("autre chose qu’une image, même déclarée image : refusé", async () => {
    for (const octets of [
      [0x47, 0x49, 0x46, 0x38],
      [0x25, 0x50, 0x44, 0x46],
      [...new TextEncoder().encode("<svg ")],
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45],
    ]) {
      await expect(imagesDe([image(octets, "image/png")])).rejects.toMatchObject({ code: "fichier" });
    }
    await expect(imagesDe([image(PNG, "text/plain")])).rejects.toBeInstanceOf(ErreurImport);
  });
});
