import type { Person } from "@/types";

type Pronom = NonNullable<Person["pronoun"]>;

/** « Elle » ou « Il » : l’autre personne, d’après son pronom (« elle » quand on ne sait pas). */
export const IlOuElle = (pronoun?: Pronom) => (pronoun === "il" ? "Il" : "Elle");

/**
 * Le pronom de l’autre personne : l’opposé du tien (BLUSH accompagne un garçon qui parle à une fille, ou l’inverse).
 * Sans le tien, « elle », comme IlOuElle.
 */
export const pronomOppose = (tien?: Pronom): Pronom => (tien === "elle" ? "il" : "elle");
