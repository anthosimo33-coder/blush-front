import { PLANS, type Plan } from "@/types";

/*
 * Ce que chaque plan ouvre, écrit une fois pour l’écran (le paiement par-dessus, AppScreen) et pour le serveur (les
 * routes qui refusent, la chaîne d’analyse qui écrit le rapport). Un besoin n’a pas encore tout son refus côté serveur
 * (voir plus bas) : la lecture de sa fiche (seul l’ajout est refusé). Les plans se suivent : chacun ouvre ce qu’ouvre
 * celui d’avant, et plus.
 */

/** Le plan qu’il faut au moins pour chaque besoin. */
const PLAN_REQUIS = {
  /* Tous les chapitres du rapport (le premier est offert, src/contenu/chapitres.ts), et la mémoire qui le suit */
  rapport: "rapport",
  /*
   * « Ta question », incluse avec le rapport. Elle part par POST /api/chat, marquée `question` : la route lit ce besoin
   * pour elle, `chat` pour le reste. Sans le chat (le plan « rapport »), une par conv (src/server/question-incluse.ts),
   * puis 402 comme le chat : l’écran ouvre le paiement de BLUSH+
   */
  question: "rapport",
  /* Le chat de l’accueil, l’aide à chaque message */
  chat: "blushplus",
  /*
   * Sa fiche, et ce qu’on y ajoute. Côté serveur, seul l’ajout (POST /api/fiche) est refusé sans BLUSH+ : la lire (GET,
   * la page /app/fiche) et la corriger (PUT) ne vérifient pas le plan, seul l’écran le fait (S-26 de l’audit, gravité
   * basse). TODO(produit): refuser aussi la lecture et la correction (garde avec plan "fiche", et la page) avec S-26.
   */
  fiche: "blushplus",
} as const satisfies Record<string, Plan>;

export type Besoin = keyof typeof PLAN_REQUIS;

/** Le rang d’un plan, son ordre dans PLANS : gratuit 0, rapport 1, BLUSH+ 2. */
export const rang = (plan: Plan) => PLANS.indexOf(plan);

/** Ce plan ouvre-t-il ce besoin ? */
export const peut = (plan: Plan, besoin: Besoin) => rang(plan) >= rang(PLAN_REQUIS[besoin]);

/**
 * L’offre que le paiement propose quand ce plan n’ouvre pas ce besoin : qui a déjà payé (le rapport) et demande ce
 * qu’ouvre seulement un plan au-dessus (le chat, sa fiche : BLUSH+) ne voit que ce plan. undefined : toutes les offres
 * (le plan gratuit, ou un besoin que le plan ouvre déjà).
 */
export const offreAProposer = (plan: Plan, besoin: Besoin): Exclude<Plan, "gratuit"> | undefined => (plan !== "gratuit" && !peut(plan, besoin) ? PLAN_REQUIS[besoin] : undefined);
