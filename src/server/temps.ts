import "server-only";
import { sql } from "drizzle-orm";

/** Le jour à Paris (AAAA-MM-JJ), et le même jour à minuit UTC : la date du jour que reçoit le modèle. */
export function aujourdhuiParis(maintenant = new Date()): { iso: string; t: number } {
  const iso = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  return { iso, t: Date.parse(`${iso}T00:00:00Z`) };
}

/**
 * Minuit à Paris, aujourd’hui, en SQL : le début du jour du budget de l’IA (src/server/budget.ts), et l’heure avant
 * laquelle une tâche arrêtée par lui peut repartir (src/server/pipeline.ts).
 */
export const DEBUT_DU_JOUR = sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;

/**
 * Les jours qu’une conv couvre, du premier au dernier compris : du 4 au 7 septembre, 4 jours ; un seul jour, 1. `debut`
 * et `fin` sont des jours AAAA-MM-JJ du calendrier de la conv, celui de l’heure écrite dans l’export (l’heure de Paris
 * pour une conv française) : resume.debut de sa meta, Chiffres.debut de prompts/lib/conv.ts. La durée que montrent la
 * lecture (src/server/ecrans/trouvailles.ts) et le verdict (src/server/conv-affichee.ts) : la même, une seule fois.
 */
export function joursCouverts(debut: string, fin: string): number {
  const ecart = Math.round((Date.parse(fin.slice(0, 10)) - Date.parse(debut.slice(0, 10))) / 86400e3);
  return Number.isFinite(ecart) ? Math.max(1, ecart + 1) : 1;
}

/** Un moment dit comme dans Messages, à l’heure de Paris : « aujourd’hui », « hier », « lun. » dans la semaine, puis « 12 mars ». */
export function jourRelatif(quand: Date, maintenant = new Date()): string {
  const ecart = Math.round((aujourdhuiParis(maintenant).t - aujourdhuiParis(quand).t) / 86400e3);
  if (ecart <= 0) return "aujourd’hui";
  if (ecart === 1) return "hier";
  const format = ecart < 7 ? ({ weekday: "short" } as const) : ({ day: "numeric", month: "short" } as const);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...format }).format(quand);
}

/** Attendre `ms` millisecondes (sans rien bloquer d’autre). */
type Pause = (ms: number) => Promise<void>;
const dormir: Pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
/*
 * Sous vitest (NODE_ENV vaut « test », lu au chargement), les pauses ne dorment pas : une chaîne relancée trois fois y
 * dormait 3 + 6 + 9 s. Un test qui veut les compter passe la sienne (definirPause). Cette branche ira dans la
 * préparation des tests (un setupFiles de vitest.config.mts qui appelle definirPause) : ici, elle suppose que vitest
 * tourne avec NODE_ENV à « test ».
 */
const parDefaut: Pause = process.env.NODE_ENV === "test" ? () => Promise.resolve() : dormir;
let pauseCourante = parDefaut;

/** La pause avant un nouvel essai : la chaîne après une tâche en échec, la voix après une erreur passagère. */
export const pause: Pause = (ms) => pauseCourante(ms);

/** Pour les tests : une autre pause (null : celle par défaut). */
export function definirPause(p: Pause | null) {
  pauseCourante = p ?? parDefaut;
}
