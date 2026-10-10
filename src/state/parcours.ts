import type { Goal, Guess } from "@/types";
import type { JourneyState } from "./journey";

/*
 * Les règles du parcours d’import, sans React ni stockage : quand « Qui es-tu ? » est complet, et ce qu’il envoie pour
 * lancer la lecture (POST /api/analyse). « Qui es-tu ? » et l’écran du code reçu par email, qui lance la lecture lui
 * aussi, suivent les mêmes.
 */

/** Le parcours, « Qui es-tu ? » complet. */
type QuiRempli = JourneyState & { me: string; pronom: "il" | "elle"; guess: Guess; goal: Goal };

/**
 * La conv de cet onglet vient-elle de captures ? Son dernier import le dit : un export laisse son nom de fichier dans le
 * parcours, des captures l’effacent (src/app/importer/captures). Des captures ajoutées à un export le gardent : la conv
 * reste un export. L’écran qui reçoit la conv du serveur (QuiScreen) se fie à elle plutôt qu’à ceci.
 */
export const vientDeCaptures = (j: Pick<JourneyState, "exportFileName">) => !j.exportFileName;

/**
 * « Qui es-tu ? » est-il complet ? Qui est toi, ton pronom, ta devinette et ce que tu veux ; et sur des captures (où tu
 * n’es que « Moi »), ton prénom.
 */
export function quiComplet(j: JourneyState, { captures }: { captures: boolean }): j is QuiRempli {
  return !!j.me && (!captures || !!j.prenom.trim()) && !!j.pronom && !!j.guess && !!j.goal;
}

/**
 * Les réponses de « Qui es-tu ? » qui lancent la lecture (startAnalysis). Ton prénom, seulement sur des captures et
 * s’il est écrit : celui d’une conv de captures d’avant, resté dans l’onglet, renommerait sinon toi sur un export.
 */
export const reponsesQui = (j: QuiRempli, { captures }: { captures: boolean }) => ({
  me: j.me,
  pronom: j.pronom,
  guess: j.guess,
  goal: j.goal,
  prenom: (captures && j.prenom.trim()) || null,
});
