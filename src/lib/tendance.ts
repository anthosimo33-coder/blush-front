/*
 * La tendance du verdict (`trend`, src/types) : un texte libre du modèle (prompt 04), qui commence par une flèche
 * (« ↗ ça se réchauffe »). Seule la flèche dit le sens : les écrans le lisent ici, jamais sur le texte lui-même.
 * Sans server-only ni client-only : le jour où la liste des convs portera son sens (ConvSummary, calculé par le
 * serveur), c’est cette même fonction qui le calculera, et l’écran ne lira plus `trend`.
 */

/** Le sens d’une tendance : ça monte (↗), ça baisse (↘), ça ne bouge pas (→). */
type SensTendance = "monte" | "baisse" | "stable";

/** Le sens d’une tendance, d’après sa flèche ; null sans flèche (pas de tendance, ou un texte qui n’en a pas). */
export function sensDeTendance(trend: string): SensTendance | null {
  const fleche = trend.trimStart().charAt(0);
  return fleche === "↗" ? "monte" : fleche === "↘" ? "baisse" : fleche === "→" ? "stable" : null;
}
