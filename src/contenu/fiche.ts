import type { FicheFact } from "@/types";

/** Les rubriques de sa fiche, dans l’ordre. « Tes notes » : ce que tu ajoutes toi-même. */
export const FICHE_SECTIONS: { id: FicheFact["section"]; title: string }[] = [
  { id: "infos", title: "À savoir" },
  { id: "aime", title: "Elle aime" },
  { id: "gens", title: "Les gens de sa vie" },
  { id: "dates", title: "Dates à retenir" },
  { id: "notes", title: "Tes notes" },
];
