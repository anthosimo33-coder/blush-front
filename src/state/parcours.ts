import { nomLu } from "@/lib/participants";
import type { Goal, Guess, Pronom } from "@/types";
import type { JourneyState } from "./journey";

/*
 * Les règles du parcours d’import, sans React ni stockage : quand « Qui es-tu ? » est complet, et ce qu’il envoie pour
 * lancer la lecture (POST /api/analyse). « Qui es-tu ? » et l’écran du code reçu par email, qui lance la lecture lui
 * aussi, suivent les mêmes.
 */

/** Le parcours, « Qui es-tu ? » complet. */
type QuiRempli = JourneyState & { me: string; pronom: Pronom; guess: Guess; goal: Goal };

/**
 * La conv de cet onglet vient-elle de captures ? Son dernier import le dit : un export laisse son nom de fichier dans le
 * parcours, des captures l’effacent (src/app/importer/captures). Un morceau ajouté (src/server/morceaux.ts) : des
 * captures ajoutées à un export le gardent, un export ajouté à des captures le pose ; la conv a alors deux noms, on
 * choisit le sien. L’écran qui reçoit la conv du serveur (QuiScreen) se fie à elle plutôt qu’à ceci.
 */
export const vientDeCaptures = (j: Pick<JourneyState, "exportFileName">) => !j.exportFileName;

/**
 * Sur des captures (ou un enregistrement), ce qui aide à se retrouver au-dessus de « Ton prénom » : l’autre nommé quand
 * la lecture a lu son nom en haut de la conv (nomLu), sinon personne.
 */
export function aideDuPrenom(autre: string): string {
  return `Ton prénom (dans votre conv${nomLu(autre) ? ` avec ${autre}` : ""}, tu es à droite)`;
}

/**
 * « Qui es-tu ? » est-il complet ? Qui est toi, ton pronom, ta devinette et ce que tu veux ; sur des captures (où tu
 * n’es que « Moi »), ton prénom ; et le sien quand la lecture n’a pas lu son nom (`sonPrenom`, voir nomLu).
 */
export function quiComplet(j: JourneyState, { captures, sonPrenom = false }: { captures: boolean; sonPrenom?: boolean }): j is QuiRempli {
  return !!j.me && (!captures || !!j.prenom.trim()) && (!sonPrenom || !!j.prenomAutre.trim()) && !!j.pronom && !!j.guess && !!j.goal;
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
  /* Le sien, sur des captures : le serveur ne le pose que si la lecture n’a pas lu son nom (definirQui) */
  prenomAutre: (captures && j.prenomAutre.trim()) || null,
});
