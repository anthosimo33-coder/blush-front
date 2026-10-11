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
  | "annule"
  | "delai"
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

/** Ce que l’écran dit d’une étape en échec, d’après le code gardé en base (tasks.error) : le refus du modèle, ou une panne. */
export const echecDe = (code: string | null | undefined): Echec => (estRefus(code) ? "refus" : "panne");
