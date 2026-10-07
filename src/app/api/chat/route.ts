import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { historique, repondre } from "@/server/chat";
import { contexteRequete, memoireDe } from "@/server/donnees";
import { ErreurTache } from "@/server/erreurs";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";

/* La réponse prend 10 à 20 secondes ; la mise à jour de la mémoire tourne après */
export const maxDuration = 300;
const LONGUEUR_MAX = 4000;

/** Ce qu’il écrit à BLUSH. Réservé à BLUSH+, une fois la mémoire faite (après le rapport). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (utilisateur.plan !== "blushplus") return erreur("acces", 402);
  if (!story) return erreur("aucune", 404);
  const { texte } = await corps<{ texte: string }>(req);
  if (typeof texte !== "string" || !texte.trim() || texte.length > LONGUEUR_MAX) return erreur("texte", 422);
  if (!(await sousLaLimite(`chat:${utilisateur.id}`, LIMITES.chatParCompte))) return erreur("trop", 429);
  const memoire = await memoireDe(story.id);
  if (!memoire) return erreur("pas_pret", 409);
  try {
    const { reponse, majMemoire } = await repondre(story, memoire, texte.trim());
    if (majMemoire) after(() => executerChaine(story.id));
    return json(reponse);
  } catch (e) {
    if (e instanceof ErreurTache) return erreur(e.message, 502);
    throw e;
  }
}

/** L’historique, pour réafficher la conv avec BLUSH. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  return json(story ? await historique(story.id) : []);
}
