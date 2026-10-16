/* Remplacer un prénom dans ce qu’un modèle a écrit : la lecture partagée d’une conv de tournage (src/server/tournage.ts). */

/**
 * Le prénom `ancien` remplacé par `nouveau`, partout dans une valeur (ses chaînes, à toute profondeur) : un mot entier,
 * tel quel, en capitales ou en minuscules. La lecture partagée d’une conv de tournage a été écrite pour la créatrice de
 * la source (« Lorena. Assieds-toi… ») : chaque prise prend le prénom de la sienne. Rien ne change si les deux sont les mêmes.
 */
export function renommer<T>(valeur: T, ancien: string, nouveau: string): T {
  if (!ancien || ancien === nouveau) return valeur;
  const paires = [
    [ancien, nouveau],
    [ancien.toUpperCase(), nouveau.toUpperCase()],
    [ancien.toLowerCase(), nouveau.toLowerCase()],
  ].filter(([a], k, toutes) => toutes.findIndex(([b]) => b === a) === k);
  const regles = paires.map(([a, n]) => [new RegExp(`(?<![\\p{L}\\p{N}])${a!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"), n!] as const);
  const changer = (x: unknown): unknown => {
    if (typeof x === "string") return regles.reduce((t, [r, n]) => t.replace(r, n), x);
    if (Array.isArray(x)) return x.map(changer);
    if (x && typeof x === "object" && !(x instanceof Date)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, changer(v)]));
    return x;
  };
  return changer(valeur) as T;
}
