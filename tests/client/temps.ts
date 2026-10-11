/*
 * Le temps des tests du navigateur. Le cache de lecture (src/lib/query.ts) garde des heures d’un test à l’autre du même
 * fichier : les rendus serveur déjà montés (`clé@heure`) et les écritures du chat. Deux montages dans la même
 * milliseconde passeraient pour le même rendu revu, et une écriture d’un test rendrait dépassé le rendu « frais » du
 * suivant : le résultat dépendrait de la vitesse de la machine et de l’ordre des tests.
 * - chaqueTestASonHeure : chaque test vit dans sa propre heure (Date seulement, qui avance comme la vraie ; les minuteurs
 *   restent vrais) : rien de ce qu’un test a daté ne touche le suivant ;
 * - renduNeuf : l’heure d’un nouveau rendu serveur, toujours différente de la précédente (un « même rendu revu » s’écrit
 *   exprès, en repassant la même valeur).
 */
import { afterEach, beforeEach, vi } from "vitest";

const HEURE = 3_600_000;
const DEBUT = Date.UTC(2026, 0, 1);
let heures = 0;
let dernier = 0;

export function chaqueTestASonHeure() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(DEBUT + ++heures * HEURE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

/** L’heure d’un nouveau rendu serveur, à l’instant (`decalage` : avant ou après lui), jamais la même que la précédente. */
export const renduNeuf = (decalage = 0) => (dernier = Math.max(Date.now(), dernier + 1)) + decalage;
