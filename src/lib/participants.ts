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

/** Le titre du duo (« Tom & Léa ») : les deux prénoms dans l’ordre de l’export, quel que soit qui est toi. */
export const titreDuo = (story: Pick<Story, "participants">) => `${story.participants[0].name} & ${story.participants[1].name}`;
