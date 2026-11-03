import { ARRIVEE_MAX } from "./limites";

/*
 * Les chemins de l’appli sans ce qui pourrait dire qui l’on est : pour PostHog (src/lib/analytique.ts), et pour la page
 * d’arrivée d’une visite (src/lib/presence.ts, que le serveur renettoie : src/server/visites.ts). Ni « use client » ni
 * « server-only » : le navigateur et le serveur nettoient de la même façon.
 */

/** Les pages dont le morceau d’après est un identifiant : un verdict partagé, un parrainage, un lien de mail, un lien de tournage. */
const AVEC_IDENTIFIANT = new Set(["v", "p", "ouvrir", "tournage"]);
/** Un identifiant ailleurs dans une adresse : un uuid. */
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Un chemin de l’appli sans ses identifiants : « /v/:id », « /ouvrir/:id ». */
export function cheminSur(chemin: string): string {
  const morceaux = chemin.split("/");
  return morceaux.map((m, k) => (m && ((k === 2 && AVEC_IDENTIFIANT.has(morceaux[1] ?? "")) || UUID.test(m)) ? ":id" : m)).join("/");
}

/** Un morceau de chemin qu’une page d’arrivée garde tel quel : des lettres, des chiffres, « - », « _ », « . » (un nom de page). */
const MORCEAU_LISIBLE = /^[a-z\d][\w.-]{0,79}$/i;
/** Un long nombre (un téléphone, une commande) : jamais gardé. */
const LONG_NOMBRE = /\d{6}/;
/** Au plus, les morceaux d’une page d’arrivée (« /guides/il-ne-repond-plus » en a deux). */
const MORCEAUX_MAX = 4;

/**
 * La page d’arrivée d’une visite, telle qu’elle se garde (visites.arrivee) : le chemin seul (ni requête, ni fragment),
 * sans ses identifiants (cheminSur), sans barre finale, et chaque morceau qui ne ressemble pas à un nom de page (un
 * email, un nombre, un texte encodé tapé dans l’adresse d’une page qui n’existe pas) remplacé par « :id ». Jamais
 * plus de ARRIVEE_MAX caractères, que POST /api/presence refuserait : les derniers morceaux tombent, le premier (le
 * groupe de la page) reste. null : pas un chemin.
 */
export function arriveeDe(adresse: string): string | null {
  const chemin = adresse.split(/[?#]/)[0]!;
  if (!chemin.startsWith("/")) return null;
  const morceaux = cheminSur(chemin)
    .split("/")
    .filter(Boolean)
    .slice(0, MORCEAUX_MAX)
    .map((m) => (m === ":id" || (MORCEAU_LISIBLE.test(m) && !LONG_NOMBRE.test(m)) ? m : ":id"));
  while (morceaux.length > 1 && `/${morceaux.join("/")}`.length > ARRIVEE_MAX) morceaux.pop();
  return `/${morceaux.join("/")}`;
}
