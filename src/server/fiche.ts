import type { FicheFact } from "@/types";
import { SUPPRIMEES_MAX, type DonneesMemoire } from "./stockage/types";

/*
 * La fiche corrigée à la main (PUT /api/fiche), fusionnée dans la mémoire : une règle pure, sans la base. La route
 * l’applique sur la mémoire qu’elle a lue (modifierMemoire, src/server/depot.ts) ; tests/unit/fiche-faits.test.ts la
 * vérifie en table.
 */

/** Un fait de la fiche tel que l’écran le renvoie : sa section et son texte. */
export type FaitCorrige = Pick<FicheFact, "section" | "text">;

/**
 * La mémoire avec la fiche corrigée (la liste entière des faits, dans l’ordre de l’écran), ou null : pas encore de fiche.
 * - Un fait déjà là (même texte, même section) garde ses preuves et son statut ; un nouveau est gardé, sans preuve.
 * - Ce qu’il ajoute fait foi pour la mémoire (`parToi`), tant qu’il reste sur la fiche.
 * - Ce qu’il supprime, la mémoire ne le remet pas (`supprimees`, les SUPPRIMEES_MAX derniers), sauf s’il le réécrit.
 */
export function fusionnerFaits(m: DonneesMemoire, faits: FaitCorrige[]): DonneesMemoire | null {
  const fiche = m.etat.fiche;
  if (!fiche) return null;
  const avant = fiche.faits;
  const nouveaux = faits.map((f) => avant.find((a) => a.texte === f.text && a.section === f.section) ?? { section: f.section, texte: f.text, preuves: [], statut: "garde" as const });
  const textesAvant = new Set(avant.map((a) => a.texte));
  const textes = new Set(nouveaux.map((n) => n.texte));
  const editions = {
    parToi: [...new Set([...(m.editions?.parToi ?? []).filter((t) => textes.has(t)), ...nouveaux.filter((n) => !textesAvant.has(n.texte)).map((n) => n.texte)])],
    supprimees: [...new Set([...(m.editions?.supprimees ?? []), ...avant.filter((a) => !textes.has(a.texte)).map((a) => a.texte)])].filter((t) => !textes.has(t)).slice(-SUPPRIMEES_MAX),
  };
  return { ...m, etat: { ...m.etat, fiche: { ...fiche, faits: nouveaux } }, editions };
}
