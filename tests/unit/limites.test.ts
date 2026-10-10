import { describe, expect, it } from "vitest";
import { CAPTURES_MAX, CODE_MINUTES, CORPS_VERCEL_MAX, ENVOI_EXPORT_MAX, ENVOI_IMAGES_MAX, extensionAudio, TEXTE_CONV_MAX } from "@/lib/limites";
import { imagesDe } from "@/server/captures";
import { depuisFichier, depuisPaquet, ErreurImport } from "@/server/histoires";
import { mailCode } from "@/server/mail-code";
import { ExportIllisible, lireFichiers } from "@/services/preparer-export";

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
});

describe("les captures : 20 au plus", () => {
  const captures = (n: number) => Array.from({ length: n }, (_, k) => vide(16, `capture-${k + 1}.jpg`, "image/jpeg"));

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
