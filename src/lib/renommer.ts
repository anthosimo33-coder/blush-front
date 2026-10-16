/* Remplacer un prénom dans ce qu’un modèle a écrit : la lecture partagée d’une conv de tournage (src/server/tournage.ts). */

/* Les formes d’un prénom qu’on cherche : tel quel, en capitales, en minuscules */
const formes = (prenom: string) => [prenom, prenom.toUpperCase(), prenom.toLowerCase()];

/* Un mot entier : ni lettre ni chiffre collés devant ou derrière (« Léa » dans « Léa, » mais pas dans « Léane ») */
const motEntier = (mot: string, drapeaux: string) => new RegExp(`(?<![\\p{L}\\p{N}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, drapeaux);

/* Les chaînes d’une valeur, à toute profondeur, changées par `f` (les autres valeurs restent les mêmes) */
const chaque = (x: unknown, f: (t: string) => string): unknown => {
  if (typeof x === "string") return f(x);
  if (Array.isArray(x)) return x.map((y) => chaque(y, f));
  if (x && typeof x === "object" && !(x instanceof Date)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, chaque(v, f)]));
  return x;
};

/**
 * Le prénom `ancien` remplacé par `nouveau`, partout dans une valeur (ses chaînes, à toute profondeur) : un mot entier,
 * tel quel, en capitales ou en minuscules. La lecture partagée d’une conv de tournage a été écrite pour la créatrice de
 * la source (« Lorena. Assieds-toi… ») : chaque prise prend le prénom de la sienne. Rien ne change si les deux sont les mêmes.
 */
export function renommer<T>(valeur: T, ancien: string, nouveau: string): T {
  if (!ancien || ancien === nouveau) return valeur;
  const vers = formes(nouveau);
  const regles = formes(ancien)
    .map((a, k) => [a, vers[k]!] as const)
    .filter(([a], k, toutes) => toutes.findIndex(([b]) => b === a) === k)
    .map(([a, n]) => [motEntier(a, "gu"), n] as const);
  return chaque(valeur, (t) => regles.reduce((u, [r, n]) => u.replace(r, n), t)) as T;
}

/** Le prénom apparaît-il dans une valeur (ses chaînes, à toute profondeur), comme renommer le remplacerait ? */
export function mentionne(valeur: unknown, prenom: string): boolean {
  if (!prenom) return false;
  const regles = [...new Set(formes(prenom))].map((a) => motEntier(a, "u"));
  let trouve = false;
  chaque(valeur, (t) => {
    trouve ||= regles.some((r) => r.test(t));
    return t;
  });
  return trouve;
}
