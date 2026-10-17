import { PARRAINAGE } from "./offres";

/*
 * Les textes du parrainage (la page /parrainage, src/server/parrainage.ts) : son lien, ce que chacune y gagne, et ce que
 * l’amie ne voit jamais. Le mail qui y mène est dans src/contenu/mails.ts (mailParrainage).
 * TODO(produit): textes à valider.
 */
export const PARRAINAGE_TEXTES = {
  titre: "Ton lien de parrainage",
  lead: `Ta pote importe sa conv avec ton lien\u00a0: elle a ${PARRAINAGE.bulles} réponses de BLUSH en plus avec son rapport, et toi ${PARRAINAGE.bulles} bulles offertes.`,
  promesse: "Elle ne voit rien de ta conv, ni ton prénom. Jamais.",
  copier: "Copier mon lien",
  copie: "Lien copié",
  partager: "Partager",
  /** Ce qui part avec le lien, quand on le partage (le texte du message). */
  message: `BLUSH lit ta conv et te dit ce qui se passe vraiment. Avec mon lien, t’as ${PARRAINAGE.bulles} réponses de BLUSH en plus\u00a0:`,
  quand: `Tes ${PARRAINAGE.bulles} bulles arrivent quand elle débloque son premier rapport.`,
} as const;
