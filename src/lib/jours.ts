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
