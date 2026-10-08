import "server-only";

/** Le jour à Paris (AAAA-MM-JJ), et le même jour à minuit UTC : la date du jour que reçoit le modèle. */
export function aujourdhuiParis(maintenant = new Date()): { iso: string; t: number } {
  const iso = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  return { iso, t: Date.parse(`${iso}T00:00:00Z`) };
}

/** Un moment dit comme dans Messages, à l’heure de Paris : « aujourd’hui », « hier », « lun. » dans la semaine, puis « 12 mars ». */
export function jourRelatif(quand: Date, maintenant = new Date()): string {
  const ecart = Math.round((aujourdhuiParis(maintenant).t - aujourdhuiParis(quand).t) / 86400e3);
  if (ecart <= 0) return "aujourd’hui";
  if (ecart === 1) return "hier";
  const format = ecart < 7 ? ({ weekday: "short" } as const) : ({ day: "numeric", month: "short" } as const);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...format }).format(quand);
}
