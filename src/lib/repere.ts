/*
 * Les repères : sans directive ni hook, pour qu’un module partagé avec le serveur (src/app/rapport/ancres.ts) puisse en
 * créer. Ceux qui les suivent (useEnVue, useHauteur) sont dans src/lib/hooks.ts.
 */

/**
 * Un élément de la page que d’autres écrans suivent, sans le chercher dans le DOM : celui qui le montre lui passe le
 * repère en `ref` (il rend de quoi l’oublier quand React l’enlève), ceux qui le suivent le lisent (useEnVue,
 * useHauteur) et sont prévenus quand il arrive ou s’en va.
 */
export type Repere = ((el: HTMLElement | null) => () => void) & {
  lire: () => HTMLElement | null;
  abonner: (f: () => void) => () => void;
};

/** Un repère (voir Repere), créé une fois pour toute la page (au niveau du module). */
export function creerRepere(): Repere {
  let el: HTMLElement | null = null;
  const abonnes = new Set<() => void>();
  const poser = (nouveau: HTMLElement | null) => {
    if (nouveau === el) return;
    el = nouveau;
    abonnes.forEach((f) => f());
  };
  /* Un élément qui s’en va n’efface pas celui qui l’a déjà remplacé */
  const attacher = (nouveau: HTMLElement | null) => {
    poser(nouveau);
    return () => {
      if (el === nouveau) poser(null);
    };
  };
  return Object.assign(attacher, {
    lire: () => el,
    abonner: (f: () => void) => {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
  });
}
