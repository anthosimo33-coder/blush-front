"use client";

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

/** Où reprendre une fois cet achat livré (une adresse de l’appli), si l’écran qui l’a commencé l’a dit ; sinon null. */
export const suiteDuPaiement = (achat: string) => suiteSure(lire(cleDeLaSuite(achat), "session"));

/**
 * Commence le paiement de cette offre et part le payer ; `suite` : où reprendre ensuite. La promesse ne se résout que si
 * la page ne part pas (une erreur la rejette : ErreurApi « bientot », « renonciation »…).
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
