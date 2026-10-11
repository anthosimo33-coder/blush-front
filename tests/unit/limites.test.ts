import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CAPTURES_MAX, CODE_MINUTES, CORPS_VERCEL_MAX, ENVOI_EXPORT_MAX, ENVOI_IMAGES_MAX, extensionAudio, TEXTE_CONV_MAX } from "@/lib/limites";
import { imagesDe } from "@/server/captures";
import { depuisFichier, depuisPaquet, ErreurImport } from "@/server/histoires";
import { mailCode } from "@/server/mail-code";
import { analyserExport, ExportIllisible, lireFichiers } from "@/services/preparer-export";

/*
 * Les limites partagées (src/lib/limites.ts) : le navigateur et le serveur s’arrêtent au même endroit. Des fichiers
 * vides de la bonne taille suffisent : les deux côtés regardent la taille avant de lire.
 */
const vide = (octets: number, nom: string, type = "") => new File([new Uint8Array(octets)], nom, { type });

describe("les envois restent sous la limite de Vercel", () => {
  it("avec leurs marges : 4,2 Mo pour un export, 4 Mo pour des images", () => {
    expect(CORPS_VERCEL_MAX).toBe(4.5 * 1024 * 1024);
    expect(ENVOI_EXPORT_MAX).toBeCloseTo(4.2 * 1024 * 1024);
    expect(ENVOI_IMAGES_MAX).toBe(4 * 1024 * 1024);
    expect(ENVOI_IMAGES_MAX).toBeLessThan(ENVOI_EXPORT_MAX);
    expect(ENVOI_EXPORT_MAX).toBeLessThan(CORPS_VERCEL_MAX);
  });

  it("le serveur refuse un paquet plus gros que ce que Vercel laisse passer", async () => {
    await expect(depuisPaquet(vide(CORPS_VERCEL_MAX + 1, "export.json.gz"))).rejects.toBeInstanceOf(ErreurImport);
  });
});

describe("le texte d’une conv : 40 Mo au plus, des deux côtés", () => {
  it("le navigateur refuse le fichier avant de l’envoyer", async () => {
    await expect(lireFichiers(vide(TEXTE_CONV_MAX + 1, "conv.txt"))).rejects.toBeInstanceOf(ExportIllisible);
  });

  it("le serveur refuse un fichier reçu tel quel au-delà", async () => {
    await expect(depuisFichier(vide(TEXTE_CONV_MAX + 1, "conv.txt"))).rejects.toBeInstanceOf(ErreurImport);
  });

  it("un fichier sous la limite dont le JSON la dépasse : le navigateur garde sa fin, le serveur le relit", async () => {
    /* Des guillemets, deux octets chacun une fois en JSON : 26 Mo de texte, 50 Mo à décompresser, quelques Ko compressés */
    const debut = Date.UTC(2023, 0, 1, 9, 0);
    const texte = Array.from({ length: 80_000 }, (_, k) => {
      const d = new Date(debut + k * 17 * 60e3).toISOString();
      return `[${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}:00] ${k % 2 ? "Léa" : "Tom"}: ${'"'.repeat(300)}`;
    }).join("\n");
    expect(texte.length).toBeLessThan(TEXTE_CONV_MAX);
    const pret = await analyserExport(new File([texte], "WhatsApp Chat - Léa.txt", { type: "text/plain" }));
    if (pret.type !== "un") throw new Error("un seul fichier attendu");
    const octets = gunzipSync(Buffer.from(await pret.paquet.arrayBuffer()));
    expect(octets.length).toBeLessThanOrEqual(TEXTE_CONV_MAX);
    expect((JSON.parse(octets.toString("utf8")) as { coupe?: boolean }).coupe).toBe(true);
    await expect(depuisPaquet(new File([await pret.paquet.arrayBuffer()], "export.json.gz"))).resolves.toMatchObject({ coupe: true });
  }, 60_000);
});

describe("les captures : 20 au plus", () => {
  /* Des JPEG : leurs premiers octets le disent (le serveur lit le type dans les octets, S-39) */
  const captures = (n: number) => Array.from({ length: n }, (_, k) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(12)])], `capture-${k + 1}.jpg`, { type: "image/jpeg" }));

  it("le serveur lit les 20 que l’écran garde, pas une de plus", async () => {
    await expect(imagesDe(captures(CAPTURES_MAX))).resolves.toHaveLength(CAPTURES_MAX);
    await expect(imagesDe(captures(CAPTURES_MAX + 1))).rejects.toBeInstanceOf(ErreurImport);
  });
});

describe("le reste", () => {
  it("la durée du code est celle que dit son mail", () => {
    const m = mailCode("159714", "https://www.askblush.com");
    expect(m.texte).toContain(`Il marche ${CODE_MINUTES} minutes.`);
    expect(m.html).toContain(`Il marche ${CODE_MINUTES} minutes.`);
    /* S-08 : le code ne vaut que là où on l’a demandé, et le mail le dit */
    expect(m.texte).toContain("Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.");
    expect(m.html).toContain("Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.");
  });

  it.each([
    ["audio/webm;codecs=opus", "webm"],
    ["audio/ogg", "ogg"],
    ["audio/wav", "wav"],
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["", "m4a"],
  ])("un vocal %s s’envoie en .%s, des deux côtés", (type, extension) => {
    expect(extensionAudio(type)).toBe(extension);
  });
});
