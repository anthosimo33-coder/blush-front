import { useEffect, useRef, useState } from "react";

/**
 * Lance `faire` quand la page est au repos (après le chargement, entre deux gestes), pour préparer ce qui servira
 * peut-être (une feuille, un son) sans prendre de temps au premier affichage. Safari n’a pas requestIdleCallback :
 * un délai court le remplace. Rend la fonction qui annule.
 */
export function auRepos(faire: () => void, delai = 1200): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(faire, { timeout: delai * 2 });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(faire, delai);
  return () => window.clearTimeout(t);
}

/**
 * Le code d’une feuille rare (le paiement, la recharge), chargé quand la page est au repos plutôt qu’avec elle : vrai
 * une fois `charger` fini (son module est alors prêt, la feuille s’ouvre sans attendre), ou dès que la feuille est
 * demandée (`ouverte`), et pour de bon. Rien n’est chargé tant que la feuille n’est pas `utile` (un rapport déjà débloqué ne se paie plus).
 */
export function useChargeAuRepos(charger: () => Promise<unknown>, { utile = true, ouverte = false }: { utile?: boolean; ouverte?: boolean } = {}): boolean {
  const [pret, setPret] = useState(false);
  /* Ouverte une fois, elle reste montée : refermée avant la fin du chargement au repos, elle perdrait ce qu’elle montre encore (l’offre ① de « Ta formule ») */
  const [demandee, setDemandee] = useState(false);
  if (ouverte && !demandee) setDemandee(true);
  const aCharger = useRef(charger);
  useEffect(() => {
    if (!utile || pret) return;
    let fini = false;
    const annuler = auRepos(() => void aCharger.current().then(() => !fini && setPret(true)));
    return () => {
      fini = true;
      annuler();
    };
  }, [utile, pret]);
  return pret || ouverte || demandee;
}
