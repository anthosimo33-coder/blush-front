import { PLANS, type Plan } from "@/types";

/*
 * Ce que chaque plan ouvre, écrit une fois pour l’écran (le paiement par-dessus, AppScreen) et pour le serveur (les
 * routes qui refusent, la chaîne d’analyse qui écrit le rapport). Seule « Ta question » n’a pas encore son refus côté
 * serveur (voir plus bas). Les plans se suivent : chacun ouvre ce qu’ouvre celui d’avant, et plus.
 */

/** Le plan qu’il faut au moins pour chaque besoin. */
const PLAN_REQUIS = {
  /* Tous les chapitres du rapport (le premier est offert, src/contenu/chapitres.ts), et la mémoire qui le suit */
  rapport: "rapport",
  /*
   * « Ta question », incluse avec le rapport. TODO(produit): elle part par POST /api/chat, qui ne connaît que `chat`
   * (BLUSH+) : avec le seul rapport, l’écran s’ouvre mais l’envoi répond 402. Sans effet en bêta (débloquer donne
   * BLUSH+) ; la route devra reconnaître une question du rapport (un marqueur dans l’envoi, avec S-26) et lire ce besoin.
   */
  question: "rapport",
  /* Le chat de l’accueil, l’aide à chaque message */
  chat: "blushplus",
  /* Sa fiche, et ce qu’on y ajoute */
  fiche: "blushplus",
} as const satisfies Record<string, Plan>;

export type Besoin = keyof typeof PLAN_REQUIS;

/** Le rang d’un plan, son ordre dans PLANS : gratuit 0, rapport 1, BLUSH+ 2. */
export const rang = (plan: Plan) => PLANS.indexOf(plan);

/** Ce plan ouvre-t-il ce besoin ? */
export const peut = (plan: Plan, besoin: Besoin) => rang(plan) >= rang(PLAN_REQUIS[besoin]);
