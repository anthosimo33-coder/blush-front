import { SECTIONS_FICHE, type FicheFact } from "@/types";

/* Le titre de chaque rubrique de sa fiche. « Tes notes » : ce que tu ajoutes toi-même. */
const TITRES: Record<FicheFact["section"], string> = {
  infos: "À savoir",
  aime: "Elle aime",
  gens: "Les gens de sa vie",
  dates: "Dates à retenir",
  notes: "Tes notes",
};

/** Les rubriques de sa fiche, dans l’ordre, avec leur titre. */
export const FICHE_SECTIONS: { id: FicheFact["section"]; title: string }[] = SECTIONS_FICHE.map((id) => ({ id, title: TITRES[id] }));
