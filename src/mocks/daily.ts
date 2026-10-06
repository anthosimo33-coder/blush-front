import type { Fiche, FicheFact, FicheSource, Offer, QuestionAnswer, Reply, Subscription } from "@/types";
import { PEOPLE } from "./story";

export const OFFERS: Offer[] = [
  {
    id: "crushplus",
    title: "CRUSH+ · le rapport et l’aide à chaque message",
    titleDesktop: "CRUSH+ · rapport et aide à chaque message",
    price: "7,99 € / semaine",
    note: "Sans engagement · le rapport s’enrichit à chaque message",
    noteDesktop: "Sans engagement",
    recommended: true,
  },
  {
    id: "rapport",
    title: "Le rapport complet",
    titleDesktop: "Le rapport complet",
    price: "8,99 €",
    note: "Une fois · à toi pour toujours",
    noteDesktop: "Une fois · à toi pour toujours",
    recommended: false,
  },
];

export const PAYWALL = {
  title: (other: string) => `La suite parle de vous deux : toi et ${other}.`,
  subtitle: "6 chapitres, ton plan et les phrases pour lui parler.",
  payments: "Apple Pay, Google Pay ou carte · paiement sécurisé",
};

export const REPLY: Reply = {
  messageId: "msg-001",
  incoming: { from: "elle", text: "je suis crevée cette semaine, on verra", caption: "Sophie · lu sur ta capture" },
  sourceLabel: "lu sur ta capture",
  meaningTitle: "Elle est partante, mais fatiguée.",
  meaningProof: "Le 23 février, elle a écrit presque la même chose. Et elle est venue le samedi.",
  best: "Courage pour jeudi. Samedi pour fêter ça ?",
  why: "Elle t’a parlé de son exam et a laissé une porte ouverte avec « on verra ».",
};

/**
 * La réponse de CRUSH à un vocal (simulation). En vrai, le back-end transcrit le vocal puis répond à ce qui est dit.
 * ⚠ Texte absent des maquettes : à valider.
 */
export const VOICE_ANSWER: QuestionAnswer = {
  question: "Ton vocal",
  title: "Je t’ai écouté. Propose-lui samedi, en face.",
  evidenceLabel: "Pourquoi",
  evidence: "C’est elle qui propose le plus (4 plans en un mois), et elle te répond en 4 min le soir. Elle attend que tu fasses le pas.",
  confidence: "probable",
  limits: "CRUSH ne voit que vos messages.",
};

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

/** Les rubriques de sa fiche, dans l’ordre. « Tes notes » : ce que tu ajoutes toi-même. */
export const FICHE_SECTIONS: { id: FicheFact["section"]; title: string }[] = [
  { id: "infos", title: "À savoir" },
  { id: "aime", title: "Elle aime" },
  { id: "gens", title: "Les gens de sa vie" },
  { id: "dates", title: "Dates à retenir" },
  { id: "notes", title: "Tes notes" },
];

/**
 * Ce que CRUSH trouve dans ce que tu ajoutes à sa fiche (simulation) : une capture de sa bio, ou un nouvel export de votre conv.
 * En vrai, le back-end analyse les fichiers. ⚠ Absent des maquettes : à valider.
 */
export const FICHE_FINDINGS: Record<"captures" | "export", { sourceLabel: string; source: FicheSource; facts: Pick<FicheFact, "section" | "text">[] }> = {
  captures: {
    sourceLabel: "sa bio Hinge",
    source: "capture",
    facts: [
      { section: "infos", text: "Vit à Lyon" },
      { section: "infos", text: "« Cherche quelqu’un qui la fait rire »" },
      { section: "aime", text: "l’escalade" },
    ],
  },
  export: {
    sourceLabel: "conv",
    source: "conv",
    facts: [
      { section: "aime", text: "les marchés de Noël" },
      { section: "dates", text: "Exam jeudi" },
    ],
  },
};

export const SUBSCRIPTIONS: Record<Subscription["plan"], Subscription> = {
  crushplus: { plan: "crushplus", priceLabel: "7,99 € / semaine", renewLabel: "Renouvelé lundi · sans engagement", stopLabel: "En un geste, effectif lundi", active: true, paused: false },
  rapport: { plan: "rapport", priceLabel: "8,99 €", renewLabel: "Payé une fois · à toi pour toujours", stopLabel: "", active: true, paused: false },
  gratuit: { plan: "gratuit", priceLabel: "Aperçu gratuit", renewLabel: "Chapitres 1 et 2", stopLabel: "", active: false, paused: false },
};
