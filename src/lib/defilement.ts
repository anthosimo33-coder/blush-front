/**
 * Le défilement de la page, bloqué tant qu’un panneau est ouvert (une feuille, la story du vocal, la révélation du
 * verdict). Un compteur : deux panneaux l’un sur l’autre (la feuille de partage sur la révélation) ne se débloquent
 * pas l’un l’autre, et la valeur d’avant revient quand le dernier se ferme. Rend la fonction qui libère (une seule fois).
 */
let ouverts = 0;
let avant = "";

export function bloquerDefilement(): () => void {
  const html = document.documentElement;
  if (ouverts++ === 0) {
    avant = html.style.overflow;
    html.style.overflow = "hidden";
  }
  let libere = false;
  return () => {
    if (libere) return;
    libere = true;
    if (--ouverts === 0) html.style.overflow = avant;
  };
}
