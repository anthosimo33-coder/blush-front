"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { commencerPaiement } from "@/services/api";
import type { OffreId } from "@/types";
import { ecrire, lire } from "./stockage";
import { suiteSure } from "./suite";

/*
 * Partir payer, depuis n’importe quel écran : le serveur commence le paiement (POST /api/paiement), puis on part sur sa
 * page (celle de Whop, ou du faux Whop en local), d’où l’on revient sur /paiement/retour. Le paiement en un geste (③)
 * n’a pas de page : on va tout de suite au retour, qui attend la livraison. La vague 2 mettra la page de Whop dans nos
 * feuilles (ses Elements) ; ceci reste son repli.
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

/**
 * Commence le paiement de cette offre et part le payer (`aller` : la navigation de l’écran, pour une page de l’appli) ;
 * `suite` : où reprendre ensuite. Une erreur la rejette (ErreurApi « bientot », « renonciation »…) : rien n’est parti.
 */
export async function partirPayer(
  offre: OffreId,
  { renonciation, suite, aller }: { renonciation: boolean; suite?: string | null; aller: (adresse: string) => void },
): Promise<void> {
  const { achat, url } = await commencerPaiement(offre, renonciation);
  if (suite) ecrire(cleDeLaSuite(achat), suite, "session");
  /* La page de Whop est un autre site : une vraie navigation ; le faux Whop et le retour sont des pages de l’appli */
  if (url && /^https?:\/\//.test(url)) window.location.assign(url);
  else aller(url ?? `/paiement/retour?achat=${achat}`);
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
