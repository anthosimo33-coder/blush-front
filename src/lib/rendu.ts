/**
 * L’heure d’un rendu serveur (Date.now()), prise avant les lectures de la page et passée à l’écran avec sa donnée :
 * voir `rendu` et `frais` dans useQuery (src/lib/query.ts). Une fonction à part : une page serveur ne se rend qu’une
 * fois par requête, mais la règle de pureté des composants refuse Date.now() écrit dans son corps.
 */
export const heureDuRendu = () => Date.now();
