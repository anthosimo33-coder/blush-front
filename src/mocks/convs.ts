import type { LevelId, Person, Verdict } from "@/types";

/*
 * Proposition « plusieurs convs » : en plus de Sophie, deux autres histoires du même compte (Hugo).
 * Seul ce que montrent la liste et l’accueil change ; le reste (rapport, réponses toutes prêtes) reprend celui de Sophie.
 * ?convs=plusieurs les ajoute au compte de démo (cookie), ?convs=une les retire.
 */
export const CONVS_COOKIE = "blush-convs";

export type AutreConv = {
  id: string;
  person: Person;
  verdict: Verdict;
  level: LevelId;
  trend: string;
  nextStep: string;
  summaryShort: string;
  lastLabel: string;
};

export const AUTRES_CONVS: AutreConv[] = [
  {
    id: "story-hugo-ines",
    person: { id: "ines", name: "Inès", initial: "I" },
    verdict: { emoji: "🤔", short: "Elle hésite", title: "Elle hésite.", subtitle: "Elle aime ce que vous avez. Elle n’ose pas encore le nommer.", difficult: false },
    level: "voit",
    trend: "→ ça ne bouge pas",
    nextStep: "Ton prochain pas : un vrai rendez-vous, sans parler de « nous ».",
    summaryShort: "Elle part à Lisbonne en mai",
    lastLabel: "hier",
  },
  {
    id: "story-hugo-camille",
    person: { id: "camille", name: "Camille", initial: "C" },
    verdict: { emoji: "🔥", short: "Elle est partante", title: "Elle est partante.", subtitle: "Elle a proposé le jour et l’heure.", difficult: false },
    level: "parle",
    trend: "↗ ça démarre fort",
    nextStep: "Ton prochain pas : confirmer samedi, 20 h.",
    summaryShort: "Fan de jazz, déteste les applis",
    lastLabel: "lun.",
  },
];
