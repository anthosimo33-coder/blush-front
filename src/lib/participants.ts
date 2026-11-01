import { prenomDouteux, sansPrenom } from "@prompts/lib/noms";
import type { Person, Story } from "@/types";

/*
 * Qui est qui dans une conv, pour les écrans : toi (qui l’as importée) et l’autre personne. Une seule règle, la même
 * qu’au serveur (personnesDe, src/server/histoires.ts) : toi connu, l’autre est l’autre participant ; toi inconnu,
 * l’autre est le second (`participants[1]`).
 */

/**
 * Toi et l’autre. Qui est toi : `story.me` (« Qui es-tu ? » rempli, lu par le serveur), sinon `repli` (le parcours de
 * cet onglet).
 */
export function moiEtAutre(story: Pick<Story, "participants" | "me">, repli?: Person["id"] | null): { moi: Person; autre: Person } {
  const [a, b] = story.participants;
  return (story.me ?? repli) === b.id ? { moi: b, autre: a } : { moi: a, autre: b };
}

/**
 * Le nom de l’autre dit-il qui il est ? Sur des captures (ou un enregistrement), sans nom lu en haut de la conv, la
 * lecture l’appelle « Elle » (versTexteCaptures, prompts/lib/captures.ts) ; un contact que le téléphone ne connaît pas
 * n’a qu’un numéro ; un compte Instagram supprimé n’est plus que « Utilisateur Instagram » ; « Mon ❤️ » n’a qu’un
 * possessif (sansPrenom). « Qui es-tu ? » demande alors son prénom (src/app/qui, doutePrenom), que le serveur pose à sa
 * place (definirQui).
 */
export const nomLu = (nom: string) => nom !== "Elle" && /\p{L}/u.test(nom) && !sansPrenom(nom);

/**
 * Le nom d’export de l’autre (sa place dans meta.participants) dit-il son prénom ? `unknown` : rien ne le dit (nomLu),
 * « Qui es-tu ? » le demande ; `nickname` : un surnom (« Mon amour ❤️ », « Bébé »), l’écran propose de l’écrire. Le
 * serveur le redit avant de poser le prénom écrit (definirQui).
 */
export const doutePrenom = (nom: string): Person["nameCheck"] => (!nomLu(nom) ? "unknown" : prenomDouteux(nom) ? "nickname" : undefined);

/** Le titre du duo (« Tom & Léa ») : les deux prénoms dans l’ordre de l’export, quel que soit qui est toi. */
export const titreDuo = (story: Pick<Story, "participants">) => `${story.participants[0].name} & ${story.participants[1].name}`;
