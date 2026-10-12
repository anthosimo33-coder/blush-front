import type { Echec } from "@/types";
import type { EcritureRapport, ReportPayload } from "@/types/api";

/**
 * Où en est le rapport, en une seule valeur (le rapport sobre mis à part : SoberReport) :
 * - `lecture` : l’aperçu, le rapport pas débloqué ; les chapitres fermés mènent au paiement.
 * - `ecriture` : le rapport débloqué, BLUSH écrit la suite (`ecriture` : où il en est, quand le serveur le sait).
 * - `echec` : l’écriture a échoué pour de bon ; une panne se relance, un refus du modèle non.
 * - `souffle` : le budget de l’IA du jour est atteint ; l’écriture reprend d’elle-même après minuit.
 * - `complet` : le rapport débloqué et écrit ; la suite passe par le chat et « Ta question ».
 */
export type PhaseDuRapport =
  { nom: "lecture" } | { nom: "ecriture"; ecriture?: EcritureRapport } | { nom: "echec"; raison: Exclude<Echec, "souffle"> } | { nom: "souffle" } | { nom: "complet" };

/**
 * La phase d’un rapport, d’après ce que répond GET /api/rapport. Le serveur n’envoie jamais `generating` avec `echec`
 * (src/server/presentation/rapport.ts) ; l’échec, définitif, passerait avant. `generating` sans le rapport débloqué
 * n’arrive qu’au mode sobre pas encore écrit : la phase reste `ecriture`, et ce qui dépend du déblocage le lit à part
 * (`debloque`).
 */
export function phaseDuRapport({ debloque, generating, ecriture, echec }: Pick<ReportPayload, "debloque" | "generating" | "ecriture" | "echec">): PhaseDuRapport {
  if (echec === "souffle") return { nom: "souffle" };
  if (echec) return { nom: "echec", raison: echec };
  if (generating) return ecriture ? { nom: "ecriture", ecriture } : { nom: "ecriture" };
  return debloque ? { nom: "complet" } : { nom: "lecture" };
}

/**
 * L’écriture a été lancée et n’a pas abouti (elle s’écrit, a échoué, ou attend le budget du lendemain) : les chapitres
 * fermés disent où elle en est au lieu de mener au paiement, et ni le chat ni « Ta question » ne sont encore prêts.
 */
export const ecritureInachevee = (phase: PhaseDuRapport) => phase.nom === "ecriture" || phase.nom === "echec" || phase.nom === "souffle";
