import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/*
 * L’échéance d’une exécution : une fonction Vercel est coupée au bout de 300 s (plan gratuit). Les appels lents (le
 * modèle, la voix, les mails) s’arrêtent avant, au lieu d’être coupés en plein milieu (un appel payé pour rien, une
 * tâche laissée « en cours »). Sans échéance (un script, les tests), rien ne change.
 */
const echeances = new AsyncLocalStorage<number>();

/** Exécute `fn` avec une échéance dans `ms` (jamais plus tard qu’une échéance déjà posée autour). */
export function avecEcheance<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const autour = echeances.getStore() ?? Infinity;
  return echeances.run(Math.min(autour, Date.now() + ms), fn);
}

/** Le temps qu’il reste avant l’échéance, en millisecondes (Infinity sans échéance). */
export function tempsRestant(): number {
  const e = echeances.getStore();
  return e === undefined ? Infinity : e - Date.now();
}

/** Le délai d’attente d’un appel : le sien, ou ce qu’il reste avant l’échéance (moins une marge pour finir proprement). */
export const delaiAppel = (defaut: number, marge = 5_000) => Math.max(1_000, Math.min(defaut, tempsRestant() - marge));
