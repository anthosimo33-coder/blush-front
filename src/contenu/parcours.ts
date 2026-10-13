import type { ExportApp, Guess } from "@/types";

/* Les textes du parcours : « Qui es-tu ? », les étapes de l’export, celles de la lecture. */

export const GUESS_LABELS: Record<Guess, { tile: string; quote: string }> = {
  parle: { tile: "On se parle", quote: "«\u00a0on se parle\u00a0»" },
  vus: { tile: "On s’est vus", quote: "«\u00a0on s’est vus\u00a0»" },
  flou: { tile: "C’est flou", quote: "«\u00a0c’est flou\u00a0»" },
  ensemble: { tile: "En couple", quote: "«\u00a0en couple\u00a0»" },
};

export const READING_STEPS = ["Votre histoire, du premier au dernier message", "Qui relance, qui propose, qui s’ouvre", "Le moment où tout a basculé", "Ton verdict"];

/** Étapes d’export par appli (iMessage ne s’exporte pas : on filme son écran). La version iPhone/Android est choisie selon l’appareil. */
export const EXPORT_STEPS = {
  whatsapp: {
    menu: { contact: "Sophie", items: ["Ajouter aux favoris", "Exporter la discussion", "Effacer la discussion"], highlight: 1 },
    steps: {
      all: [
        "Ouvre votre conv",
        "Touche son nom en haut (iPhone) ou ⋮ puis Plus (Android)",
        "Exporter la discussion, sans médias",
        "Enregistre dans Fichiers (iPhone) ou Drive (Android)",
      ],
      ios: ["Ouvre votre conv", "Touche son nom en haut", "Exporter la discussion, sans médias", "Enregistre dans Fichiers"],
      android: ["Ouvre votre conv", "Touche ⋮ puis Plus", "Exporter la discussion, sans médias", "Enregistre dans Drive"],
    },
  },
  /* Textes Instagram relus le 8 octobre (le délai : Instagram prépare le fichier puis prévient par email). */
  instagram: {
    menu: { contact: "Espace Comptes", items: ["Mot de passe et sécurité", "Télécharger vos informations", "Préférences publicitaires"], highlight: 1 },
    steps: {
      all: [
        "Ton profil, puis ☰ et Espace Comptes",
        "Vos informations et autorisations, puis Télécharger vos informations",
        "Choisis seulement Messages, au format JSON",
        "Quand Instagram te prévient, choisis le fichier reçu",
      ],
      ios: [
        "Ton profil, puis ☰ et Espace Comptes",
        "Vos informations et autorisations, puis Télécharger vos informations",
        "Choisis seulement Messages, au format JSON",
        "Quand Instagram te prévient, choisis le fichier reçu",
      ],
      android: [
        "Ton profil, puis ☰ et Espace Comptes",
        "Vos informations et autorisations, puis Télécharger vos informations",
        "Choisis seulement Messages, au format JSON",
        "Quand Instagram te prévient, choisis le fichier reçu",
      ],
    },
  },
} as const satisfies Record<ExportApp, unknown>;

/**
 * La vidéo qui montre l’export, par appli : son adresse (un fichier de public/, « /videos/export-whatsapp.mp4 », ou une
 * adresse complète), ou null tant qu’elle n’est pas fournie. Sans elle, l’écran de l’export n’a ni le bouton « Voir la
 * vidéo » ni sa feuille ; avec, la feuille la joue (src/app/importer/export/ExportScreen.tsx).
 * TODO(produit): les vidéos de démonstration ne sont pas fournies ; la durée dite sur le bouton (30 s) est à accorder à la leur.
 */
export const VIDEOS_EXPORT: Record<ExportApp, string | null> = {
  whatsapp: null,
  instagram: null,
};
