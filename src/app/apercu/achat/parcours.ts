/** Les parcours de l’aperçu de l’achat dans le chat (./ApercuAchat.tsx), un par adresse (`?parcours=`). */
export const PARCOURS = ["demande", "moment", "bulles", "autre", "reimport", "refus"] as const;
export type Parcours = (typeof PARCOURS)[number];
