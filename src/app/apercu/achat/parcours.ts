/** Les parcours de l’aperçu de l’achat dans le chat (./ApercuAchat.tsx), un par adresse (`?parcours=`). */
export const PARCOURS = ["autre", "meme", "peu", "bulles", "refus", "premium", "reimport", "demande"] as const;
export type Parcours = (typeof PARCOURS)[number];
