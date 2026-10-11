import { after } from "next/server";
import { executerChaine } from "@/server/pipeline";
import { ETAPES_DU_RAPPORT, ouvrirLeRapport, rapportDe, relancer } from "@/server/donnees";
import { erreur, repondre } from "@/server/http";
import { garde, lecture, sousLaLimiteDuCompte } from "@/server/requete";
import { reprendre } from "@/server/taches";

export const maxDuration = 300;

/**
 * Le rapport (ou le verdict seul, sans accès). `generating` : il s’écrit encore ; le front repasse dans quelques secondes.
 * Ouvert (ouvrirLeRapport) : ce qui devait partir et ne l’a jamais été part maintenant (reparerLaChaine), comme à
 * l’ouverture de la page.
 */
export async function GET() {
  const g = await lecture({ session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  /* Les tâches coupées repartent pendant que le rapport se lit (pas avant) : relu toutes les 2 s pendant l’écriture */
  const [, rapport] = await Promise.all([relancer(story.id), ouvrirLeRapport(story, utilisateur)]);
  return rapport ? repondre("GET /api/rapport", rapport) : erreur("pas_pret");
}

/** « Relancer l’écriture » : l’écriture a échoué (une panne, pas un refus du modèle). Chaque essai coûte : quelques-uns par jour. */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const avant = await rapportDe(story, utilisateur);
  if (!avant) return erreur("pas_pret");
  if (avant.echec !== "panne") return repondre("POST /api/rapport", avant);
  if (!(await sousLaLimiteDuCompte(utilisateur, "relance"))) return erreur("trop");
  await reprendre(story.id, [...ETAPES_DU_RAPPORT]);
  after(() => executerChaine(story.id));
  const rapport = await rapportDe(story, utilisateur);
  return rapport ? repondre("POST /api/rapport", rapport) : erreur("pas_pret");
}
