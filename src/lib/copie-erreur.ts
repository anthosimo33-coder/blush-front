import type { Route } from "next";
import { MIN_MESSAGES, MIN_MESSAGES_CAPTURES } from "@prompts/lib/conv";
import type { ErreurParcours } from "@/lib/messages-erreur";

/* Écrans d’erreur du parcours d’import (ERREURS_PARCOURS) : un titre, une phrase, une action. Textes absents des maquettes, relus le 8 octobre. */
const ERROR_COPY: Record<ErreurParcours, { title: string; text: string; action: string; href: Route; back: Route }> = {
  fichier: {
    title: "On n’arrive pas à lire ce fichier.",
    text: "Exporte à nouveau votre discussion, sans médias, puis choisis le fichier enregistré.",
    action: "Choisir un autre fichier",
    href: "/importer/export",
    back: "/importer/export",
  },
  groupe: {
    title: "C’est une conversation de groupe.",
    text: "BLUSH analyse seulement les conversations à deux. Exporte votre discussion privée.",
    action: "Choisir une autre conv",
    href: "/commencer",
    back: "/commencer",
  },
  /* Sur un export ; sur des captures, copieDe la change */
  courte: {
    title: "Votre conv est encore trop courte.",
    text: `Un export doit avoir au moins ${MIN_MESSAGES} messages pour un verdict juste. En captures, ${MIN_MESSAGES_CAPTURES} suffisent\u00a0: envoie celles de votre conv, ou reviens dans quelques jours.`,
    action: "Envoyer des captures",
    href: "/importer/captures",
    back: "/importer/export",
  },
  lecture: {
    title: "L’analyse n’a pas abouti.",
    text: "Rien n’est perdu\u00a0: ta conv est toujours là. Relance l’analyse.",
    action: "Relancer l’analyse",
    href: "/lecture",
    back: "/email",
  },
  capture: {
    title: "Cette capture est illisible.",
    text: "On ne voit pas bien les messages. Refais la capture en entier, sans la recadrer.",
    action: "Choisir d’autres captures",
    href: "/importer/captures",
    back: "/importer/captures",
  },
  video: {
    title: "Je n’arrive pas à lire cette vidéo.",
    text: "Choisis l’enregistrement tel quel, depuis ton iPhone\u00a0: sans le recadrer ni le monter.",
    action: "Choisir une autre vidéo",
    href: "/importer/captures",
    back: "/importer/captures",
  },
};

/** Ce que dit un écran d’erreur du parcours : son titre, sa phrase, son action (et où elle mène), et son « Retour ». */
type Copie = (typeof ERROR_COPY)[ErreurParcours];

/**
 * Le texte et les liens d’une erreur, d’après l’écran où elle arrive : réessayer garde son appli (`?app=`) et son mode.
 * Une conv trop courte : sur des captures, en choisir plus (il en faut moins : MIN_MESSAGES_CAPTURES) ; sur un export,
 * passer aux captures (réunir un export et des captures arrive plus tard).
 */
export function copieDe(kind: ErreurParcours, chemin: string, params: URLSearchParams): Copie {
  const c = ERROR_COPY[kind];
  const reste = new URLSearchParams(params);
  reste.delete("erreur");
  const requete = reste.toString();
  /* La page où l’erreur arrive (usePathname) : une route du site */
  const ici = (requete ? `${chemin}?${requete}` : chemin) as Route;
  const app = params.get("app");
  if (kind === "courte" && chemin === "/importer/captures")
    return {
      ...c,
      text: `Il faut au moins ${MIN_MESSAGES_CAPTURES} messages pour un verdict juste. Ajoute des captures, depuis le début de votre conv, ou reviens dans quelques jours.`,
      action: "Choisir plus de captures",
      href: ici,
      back: ici,
    };
  if (kind === "courte") return { ...c, href: app ? `/importer/captures?app=${encodeURIComponent(app)}` : c.href, back: ici };
  if (kind === "fichier" || kind === "capture" || kind === "video") return { ...c, href: ici, back: ici };
  return c;
}
