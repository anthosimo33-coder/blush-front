"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { CATALOGUE } from "@/contenu/offres";
import { commencerPaiement, etatDuPaiement } from "@/services/api";
import type { OffreId } from "@/types";
import type { EtatAchat } from "@/types/api";
import { ecrire, lire } from "./stockage";
import { suiteSure } from "./suite";

/*
 * Partir payer sur la page de Whop, depuis n’importe quel écran : le serveur commence le paiement (POST /api/paiement),
 * puis on part sur sa page (celle de Whop, ou du faux Whop en local), d’où l’on revient sur /paiement/retour. Le
 * paiement en un geste (les offres de « C’est débloqué ») n’a pas de page : on va tout de suite au retour, qui attend la
 * livraison. Le paiement dans la feuille (src/components/paiement/integre) passe avant : ceci est son repli, quand les
 * Elements de Whop ne se chargent pas. Les deux attendent la livraison de la même façon (attendreLaLivraison, la page
 * du retour), et mènent au même endroit (versDebloque).
 * Où reprendre après le retour (`suite` : la page qui a ouvert le paiement) se garde dans l’onglet (sessionStorage),
 * le temps d’aller chez Whop et d’en revenir : une commodité, sans elle on reprend au rapport, ou à l’accueil.
 */

/** La clé de la suite d’un achat dans l’onglet. */
const cleDeLaSuite = (achat: string) => `blush.paiement.suite.${achat}`;

/**
 * Où reprendre une fois cet achat livré (une adresse de l’appli), si l’écran qui l’a commencé l’a dit ; sinon null.
 * `bulles` : celles que l’achat livré a données (le serveur) ; une recharge revient sur l’accueil avec `?recharge=<bulles>`
 * (son mot « +N bulles ») : ce nombre-là est celui du serveur, pas celui que la feuille a compté avant de payer (le bonus ④
 * pas encore su, ou plus valable).
 */
export function suiteDuPaiement(achat: string, bulles?: number): Route | null {
  const suite = suiteSure(lire(cleDeLaSuite(achat), "session"));
  if (!suite || bulles === undefined) return suite;
  const u = new URL(suite, "https://blush.invalid");
  if (!u.searchParams.has("recharge")) return suite;
  u.searchParams.set("recharge", String(bulles));
  return `${u.pathname}${u.search}${u.hash}` as Route;
}

/** Garde dans l’onglet où reprendre une fois cet achat livré (`suite` : une adresse de l’appli), s’il y en a une. */
export function noterLaSuite(achat: string, suite: string | null | undefined): void {
  if (suite) ecrire(cleDeLaSuite(achat), suite, "session");
}

/** Où mener un achat payé qui débloque un rapport : « C’est débloqué », qui reprend ensuite où le paiement a commencé (`suite`). */
export const versDebloque = (achat: string, suite: string | null): Route => `/rapport/debloque?achat=${achat}${suite ? `&suite=${encodeURIComponent(suite)}` : ""}`;

/** Où mener un achat payé : « C’est débloqué » pour un rapport ; sinon (des bulles) là où le paiement a commencé, ou l’accueil. */
export function apresLaLivraison(e: Pick<EtatAchat, "achat" | "offre" | "bulles">): Route {
  const suite = suiteDuPaiement(e.achat, e.bulles);
  return CATALOGUE[e.offre].conv ? versDebloque(e.achat, suite) : ((suite ?? "/app") as Route);
}

/** Toutes les combien relire un achat payé dans la feuille, et combien de fois avant de laisser la page du retour attendre la suite. */
const PAS_DE_LA_LIVRAISON_MS = 1_000;
const ESSAIS_DE_LA_LIVRAISON = 20;

/**
 * Attend la livraison d’un achat payé dans la feuille (GET /api/paiement/[achat], avec le paiement de Whop, `paiement`,
 * que le serveur vérifie chez Whop si le webhook tarde) : l’achat livré, « echoue » (la banque a dit non après coup :
 * payment.failed), ou null après une vingtaine de secondes, quand la page du retour prend le relais (elle attend plus
 * longtemps, et le dit). `signal` : l’écran parti, on cesse de relire. Le réseau qui coupe, on réessaie.
 */
export async function attendreLaLivraison(achat: string, paiement: string | null, { signal }: { signal?: AbortSignal } = {}): Promise<EtatAchat | "echoue" | null> {
  for (let essai = 0; essai < ESSAIS_DE_LA_LIVRAISON && !signal?.aborted; essai++) {
    try {
      const e = await etatDuPaiement(achat, paiement);
      if (e.statut === "paye") return e;
      if (e.statut !== "en_attente") return "echoue";
    } catch {
      /* Le réseau, ou un serveur en pleine mise en ligne : la relecture suivante */
    }
    await new Promise((ok) => setTimeout(ok, PAS_DE_LA_LIVRAISON_MS));
  }
  return null;
}

/** L’adresse de la page du retour pour cet achat (et ce paiement), qui attend la livraison et la dit. */
export const versLeRetour = (achat: string, paiement: string | null): Route => `/paiement/retour?achat=${achat}${paiement ? `&payment=${encodeURIComponent(paiement)}` : ""}`;

/**
 * Commence le paiement de cette offre et part le payer (`aller` : la navigation de l’écran, pour une page de l’appli) ;
 * `suite` : où reprendre ensuite. Une erreur la rejette (ErreurApi « bientot », « renonciation »…) : rien n’est parti.
 */
export async function partirPayer(
  offre: OffreId,
  { renonciation, suite, aller }: { renonciation: boolean; suite?: string | null; aller: (adresse: string) => void },
): Promise<void> {
  const { achat, url, paiement } = await commencerPaiement(offre, renonciation);
  noterLaSuite(achat, suite);
  /* La page de Whop est un autre site : une vraie navigation ; le faux Whop et le retour sont des pages de l’appli. Le
     paiement en un geste va au retour avec son paiement, que le serveur vérifie chez Whop si le webhook tarde (ARG-3) */
  if (url && /^https?:\/\//.test(url)) window.location.assign(url);
  else aller(url ?? versLeRetour(achat, paiement?.id ?? null));
}

/**
 * Libère le bouton qui est parti payer quand on revient de chez Whop par « Retour » : le navigateur rend alors la page
 * telle qu’il l’avait gardée (le cache des pages, « bfcache », surtout sur iPhone), bouton occupé compris, sans rien
 * recharger. Seul l’événement pageshow le dit (`persisted`).
 */
export function useLibererAuRetour(liberer: () => void): void {
  useEffect(() => {
    const retour = (e: PageTransitionEvent) => {
      if (e.persisted) liberer();
    };
    window.addEventListener("pageshow", retour);
    return () => window.removeEventListener("pageshow", retour);
  }, [liberer]);
}
