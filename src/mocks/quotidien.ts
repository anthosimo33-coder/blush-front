import type { BlushAnswer, FicheFact, FicheSource, QuestionAnswer, Reply } from "@/types";
import { QUESTION_ANSWER } from "./report";

/* Le quotidien de la démo (Hugo & Sophie) : son dernier message, les réponses toutes prêtes, ce que trouve sa fiche. */

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
 * La réponse de BLUSH à un vocal (simulation). En vrai, le back-end transcrit le vocal puis répond à ce qui est dit.
 * ⚠ Texte absent des maquettes : à valider.
 */
export const VOICE_ANSWER: QuestionAnswer = {
  question: "Ton vocal",
  title: "Je t’ai écouté. Propose-lui samedi, en face.",
  evidenceLabel: "Pourquoi",
  evidence: "C’est elle qui propose le plus (4 plans en un mois), et elle te répond en 4 min le soir. Elle attend que tu fasses le pas.",
  confidence: "probable",
  limits: "BLUSH ne voit que vos messages.",
};

/** Son dernier message, tel que BLUSH l’a lu dans votre conv. */
const LAST_MESSAGE: Reply = { ...REPLY, incoming: { ...REPLY.incoming, caption: "Sophie · son dernier message" } };

/**
 * Les questions toutes prêtes du chat, celles que promet la landing, avec la réponse de BLUSH (simulation).
 * ⚠ Absent des maquettes : textes à valider.
 */
export const QUICK_QUESTIONS: { question: string; answer: BlushAnswer }[] = [
  { question: "Ça veut dire quoi ?", answer: { kind: "analysis", reply: LAST_MESSAGE, quoted: true } },
  { question: "Je lui réponds quoi ?", answer: { kind: "best", reply: LAST_MESSAGE } },
  { question: "Elle voit quelqu’un d’autre ?", answer: { kind: "answer", answer: { ...QUESTION_ANSWER, question: "Elle voit quelqu’un d’autre ?" } } },
  {
    question: "On en est où ?",
    answer: {
      kind: "level",
      answer: {
        question: "On en est où ?",
        title: "Vous êtes à deux doigts, et ça se réchauffe.",
        evidenceLabel: "Ce qu’on voit",
        evidence: "C’est elle qui a posé la question, le 2 mars, et c’est elle qui relance, 7 fois sur 10. Il manque juste que l’un de vous le dise.",
        confidence: "sur",
        limits: "12 preuves dans votre conv",
      },
    },
  },
];

/**
 * Ce que BLUSH trouve dans ce que tu ajoutes à sa fiche (simulation) : une capture de sa bio, ou un nouvel export de votre conv.
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
