import { jourDeParisAvant } from "@/lib/jours";

/*
 * Les jours de Paris des tests, comptés sur le calendrier (jourDeParisAvant de src/lib/jours.ts), jamais par
 * « maintenant moins 24 h » : le 25 octobre 2026, jour du passage à l’heure d’hiver, ce calcul tombait encore le jour
 * même entre 23 h et minuit, et trois tests avaient bloqué la mise en ligne (tests/unit/jours-de-paris.test.ts).
 */

/** Un instant de la veille à Paris, loin de ses deux minuits : midi UTC de ce jour-là, 13 h ou 14 h à Paris. */
export const midiDHier = (maintenant = new Date()) => new Date(`${jourDeParisAvant(1, maintenant)}T12:00:00Z`);
