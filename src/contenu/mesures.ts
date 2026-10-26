import { NB_CHAPITRES } from "./chapitres";
import { NOTE_DES_AVIS } from "./paiement";
import type { Pronom } from "@/types";

/*
 * Proposition du 26 octobre (une maquette dans l’appli, branche locale proto/mesures-paywall-note) : deux questions en
 * un toucher. La première sur le paywall (src/app/lecture/FeuilleQuiCoince.tsx), la carte refermée sans payer ou au
 * moment où l’offre ① venait d’elle-même ; chaque réponse a sa suite, et l’offre ① ne vient plus qu’après « C’est trop
 * cher ». La seconde au bas d’un rapport écrit (src/app/rapport/NoteDuRapport.tsx). Rien n’est encore envoyé au serveur.
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
  /** « C’est trop cher » sans offre ① possible (déjà montrée, un lot de la roue), Premium choisie : le rapport seul. */
  cher: {
    titre: "Prends le rapport seul.",
    sous: (prix: string, bulles: number) => `${prix}\u00a0: tes ${NB_CHAPITRES} chapitres sur vous deux, ton vocal et ${bulles} réponses de BLUSH.`,
    passer: (prix: string) => `Passer au rapport · ${prix}`,
    plusTard: "Plus tard",
  },
  /** « J’ai pas confiance » : ce que la page de confidentialité et les questions du paywall promettent déjà, rien de plus. */
  confiance: {
    titre: "Normal, c’est ta conv.",
    lignes: (autre: string) =>
      [
        { icone: "shield", titre: `${autre} n’en saura jamais rien`, sous: "BLUSH ne lui écrit pas." },
        { icone: "lock", titre: "Ta conv est chiffrée", sous: "La conv brute est effacée après ton rapport. Tu effaces le reste quand tu veux." },
        { icone: "eye", titre: "Rien n’est deviné", sous: "Tout vient de vos messages, avec les passages qui le montrent." },
      ] as const,
    avis: NOTE_DES_AVIS ? `${NOTE_DES_AVIS.note} sur 5 · ${NOTE_DES_AVIS.nombre} avis de testeurs` : null,
    retour: "Je reviens au paiement",
    plusTard: "Plus tard",
  },
  /** « Pas maintenant » : rien à vendre, la conv attend. */
  plusTard: {
    titre: "Pas de souci.",
    sous: "Ta conv reste là, prête à être lue. Reviens quand tu veux.",
    ok: "OK",
    enFait: "En fait, je le prends",
  },
  bug: {
    titre: "Mince, pardon.",
    sous: "Ça passe souvent mieux par la page de Whop. Même prix, même paiement sécurisé.",
    payer: (prix: string) => `Payer sur Whop · ${prix}`,
    plusTard: "Plus tard",
  },
} as const;

/** Ce que la feuille montre : la question, puis la suite de chaque réponse. */
export type EtatQuiCoince = "question" | "cher" | "confiance" | "plusTard" | "bug";

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
