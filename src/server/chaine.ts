import type { Verdict } from "@prompts/lib/schemas";
import type { Genre } from "./db/enums";
import type { Tache } from "./taches";

/*
 * La suite de la chaîne : ce qui vient après une étape, d’après ce qui est écrit en base et les tâches déjà lancées.
 * Des règles pures, sans base ni modèle : le moteur (src/server/pipeline.ts) les applique à la fin de chaque étape et
 * à l’ouverture du rapport (reparerLaChaine), l’écran du rapport (src/server/presentation/rapport.ts) en tire ce qu’il
 * montre du vocal. Testées en table (tests/unit/pipeline.test.ts).
 */

/** Les tâches d’une histoire, la dernière de chaque genre (etatDesTaches). */
export type EtatTaches = Partial<Record<Genre, Tache>>;

/** Ce que la chaîne regarde pour décider de la suite : ce qui est écrit en base, et les tâches déjà lancées. */
export type EtatChaine = {
  /** La conv brute est encore en base : le rapport et la mémoire la lisent (elle part après la mémoire, ou au bout de 30 jours). */
  conv: boolean;
  /** Une voix est configurée (voixDisponible). */
  voix: boolean;
  /** Le verdict écrit (son alerte, et le mode sobre qu’elle ouvre), ou null. */
  verdict: Pick<Verdict, "alerte" | "mode_sobre"> | null;
  /** Le plan du rapport est gardé (reports.plan). */
  plan: boolean;
  /** Le rapport est gardé (reports.data) : complet, ou sobre. */
  rapport: boolean;
  /** Le vocal du rapport, s’il est fait : à la version du script, et quand. */
  vocal: { aJour: boolean; fait: Date } | null;
  /** La dernière tâche de chaque genre de la chaîne (son code d’erreur, s’il est lu : une étape arrêtée par le budget de l’IA repart après minuit). */
  taches: Partial<Record<Genre, Pick<Tache, "status" | "createdAt"> & Partial<Pick<Tache, "error">>>>;
};

/** Une tâche qui attend ou tourne : elle n’est pas encore faite, mais rien ne sert de la planifier à nouveau. */
export const enMarche = (t?: Pick<Tache, "status">): boolean => t?.status === "attente" || t?.status === "en_cours";

/**
 * Une tâche « vocal » a-t-elle été tentée depuis le dernier vocal fait ? (Elle a fini, échoué, ou tourne encore.) Sans
 * vocal fait, toute tâche compte. Un échec n’est pas relancé à chaque ouverture : la tentative suffit.
 */
export const vocalTente = (t: Pick<Tache, "createdAt"> | undefined, vocal: { fait: Date } | null): boolean => !!t && (!vocal || t.createdAt > vocal.fait);

/**
 * Le vocal du rapport est-il à faire ? Avec une voix, jamais sur une alerte, une fois le plan (il s’écrit pendant les
 * chapitres) ou le rapport gardé. Pas s’il est déjà à la version du script, ni si une tâche « vocal » l’a tenté
 * depuis le dernier fait (vocalTente). Un vocal d’une ancienne version du script se refait ainsi une fois.
 * Héritage : un rapport sobre sans alerte (un rejet, verdicts d’avant le 9 octobre) a encore son vocal doux, même sans
 * l’accès (voir `suite` et vocalTache, src/server/analyse.ts). À retirer avec la branche de vocalTache, quand plus aucun
 * verdict d’avant le 9 octobre n’a mode_sobre sans alerte.
 */
function vocalAFaire({ voix, verdict, plan, rapport, vocal, taches }: EtatChaine): boolean {
  if (!voix || !verdict || verdict.alerte || !(plan || rapport) || vocal?.aJour) return false;
  return !enMarche(taches.vocal) && !vocalTente(taches.vocal, vocal);
}

/**
 * Ce qui vient ensuite, dans l’ordre où ça doit partir (aRelancer prend les tâches par date de planification) : le
 * plan du rapport après le verdict, les chapitres après le plan, le vocal, puis la mémoire une fois le rapport gardé.
 * Chaque étape n’est lancée qu’une fois : une tâche de ce genre qui existe déjà (en attente, en cours, finie ou en
 * échec) n’est pas replanifiée. Un échec repart par « Relancer l’écriture » (reprendre), pas par ici.
 * - Rien tant que le verdict n’est pas fini (sa tâche finie : à la fin de l’étape, le moteur la compte pour finie).
 * - `acces` : le compte peut lire le rapport (src/lib/acces.ts). Sans lui, seul le mode sobre (une alerte) ouvre le
 *   rapport doux, offert ; rien au-delà : ni la mémoire, ni le rapport complet.
 * - Le rapport et la mémoire lisent la conv brute : sans elle, ils ne partent plus. Le vocal, lui, se refait sur la
 *   mémoire.
 */
export function suite(etat: EtatChaine, acces: boolean): Genre[] {
  const { verdict, taches } = etat;
  if (!verdict || taches.verdict?.status !== "fini") return [];
  /* Héritage (vocalAFaire) : sans l’accès, un rapport sobre sans alerte (d’avant le 9 octobre) passe encore, pour son vocal doux */
  if (!acces && !verdict.mode_sobre) return [];
  const jamaisLancee = (g: Genre) => !taches[g];
  const genres: Genre[] = [];
  /* En mode sobre, le plan écrit tout le rapport doux en un appel (rapport sans plan) */
  if (etat.conv && !etat.plan && !etat.rapport && jamaisLancee("rapport_plan")) genres.push("rapport_plan");
  if (etat.conv && etat.plan && !etat.rapport && jamaisLancee("rapport_chapitres")) genres.push("rapport_chapitres");
  if (vocalAFaire(etat)) genres.push("vocal");
  if (acces && etat.conv && etat.rapport && jamaisLancee("memoire")) genres.push("memoire");
  return genres;
}
