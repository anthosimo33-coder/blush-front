import "server-only";
import { versTexteCaptures, type TexteCaptures } from "@prompts/lib/captures";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import { Sortie01, type Captures } from "@prompts/lib/schemas";
import { utilisateurDeSession } from "./auth";
import { lireSession } from "./cookies";
import { env } from "./env";
import { ErreurImport } from "./histoires";
import { appeler } from "./ia/claude";
import { LIMITES, sousLaLimite } from "./limites";
import { aujourdhuiParis } from "./temps";

const PLAFONDS = {
  captures: { anonymes: "capturesAnonymesParJour", compte: "capturesParCompte" },
  lots: { anonymes: "lotsAnonymesParJour", compte: "lotsParCompte" },
} as const;

/**
 * Peut-on lire des captures (`quoi` : « captures », ou les « lots » d’un enregistrement d’écran) pour cette requête ? Le
 * modèle payant les lit avant l’email. À appeler une fois l’envoi vérifié, juste avant de lire : un envoi invalide ne
 * compte pas. `null` : la règle de la bêta seule (rien ne sera lu par le modèle).
 * - Bêta fermée, sans compte : « connexion ». Qui n’est pas invité ne pourrait pas lancer la lecture ensuite : on ne paie
 *   pas pour lui, et l’invité se connecte d’abord (l’écran des captures l’y envoie).
 * - Un compte connecté : sous sa limite du jour, sinon « trop ».
 * - Bêta ouverte, sans compte : sous un plafond pour tous et par jour, sinon « trop ».
 * Les limites par IP de la route s’appliquent en plus.
 */
export async function lecturePermise(quoi: keyof typeof PLAFONDS | null): Promise<"ok" | "connexion" | "trop"> {
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur && env().BLUSH_BETA_FERMEE) return "connexion";
  if (!quoi) return "ok";
  const { anonymes, compte } = PLAFONDS[quoi];
  const ok = utilisateur ? await sousLaLimite(`${compte}:${utilisateur.id}`, LIMITES[compte]) : await sousLaLimite(anonymes, LIMITES[anonymes]);
  return ok ? "ok" : "trop";
}

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
  return enTexte(await lireLot(images, appli));
}

/** La lecture brute d’un lot d’images (des captures, ou les images d’un enregistrement d’écran). */
export async function lireLot(images: Image[], appli: string): Promise<Captures> {
  const a = await appeler(requeteCaptures({ prenom: "l’utilisateur", autre: null, appli, aujourdhui: aujourdhuiParis().t, images }), Sortie01, { etiquette: "captures" });
  if (!a.sortie) throw new ErreurImport("fichier");
  return a.sortie;
}

/** Une lecture au format « captures » que la lecture de la conv connaît. Rien de lisible : l’erreur « capture ». */
export function enTexte(c: Captures): TexteCaptures {
  const t = versTexteCaptures(c, { aujourdhui: aujourdhuiParis().iso });
  if (!t.messages) throw new ErreurCaptures();
  return t;
}

/** Aucune capture ne montre leur conv. */
export class ErreurCaptures extends Error {}
