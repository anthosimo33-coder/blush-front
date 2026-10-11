import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lire, PROBLEMES_MAX, type Histoire } from "@prompts/lib/conv";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";
import { imagesDe } from "@/server/captures";
import { borner, depuisFichier, depuisPaquet, ErreurImport, LIGNE_MAX, LIGNES_MAX, TEXTE_LU_MAX } from "@/server/import";

/*
 * L’import anonyme (S-11) : ce que lit le serveur est borné avant la lecture, et la lecture reste linéaire, même sur un
 * export forgé pour la faire durer. Chaque piège ci-dessous prenait des secondes (ou des Go) avant ; il doit tenir en
 * une fraction de seconde. Les prénoms sont inventés.
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
const chrono = <T>(f: () => T): [T, number] => {
  const t0 = performance.now();
  const r = f();
  return [r, performance.now() - t0];
};
/* Une borne large (une machine de CI lente) : les pièges prenaient de 5 s à plusieurs minutes */
const VITE_MS = 1500;

const paquet = (contenu: string, nom = "_chat.txt") => new File([gzipSync(JSON.stringify({ nom: "export", parties: [{ nom, contenu }] }))], "export.json.gz");

describe("borner : ce que lit le serveur d’un export", () => {
  it("une conv ordinaire passe telle quelle, sans être dite coupée", () => {
    const lu = { appli: "whatsapp" as const, texte: exporter(500), nom: "chat.txt" };
    expect(borner(lu)).toBe(lu);
  });

  it("au-delà de TEXTE_LU_MAX, garde sa partie la plus récente, coupée au début d’un message, et le dit", () => {
    const texte = exporter(130_000, (k) => `message ${k} ${"x".repeat(40)}`);
    expect(texte.length).toBeGreaterThan(TEXTE_LU_MAX);
    const b = borner({ appli: "whatsapp", texte, nom: "chat.txt" });
    expect(b.coupe).toBe(true);
    expect(b.texte.length).toBeLessThanOrEqual(TEXTE_LU_MAX);
    expect(b.texte).toMatch(/^\[\d{2}\/\d{2}\/\d{4} /);
    expect(texte.endsWith(b.texte)).toBe(true);
  });

  it("au-delà de LIGNES_MAX, garde les plus récentes, sans couper un message en deux", () => {
    const texte = exporter(LIGNES_MAX / 2 + 10, undefined, true);
    expect(texte.length).toBeLessThan(TEXTE_LU_MAX);
    const b = borner({ appli: "whatsapp", texte, nom: "chat.txt" });
    expect(b.coupe).toBe(true);
    expect(b.texte.split("\n").length).toBeLessThanOrEqual(LIGNES_MAX);
    expect(b.texte).toMatch(/^\[\d{2}\/\d{2}\/\d{4} /);
    expect(texte.endsWith(b.texte)).toBe(true);
    /* La coupe garde ce qui était déjà dit coupé (par le navigateur) */
    expect(borner({ appli: "whatsapp", texte: exporter(10), nom: "x", coupe: true }).coupe).toBe(true);
  });

  it("une ligne de plus de LIGNE_MAX : refusé", () => {
    const texte = exporter(100, (k) => (k === 50 ? "a".repeat(LIGNE_MAX + 1) : `message ${k}`));
    expect(() => borner({ appli: "whatsapp", texte, nom: "chat.txt" })).toThrow(ErreurImport);
    expect(borner({ appli: "whatsapp", texte: exporter(100, (k) => (k === 50 ? "a".repeat(LIGNE_MAX - 100) : `${k}`)), nom: "chat.txt" }).coupe).toBeUndefined();
  });

  it("le fichier et le paquet passent par là", async () => {
    const texte = `${"x\n".repeat(LIGNES_MAX + 5)}${exporter(10)}`;
    /* Des lignes illisibles par centaines de milliers, puis quelques messages : seuls les plus récents restent */
    const lu = await depuisPaquet(paquet(texte));
    expect(lu).toMatchObject({ coupe: true });
    expect(lu.texte).toBe(exporter(10));
    /* Que des lignes illisibles, sans un début de message après la coupe : ce n’est pas un export */
    await expect(depuisPaquet(paquet("x\n".repeat(LIGNES_MAX + 5)))).rejects.toBeInstanceOf(ErreurImport);
    await expect(depuisFichier(new File([exporter(20, (k) => (k === 3 ? "b".repeat(LIGNE_MAX + 1) : "ok"))], "chat.txt"))).rejects.toMatchObject({ code: "fichier" });
  });
});

describe("des exports piégés, lus en temps borné", () => {
  it("des centaines de milliers de lignes illisibles : 100 problèmes notés, pas un de plus", () => {
    const texte = `${entete(0)}Tom: audio omitted\n${"?\n".repeat(400_000)}`;
    const [lu, ms] = chrono(() => lire(texte, h));
    expect(lu.problemes).toHaveLength(PROBLEMES_MAX);
    expect(ms).toBeLessThan(VITE_MS);
  });

  it("un message de milliers d’espaces (la marque « modifié », un média en légende)", () => {
    const espaces = " ".repeat(150_000);
    const texte = [`${entete(0)}Tom: a${espaces}b`, `${entete(1)}Léa: a${espaces}<This message was edited>x`, `${entete(2)}Tom: x${espaces}image omitted${espaces}y`, `${entete(3)}Léa: ok${espaces}<Ce message a été modifié>${espaces}`].join("\n");
    const [lu, ms] = chrono(() => lire(texte, h));
    expect(ms).toBeLessThan(VITE_MS);
    expect(lu.messages).toHaveLength(4);
    /* La marque d’un message modifié, et les espaces qui l’entourent, partent toujours */
    expect(lu.messages[3].texte).toBe("ok");
  });

  it("un nom de fichier joint forgé (« -AUDIO- » des milliers de fois)", () => {
    const texte = `${entete(0)}Tom: <attached: ${"-AUDIO-".repeat(9000)}\n${entete(1)}Léa: <attached: 00000012-AUDIO-2024-01-01-09-07-00.opus>`;
    const [lu, ms] = chrono(() => lire(texte, h));
    expect(ms).toBeLessThan(VITE_MS);
    expect(lu.messages.map((m) => m.media ?? null)).toEqual([null, "vocal"]);
  });

  it("Instagram HTML : des « <audio » sans fin, des « < » sans « > », des <h2 et des liens sans fin", () => {
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
      const [r, ms] = chrono(() => depuisInstagramHtml(`<html><body>${piege}${bloc("on se voit ?")}</body></html>`));
      expect(ms).toBeLessThan(VITE_MS);
      expect(r.texte).toContain("on se voit ?");
    }
  });

  it("Instagram JSON : un message forgé pour la reconnaissance des lignes système", () => {
    const messages = [
      { sender_name: "Léa", timestamp_ms: debut, content: `${"reacted ".repeat(60_000)}x` },
      { sender_name: "Léa", timestamp_ms: debut + 60e3, content: "Léa a réagi ❤️ à votre message" },
      { sender_name: "Tom", timestamp_ms: debut + 120e3, content: "on se voit ?" },
    ];
    const [r, ms] = chrono(() => depuisInstagramJson(JSON.stringify({ messages })));
    expect(ms).toBeLessThan(VITE_MS);
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
    for (const octets of [[0x47, 0x49, 0x46, 0x38], [0x25, 0x50, 0x44, 0x46], [...new TextEncoder().encode("<svg ")], [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]]) {
      await expect(imagesDe([image(octets, "image/png")])).rejects.toMatchObject({ code: "fichier" });
    }
    await expect(imagesDe([image(PNG, "text/plain")])).rejects.toBeInstanceOf(ErreurImport);
  });
});
