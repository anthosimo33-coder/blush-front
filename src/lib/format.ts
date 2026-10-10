/** L’espace insécable (U+00A0), avant ? ! : ; » et après « : le signe ne part pas seul à la ligne (scripts/verifier-typo.mjs). */
export const NBSP = "\u00a0";

/** 1202 → « 1 202 » (espace insécable, comme dans les maquettes). */
export function formatCount(n: number) {
  return n.toLocaleString("fr-FR").replace(/\s/g, NBSP);
}
