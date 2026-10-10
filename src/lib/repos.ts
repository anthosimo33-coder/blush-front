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
