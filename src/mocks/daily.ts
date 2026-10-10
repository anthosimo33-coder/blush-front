import type { Fiche } from "@/types";
import { PEOPLE } from "./people";

/*
 * Sa fiche de démo, lue par le faux back-end (src/mocks/server.ts) : ce module reste léger, il est chargé partout où
 * l’état de démo se lit. Le reste du quotidien de la démo est dans ./quotidien ; les offres, de vrais textes, dans
 * src/content.
 */

export const FICHE: Fiche = {
  person: PEOPLE.sophie,
  portrait: "La Relanceuse",
  updatedLabel: "mise à jour hier",
  summary: "Son exam est jeudi · elle t’en a parlé 3 fois",
  summaryShort: "Son exam est jeudi",
  facts: [
    { id: "f9", section: "infos", text: "Travaille dans un labo", sourceLabel: "conv", sources: ["conv"] },
    { id: "f1", section: "aime", text: "le libanais", sourceLabel: "conv", sources: ["conv"] },
    { id: "f2", section: "aime", text: "l’escalade", sourceLabel: "sa bio Hinge", sources: ["capture"] },
    { id: "f3", section: "aime", text: "sa série du moment", sourceLabel: "conv", sources: ["conv"] },
    { id: "f4", section: "gens", text: "Sa sœur Inès", sourceLabel: "conv", sources: ["conv"] },
    { id: "f5", section: "gens", text: "ses collègues du labo", sourceLabel: "conv", sources: ["conv"] },
    { id: "f6", section: "dates", text: "Exam jeudi", sourceLabel: "conv", sources: ["conv"] },
    { id: "f7", section: "dates", text: "anniversaire d’Inès le 20", sourceLabel: "conv", sources: ["conv"] },
    { id: "f8", section: "notes", text: "« Elle déteste qu’on l’appelle »", sourceLabel: "ajouté par toi", sources: ["note"] },
  ],
};

