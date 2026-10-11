/*
 * Les listes d’un test, sous noUncheckedIndexedAccess : `liste[0]` et `const [a, b] = liste` y sont typés `T | undefined`.
 * Un seul élément se lit par `liste[0]!` ; plusieurs, déstructurés, par auMoins, qui les type sans `undefined` et fait
 * échouer le test là, en le disant, quand la liste est trop courte (plutôt qu’un « Cannot read properties of undefined »
 * trois lignes plus loin).
 */

/** Le n-uplet de `N` éléments de type `T` : `NUplet<string, 2>` est `[string, string]`. */
type NUplet<T, N extends number, R extends T[] = []> = R["length"] extends N ? R : NUplet<T, N, [...R, T]>;

/**
 * La liste, qui doit avoir au moins `n` éléments, typée pour qu’une déstructuration de ses `n` premiers n’ait pas de
 * `undefined` : `const [texte, carte] = auMoins(screen.getAllByRole("alert"), 2)`. Les suivants restent permis (`...reste`).
 */
export function auMoins<T, const N extends number>(liste: readonly T[], n: N): [...NUplet<T, N>, ...T[]] {
  if (liste.length < n) throw new Error(`au moins ${n} élément(s) attendu(s), la liste en a ${liste.length}`);
  return liste as unknown as [...NUplet<T, N>, ...T[]];
}
