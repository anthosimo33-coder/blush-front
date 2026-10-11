import type { Route } from "next";

/**
 * Où reprendre après la connexion (`?suite=`) : seulement une adresse de l’appli (« /rapport »), jamais un autre site
 * (« //exemple.com », « /\exemple.com »). null sinon.
 * Le navigateur retire les tabulations et les retours à la ligne d’une adresse : « /<tab>/exemple.com » deviendrait
 * « //exemple.com ». Une adresse qui contient un caractère de contrôle, un espace ou un « \ » est donc refusée, et ce
 * qui reste doit se résoudre sur le site lui-même. Ni « /.//exemple.com » ni « /..//exemple.com » : une fois les « . »
 * résolus, ils commencent par « // ». On renvoie l’adresse telle quelle (jamais sa forme résolue).
 */
export function suiteSure(suite: unknown): Route | null {
  if (typeof suite !== "string" || !/^\/(?![/\\])/.test(suite) || /[\u0000- \u007f-\u009f\\]|\s/.test(suite)) return null;
  const ici = "https://blush.invalid";
  try {
    const u = new URL(suite, ici);
    /* Une adresse du site, vérifiée ici : la page qu’elle vise n’existe peut-être pas (une 404 du site, jamais un autre) */
    return u.origin === ici && !u.pathname.startsWith("//") ? (suite as Route) : null;
  } catch {
    return null;
  }
}

/** L’adresse de la connexion qui ramène ensuite à `suite`. */
export const connexionPuis = (suite: string): Route => `/connexion?suite=${encodeURIComponent(suite)}`;
