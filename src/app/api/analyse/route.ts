import { after } from "next/server";
import { z } from "zod";
import { executerChaine } from "@/server/analyse";
import { effacerBrouillon, lireBrouillon, poserChoisie } from "@/server/cookies";
import { contexteRequete, progression, relancer } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { definirQui, rattacherBrouillon } from "@/server/histoires";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { etatDesTaches, planifier } from "@/server/taches";

/* Le verdict, puis (avec l’accès) le rapport et la mémoire s’enchaînent après la réponse */
export const maxDuration = 300;

const Qui = z.object({
  me: z.enum(["p0", "p1"]),
  pronom: z.enum(["il", "elle"]),
  guess: z.enum(["parle", "vus", "flou", "ensemble"]),
  goal: z.enum(["ensemble", "reciproque", "comprendre", "mieux", "point"]),
  /** Des captures : son prénom (il n’y est que « Moi ») */
  prenom: z.string().trim().min(1).max(40).optional(),
});

/**
 * Lance la lecture : « Qui es-tu ? » est rempli, le verdict part. Relancer ne refait rien de ce qui est fait.
 * Une nouvelle conv importée en étant déjà connecté rejoint ici le compte, et devient la conv ouverte.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete(true);
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const qui = Qui.safeParse(await corps(req));
  if (!qui.success) return erreur("qui", 422);
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  if (!verdict || verdict.status === "echec") {
    /* Chaque lecture coûte : un nombre de nouvelles convs par jour et par compte */
    if (!verdict && !(await sousLaLimite(`analyse:${utilisateur.id}`, LIMITES.analyseParCompte))) return erreur("trop", 429);
    if (!story.userId) {
      await rattacherBrouillon(utilisateur, await lireBrouillon());
      await effacerBrouillon();
    }
    await poserChoisie(story.id);
    await definirQui(story.id, { moi: qui.data.me === "p0" ? 0 : 1, pronom: qui.data.pronom, devinette: qui.data.guess, objectif: qui.data.goal, ...(qui.data.prenom ? { prenom: qui.data.prenom } : {}) });
    await planifier(story.id, "verdict");
  }
  after(() => executerChaine(story.id));
  return json({ jobId: story.id });
}

/** La progression de la lecture. Relance au passage une tâche abandonnée. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  await relancer(story.id);
  return json(await progression(story));
}
