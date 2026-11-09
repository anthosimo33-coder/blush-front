/* Les jours du calendrier de Paris, pour le serveur (src/server/temps.ts, la purge) comme pour les écrans (/admin) */

const JOUR_ISO = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le jour de Paris d’un instant (AAAA-MM-JJ). */
export const jourDeParis = (maintenant = new Date()) => JOUR_ISO.format(maintenant);

/** Le fuseau du navigateur (« America/Martinique »), ou rien : envoyé avec des captures ou un export, pour dater « Aujourd’hui » et les heures d’Instagram. */
export function fuseauDuNavigateur(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Un fuseau reçu, s’il est connu d’Intl ; sinon Paris, le public de BLUSH. */
export function fuseauSur(fuseau: unknown): string {
  if (typeof fuseau !== "string" || !fuseau || fuseau.length > 64) return "Europe/Paris";
  try {
    new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau });
    return fuseau;
  } catch {
    return "Europe/Paris";
  }
}

/** Le jour d’un instant (AAAA-MM-JJ) dans un fuseau (fuseauSur) : celui du téléphone de l’utilisateur. */
export const jourDans = (fuseau: string, maintenant = new Date()) =>
  fuseau === "Europe/Paris"
    ? jourDeParis(maintenant)
    : new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);

/**
 * Le jour de Paris `jours` jours avant celui de `maintenant` (AAAA-MM-JJ) : la veille par défaut, le lendemain à -1.
 * Compté sur le calendrier (son minuit UTC, moins des jours UTC, qui font tous 24 h), jamais par « il y a 24 h » : le
 * jour du passage à l’heure d’hiver dure 25 h (entre 23 h et minuit, il y a 24 h, c’était encore aujourd’hui), celui de
 * l’heure d’été 23 h (le lendemain, entre minuit et 1 h, il y a 24 h, c’était l’avant-veille).
 */
export function jourDeParisAvant(jours = 1, maintenant = new Date()): string {
  return new Date(Date.parse(`${jourDeParis(maintenant)}T00:00:00Z`) - jours * 86400e3).toISOString().slice(0, 10);
}

/** Une période choisie au calendrier : des jours de Paris entiers, du premier au dernier compris (AAAA-MM-JJ). */
export type Plage = { du: string; au: string };

const JOUR_MS = 86400e3;
const minuitUTC = (jour: string) => Date.parse(`${jour}T00:00:00Z`);

/** Le jour `n` jours après `jour` (avant, si `n` est négatif), compté sur le calendrier. */
export const plusJours = (jour: string, n: number) => new Date(minuitUTC(jour) + n * JOUR_MS).toISOString().slice(0, 10);
/** Le nombre de jours d’une période, les deux bouts compris. */
export const joursDeLaPlage = ({ du, au }: Plage) => Math.round((minuitUTC(au) - minuitUTC(du)) / JOUR_MS) + 1;
/** La période d’avant, de même durée : celle contre laquelle se lisent les écarts. */
export const plageDAvant = (plage: Plage): Plage => ({ du: plusJours(plage.du, -joursDeLaPlage(plage)), au: plusJours(plage.du, -1) });

/** Un vrai jour du calendrier, écrit AAAA-MM-JJ (le 30 février n’en est pas un). */
export function estUnJour(jour: unknown): jour is string {
  if (typeof jour !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  const t = minuitUTC(jour);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === jour;
}

/**
 * Une période lue dans une adresse (`?du=&au=`) ou un argument : deux vrais jours, dans l’ordre, pas avant `premier` ni
 * après `dernier` (aujourd’hui à Paris). Sinon rien : l’appelant garde sa période d’office.
 */
export function plageLue(du: unknown, au: unknown, { premier, dernier }: { premier: string; dernier: string }): Plage | null {
  if (!estUnJour(du) || !estUnJour(au)) return null;
  if (du > au || du < premier || au > dernier) return null;
  return { du, au };
}

/**
 * Le repère d’une période choisie parmi les trois d’office (1, 7 ou 30 jours), pour ce qui ne dépend que de son ordre de
 * grandeur : où lire la marge quand les ventes manquent, l’activité jour par jour de l’écran d’avant.
 */
export const repereDe = (plage: Plage): 1 | 7 | 30 => {
  const jours = joursDeLaPlage(plage);
  return jours === 1 ? 1 : jours <= 13 ? 7 : 30;
};
