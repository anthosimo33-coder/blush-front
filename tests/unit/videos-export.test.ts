import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageDeLaVideo, VIDEOS_EXPORT } from "@/contenu/parcours";

/* Les vidéos de l’export (VIDEOS_EXPORT) : chaque adresse donnée est un fichier de public/, avec son image d’attente, assez léger pour un téléphone */
describe("les vidéos de l’export", () => {
  const donnees = Object.entries(VIDEOS_EXPORT).filter((e): e is [string, string] => e[1] !== null);

  it("chaque vidéo donnée et son image d’attente sont dans public/, la vidéo sous 6 Mo", () => {
    for (const [app, adresse] of donnees) {
      const fichier = join(process.cwd(), "public", adresse);
      expect(existsSync(fichier), app).toBe(true);
      expect(statSync(fichier).size, app).toBeLessThan(6 * 1024 * 1024);
      expect(existsSync(join(process.cwd(), "public", imageDeLaVideo(adresse))), app).toBe(true);
    }
  });

  it("l’image d’attente : le même nom, en .jpg", () => {
    expect(imageDeLaVideo("/videos/export-whatsapp.mp4")).toBe("/videos/export-whatsapp.jpg");
  });
});
