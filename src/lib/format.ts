/** 1202 → « 1 202 » (espace insécable, comme dans les maquettes). */
export function formatCount(n: number) {
  return n.toLocaleString("fr-FR").replace(/[  \s]/g, " ");
}
