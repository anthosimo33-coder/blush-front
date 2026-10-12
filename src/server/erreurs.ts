import "server-only";
import type { Echec } from "@/types";
import { codePublic, type CodeErreur } from "@/types/erreurs-api";

/*
 * Les erreurs du serveur, en deux familles. Une ErreurPublique porte un code de la liste de l’API
 * (src/types/erreurs-api.ts) : la route le répond tel quel (reponseErreur, src/server/http.ts). Une ErreurTache porte un
 * code interne, qui ne sort pas du serveur : le navigateur n’en apprend que codePublic.
 */

/**
 * Une erreur attendue que le navigateur peut connaître : son code est celui de la liste de l’API, avec son statut, et
 * reponseErreur le répond sans rien y ajouter. Chaque module en dérive la sienne, bornée aux codes qu’il peut lever
 * (ErreurImport, ErreurAjout, ErreurCaptures, LectureRefusee, ErreurPartage).
 */
export class ErreurPublique<C extends CodeErreur = CodeErreur> extends Error {
  constructor(readonly code: C) {
    super(code);
    /* Son nom dans les logs, qui ne gardent que lui (« ErreurImport ») : celui de la classe qui l’a levée */
    this.name = new.target.name;
  }
}

/**
 * Le code d’une étape qui échoue : il part dans les logs, dans la tâche (tasks.error) et dans l’alerte à l’équipe, jamais
 * de contenu. Un refus du modèle porte sa catégorie quand il la donne (« refus:cyber »). Le navigateur n’en voit que
 * codePublic (src/types/erreurs-api.ts).
 */
export type CodeTache =
  | "refus"
  | `refus:${string}`
  | "sortie_illisible"
  | "transcription"
  | "delai"
  /* Le budget de l’IA du jour est atteint (src/server/budget.ts) : l’appel n’est pas parti */
  | "budget"
  /* Le budget de la voix (src/server/ia/voix.ts) arrête le vocal du rapport : il repart après minuit, la chaîne continue */
  | "voix_budget"
  /* La voix n’a pas dit le vocal du rapport (ErreurVoix : « voix_429 », « voix_delai »…) */
  | `voix_${string}`
  | "contexte_absent"
  | "conv_effacee"
  | "tache_inconnue"
  | "verdict_absent"
  | "sobre_vide"
  | "plan_vide"
  | "plan_absent"
  | "chapitres_vides"
  | "rapport_absent"
  | "memoire_vide"
  | "memoire_absente"
  | "memoire_changee";

/**
 * Les codes d’un arrêt par un budget, celui de l’IA ou celui de la voix (tasks.error) : l’étape repart après minuit, ce
 * n’est pas un échec définitif. La seule liste : la suspension et la reprise (src/server/pipeline.ts), le résumé de la
 * nuit (src/server/veille.ts).
 */
export const ARRETS_DU_BUDGET = ["budget", "voix_budget"] as const satisfies readonly CodeTache[];
export type ArretDuBudget = (typeof ARRETS_DU_BUDGET)[number];

/** Une erreur attendue d’une étape (son code part dans les logs et la tâche, jamais de contenu). */
export class ErreurTache extends Error {
  constructor(readonly code: CodeTache) {
    super(code);
  }
}

/**
 * Le modèle a-t-il refusé (ses règles, ou les filtres de son prestataire) ? Réessayer n’y changerait rien. Une erreur
 * d’étape, ou le code gardé en base (tasks.error).
 */
export const estRefus = (e: ErreurTache | string | null | undefined): boolean => !!e && codePublic(typeof e === "string" ? e : e.code) === "refus";

/** Le budget de l’IA du jour a arrêté cette étape (une erreur, ou le code gardé en base) : elle repart après minuit, sans user ses essais. */
export const estBudget = (e: ErreurTache | string | null | undefined): boolean => (typeof e === "string" ? e : e?.code) === "budget";

/** Le budget de la voix a arrêté le vocal du rapport (une erreur, ou le code gardé en base) : il repart après minuit, sans user ses essais. */
export const estBudgetVoix = (e: ErreurTache | string | null | undefined): boolean => (typeof e === "string" ? e : e?.code) === "voix_budget";

/**
 * Ce que l’écran dit d’une étape en échec, d’après le code gardé en base (tasks.error) : le refus du modèle, le budget du
 * jour atteint (« souffle » : ça repart demain), ou une panne.
 */
export const echecDe = (code: string | null | undefined): Echec => (estRefus(code) ? "refus" : estBudget(code) ? "souffle" : "panne");

/**
 * Ce qui ne devrait jamais arriver : une ligne attendue absente, une valeur gardée qui n’a pas sa forme, une erreur du
 * code. Son code, court et sans valeur (« stories:curseur:aucune_ligne »), est ce que le journal en garde avec son nom
 * (champsDErreur, src/lib/tracer.ts : lettres, chiffres, « : », « . », « - », « _ », 60 au plus) : sans lui, la ligne
 * ne dirait que « Error ». Le message peut en dire un peu plus (les champs en cause) ; il ne sort jamais du serveur.
 */
export class ErreurInvariant extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = "ErreurInvariant";
  }
}
