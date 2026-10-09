/**
 * Où reprendre après la connexion (`?suite=`) : seulement une adresse de l’appli (« /rapport »), jamais un autre site
 * (« //exemple.com », « /\exemple.com »). null sinon.
 */
export function suiteSure(suite: unknown): string | null {
  return typeof suite === "string" && /^\/(?![/\\])/.test(suite) ? suite : null;
}

/** L’adresse de la connexion qui ramène ensuite à `suite`. */
export const connexionPuis = (suite: string) => `/connexion?suite=${encodeURIComponent(suite)}`;
