import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { contexteRequete, ETAPES_DU_RAPPORT, rapportDe, relancer } from "@/server/donnees";
import { erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { reprendre } from "@/server/taches";

export const maxDuration = 300;

/** Le rapport (ou le verdict seul, sans accès). `generating` : il s’écrit encore ; le front repasse dans quelques secondes. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  await relancer(story.id);
  const rapport = await rapportDe(story, utilisateur);
  return rapport ? json(rapport) : erreur("pas_pret", 409);
}

/** « Relancer l’écriture » : l’écriture a échoué (une panne, pas un refus du modèle). Chaque essai coûte : quelques-uns par jour. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const avant = await rapportDe(story, utilisateur);
  if (!avant) return erreur("pas_pret", 409);
  if (avant.echec !== "panne") return json(avant);
  if (!(await sousLaLimite(`relance:${utilisateur.id}`, LIMITES.relanceParCompte))) return erreur("trop", 429);
  await reprendre(story.id, [...ETAPES_DU_RAPPORT]);
  after(() => executerChaine(story.id));
  const rapport = await rapportDe(story, utilisateur);
  return rapport ? json(rapport) : erreur("pas_pret", 409);
}
