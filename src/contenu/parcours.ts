import type { ExportApp, Guess } from "@/types";

/* Les textes du parcours : « Qui es-tu ? », les étapes de l’export, celles de la lecture. */

export const GUESS_LABELS: Record<Guess, { tile: string; quote: string }> = {
  parle: { tile: "On se parle", quote: "«\u00a0on se parle\u00a0»" },
  vus: { tile: "On s’est vus", quote: "«\u00a0on s’est vus\u00a0»" },
  flou: { tile: "C’est flou", quote: "«\u00a0c’est flou\u00a0»" },
  ensemble: { tile: "En couple", quote: "«\u00a0en couple\u00a0»" },
};

export const READING_STEPS = ["Votre histoire, du premier au dernier message", "Qui relance, qui propose, qui s’ouvre", "Le moment où tout a basculé", "Ton verdict"];

/**
 * Les étapes de la lecture d’une conv pas encore payée (le paywall d’abord) : ce que le code compte vraiment, sans le
 * modèle (les messages, qui ouvre et qui relance, les mots qui reviennent), puis le rapport prêt à s’écrire.
 */
export const READING_STEPS_AVANT_PAIEMENT = [
  "Vos messages, du premier au dernier",
  "Qui écrit, qui relance, qui répond vite",
  "Ce qui revient le plus souvent",
  "Ton rapport est prêt",
];

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
 * La vidéo qui montre l’export, par appli : son adresse (un fichier de public/, « /videos/export-whatsapp.mp4 », son
 * image d’attente à côté, au même nom en .jpg), ou null tant qu’elle n’est pas fournie. Sans elle, l’écran de l’export
 * n’a ni le bouton « Voir la vidéo » ni sa feuille ; avec, la feuille la joue (src/app/importer/export/ExportScreen.tsx).
 * Celle de WhatsApp (32 s, filmée le 13 octobre) : le numéro, la photo et les contacts, les noms des fichiers et le
 * prénom de l’écran « Qui es-tu » y sont floutés ; sans le son.
 * TODO(produit): la vidéo d’Instagram n’est pas fournie.
 */
export const VIDEOS_EXPORT: Record<ExportApp, string | null> = {
  whatsapp: "/videos/export-whatsapp.mp4",
  instagram: null,
};

/** L’image d’attente d’une vidéo de l’export : le même fichier, en .jpg (affichée tant que la vidéo n’a pas démarré). */
export const imageDeLaVideo = (adresse: string) => adresse.replace(/\.mp4$/, ".jpg");
