import "server-only";

/** Le jour à Paris (AAAA-MM-JJ), et le même jour à minuit UTC : la date du jour que reçoit le modèle. */
export function aujourdhuiParis(maintenant = new Date()): { iso: string; t: number } {
  const iso = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  return { iso, t: Date.parse(`${iso}T00:00:00Z`) };
}
