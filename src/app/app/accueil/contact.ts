import type { Fiche, Report } from "@/types";

/** Ce que l’accueil montre de votre histoire : elle comme un contact, le verdict, où vous en êtes, ton prochain pas. */
export type HomeContact = {
  report: Pick<Report, "verdict" | "level" | "trend" | "nextStep">;
  fiche: Pick<Fiche, "person" | "summaryShort">;
  period: string;
  /** Où mène sa fiche (l’aperçu a la sienne). */
  ficheHref?: string;
};
