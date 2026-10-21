import type { Person } from "@/types";

type Pronom = NonNullable<Person["pronoun"]>;

/** « Elle » ou « Il » : l’autre personne, d’après son pronom (« elle » quand on ne sait pas). */
export const IlOuElle = (pronoun?: Pronom) => (pronoun === "il" ? "Il" : "Elle");

/**
 * L’opposé de ton pronom : celui de l’autre personne quand ni sa fiche ni la conv ne disent le sien (pronomDeLAutre,
 * src/server/accords.ts). Sans le tien, « elle », comme IlOuElle.
 */
export const pronomOppose = (tien?: Pronom): Pronom => (tien === "elle" ? "il" : "elle");
