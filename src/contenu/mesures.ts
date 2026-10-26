import type { Pronom } from "@/types";

/*
 * Proposition du 26 octobre (une maquette dans l’appli, branche locale proto/mesures-paywall-note) : deux questions en
 * un toucher. La première quand la carte du paywall est refermée sans payer (src/app/lecture/FeuilleQuiCoince.tsx), la
 * seconde au bas d’un rapport écrit (src/app/rapport/NoteDuRapport.tsx). Rien n’est encore envoyé au serveur.
 * TODO(produit): valider les textes, puis ce qui se compte pour /admin (une réponse par raison, sans cookie ni conv).
 */

/** « Qu’est-ce qui coince ? » : la feuille qui suit la carte refermée sans payer, et la page de Whop après « Ça a bugué ». */
export const QUI_COINCE = {
  titre: "Qu’est-ce qui coince\u00a0?",
  sous: "Un toucher et je te laisse tranquille.",
  raisons: [
    { id: "cher", texte: "C’est trop cher" },
    { id: "confiance", texte: "J’ai pas confiance" },
    { id: "plus_tard", texte: "Pas maintenant" },
    { id: "bug", texte: "Ça a bugué" },
  ],
  passer: "Passer",
  merci: "Merci, c’est noté.",
  bug: {
    titre: "Mince, pardon.",
    sous: "Ça passe souvent mieux par la page de Whop. Même prix, même paiement sécurisé.",
    payer: (prix: string) => `Payer sur Whop · ${prix}`,
    plusTard: "Plus tard",
  },
} as const;

/** « Il t’a parlé, ce rapport ? » : la note au bas d’un rapport écrit, puis ce qui n’allait pas, ou un avis. */
export const NOTE_DU_RAPPORT = {
  titre: "Il t’a parlé, ce rapport\u00a0?",
  oui: "Oui, grave",
  bof: "Bof",
  bofTitre: "Aïe. Qu’est-ce qui allait pas\u00a0?",
  raisons: ["Pas assez précis", "À côté de notre histoire", "Trop dur", "Trop long", "Autre chose"],
  envoyer: "Envoyer",
  avisTitre: "Trop bien. Tu nous laisses un avis\u00a0?",
  avisSous: "Ton prénom et une phrase. Jamais rien de ta conv.",
  prenom: "Ton prénom",
  phrase: "Ta phrase",
  /** L’exemple dans le champ vide, au pronom de l’autre. */
  exemple: (autre: Pronom) => `J’ai enfin compris pourquoi ${autre} répondait plus pareil.`,
  publier: "Publier mon avis",
  plusTard: "Plus tard",
  relu: "On le relit avant de le mettre sur le site.",
  merci: "Merci, c’est noté.",
  merciSous: "Ça nous aide à faire mieux.",
};
