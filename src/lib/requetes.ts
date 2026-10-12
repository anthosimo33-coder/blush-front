"use client";

/*
 * Ce que le cache des requêtes (src/lib/query.ts) garde du compte et de la conv ouverte, et ce qui le fait relire : les
 * écrans passent par ici, pour qu’un changement de conv ou un paiement n’oublie aucune donnée.
 */
import type { useRouter } from "next/navigation";
import { getAccount, getReport, openConv } from "@/services/api";
import type { Account, ReportPayload } from "@/types/api";
import { invalidate, useQuery, type Cle, type OptionsLecture } from "./query";

/**
 * Ce qui change avec la conv ouverte : son rapport, et le compte (sa conv supprimée ou non). La fiche n’y est pas : elle
 * a une clé par conv (`fiche:<id>`).
 */
const CLES_DE_LA_CONV = ["report", "account"] as const satisfies readonly Cle[];

/** Le compte (son email, son plan), lu une seule fois pour tous les écrans montés ; `initial` : celui que la page serveur a rendu. */
export const useCompte = (initial?: Account, options?: OptionsLecture) => useQuery("account", getAccount, initial, options);

/** Le rapport de la conv ouverte, à partir de celui que la page serveur a rendu (`initial`, voir useQuery). */
export const useRapport = (initial: ReportPayload, options?: OptionsLecture) => useQuery("report", getReport, initial, options);

/**
 * Ouvre une autre conv du compte (voir openConv), et oublie ce que le cache des requêtes et le routeur gardaient de
 * l’ancienne. Les pages préchargées en entier (sa fiche, depuis l’accueil) restent 5 min dans le routeur : sans
 * `router.refresh()`, qui les oublie toutes, sa fiche s’ouvrirait sur l’autre personne. Toute entrée qui change de conv
 * (« Tes convs », « Mon compte ») passe par ici, son routeur en main : la navigation partie juste après passe devant.
 */
export function changerDeConv(storyId: string, router: Pick<ReturnType<typeof useRouter>, "refresh">) {
  openConv(storyId);
  invalidate(...CLES_DE_LA_CONV);
  router.refresh();
}

/** Après un paiement : le rapport (ses chapitres ouverts) et le compte (son plan) se relisent. */
export const apresDeblocage = () => invalidate("report", "account");
