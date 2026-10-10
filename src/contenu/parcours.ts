import type { Guess } from "@/types";

/* Les textes du parcours : « Qui es-tu ? », les étapes de l’export, celles de la lecture. */

export const GUESS_LABELS: Record<Guess, { tile: string; quote: string }> = {
  parle: { tile: "On se parle", quote: "« on se parle »" },
  vus: { tile: "On s’est vus", quote: "« on s’est vus »" },
  flou: { tile: "C’est flou", quote: "« c’est flou »" },
  ensemble: { tile: "En couple", quote: "« en couple »" },
};

export const READING_STEPS = [
  "Votre histoire, du premier au dernier message",
  "Qui relance, qui propose, qui s’ouvre",
  "Le moment où tout a basculé",
  "Ton verdict",
];

/** Étapes d’export par appli. La version iPhone/Android est choisie selon l’appareil. */
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
  /* Plus proposé : Messages sur Mac n’a pas de commande « Exporter la conversation ». iMessage passe par l’enregistrement d’écran (/importer/captures?app=imessage). */
  imessage: {
    menu: { contact: "Sophie", items: ["Afficher le contact", "Exporter la conversation", "Supprimer la conversation"], highlight: 1 },
    steps: {
      all: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
      ios: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
      android: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
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
} as const;
