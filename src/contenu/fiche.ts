import { IlOuElle } from "@/lib/pronom";
import { SECTIONS_FICHE, type FicheFact, type Pronom } from "@/types";

/* Le titre de chaque rubrique de sa fiche, sauf « aime », qui suit son pronom (titreDeRubrique). « Tes notes » : ce que tu ajoutes toi-même. */
const TITRES: Record<Exclude<FicheFact["section"], "aime">, string> = {
  infos: "À savoir",
  gens: "Les gens de sa vie",
  dates: "Dates à retenir",
  notes: "Tes notes",
};

/** Le titre d’une rubrique de sa fiche : « Elle aime », ou « Il aime » quand c’est une fille qui utilise BLUSH (son `pronom`). */
export const titreDeRubrique = (id: FicheFact["section"], pronom?: Pronom) => (id === "aime" ? `${IlOuElle(pronom)} aime` : TITRES[id]);

/** Les rubriques de sa fiche, dans l’ordre, avec leur titre (« Elle aime » ou « Il aime », d’après son `pronom`). */
export const rubriquesDeLaFiche = (pronom?: Pronom): { id: FicheFact["section"]; title: string }[] => SECTIONS_FICHE.map((id) => ({ id, title: titreDeRubrique(id, pronom) }));
