import "server-only";
import { versTexteCaptures, type TexteCaptures } from "@prompts/lib/captures";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import { Sortie01 } from "@prompts/lib/schemas";
import { ErreurImport } from "./histoires";
import { appeler } from "./ia/claude";
import { aujourdhuiParis } from "./temps";

/** Combien de captures à la fois, et leur taille (déjà réduites par le navigateur). */
export const CAPTURES_MAX = 20;
const TAILLE_IMAGE_MAX = 2 * 1024 * 1024;

/** Les captures envoyées (des fichiers image), vérifiées : type, nombre, taille. */
export async function imagesDe(fichiers: File[]): Promise<Image[]> {
  if (!fichiers.length || fichiers.length > CAPTURES_MAX) throw new ErreurImport("fichier");
  return Promise.all(
    fichiers.map(async (f) => {
      const media = f.type === "image/png" || f.type === "image/webp" ? f.type : "image/jpeg";
      if (!f.type.startsWith("image/") || f.size > TAILLE_IMAGE_MAX) throw new ErreurImport("fichier");
      return { media, base64: Buffer.from(await f.arrayBuffer()).toString("base64") };
    }),
  );
}

/**
 * Lit les captures (prompt 01) et les remet au format « captures » que la lecture connaît.
 * Rien de lisible (que des captures hors sujet) : l’erreur « capture », que le front sait afficher.
 */
export async function lireCaptures(images: Image[], appli: string): Promise<TexteCaptures> {
  const jour = aujourdhuiParis();
  const a = await appeler(requeteCaptures({ prenom: "l’utilisateur", autre: null, appli, aujourdhui: jour.t, images }), Sortie01, { etiquette: "captures" });
  if (!a.sortie) throw new ErreurImport("fichier");
  const t = versTexteCaptures(a.sortie, { aujourdhui: jour.iso });
  if (!t.messages) throw new ErreurCaptures();
  return t;
}

/** Aucune capture ne montre leur conv. */
export class ErreurCaptures extends Error {}
