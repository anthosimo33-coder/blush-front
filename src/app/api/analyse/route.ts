import { after } from "next/server";
import { z } from "zod";
import { executerChaine } from "@/server/analyse";
import { effacerBrouillon, lireBrouillon, poserChoisie } from "@/server/cookies";
import { contexteRequete, progression, relancer } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { definirQui, metaDe, quiRempli, rattacherBrouillon } from "@/server/histoires";
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
 * Avec les réponses de « Qui es-tu ? » (depuis /qui, ou le code reçu par email), c’est la conv en train d’être importée :
 * déjà connecté, elle rejoint ici le compte, et devient la conv ouverte. Sans (l’écran de lecture), c’est la conv qu’on
 * suit : un brouillon laissé en plan ne prend pas sa place.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const qui = Qui.safeParse(await corps(req));
  const { utilisateur, story } = await contexteRequete(qui.success);
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  /* Une relance (l’écran de lecture, un autre onglet) : « Qui es-tu ? » est déjà en base. Pas rempli : /qui d’abord */
  if (!qui.success && !quiRempli(metaDe(story))) return erreur("qui", 422);
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  if (!verdict || verdict.status === "echec") {
    /* Chaque lecture coûte : un nombre de nouvelles convs par jour et par compte, et quelques relances après un échec */
    if (!verdict && !(await sousLaLimite(`analyse:${utilisateur.id}`, LIMITES.analyseParCompte))) return erreur("trop", 429);
    if (verdict && !(await sousLaLimite(`relance:verdict:${utilisateur.id}`, LIMITES.relanceParCompte))) return erreur("trop", 429);
    if (!story.userId) {
      await rattacherBrouillon(utilisateur, await lireBrouillon());
      await effacerBrouillon();
    }
    await poserChoisie(story.id);
    if (qui.success) await definirQui(story.id, { moi: qui.data.me === "p0" ? 0 : 1, pronom: qui.data.pronom, devinette: qui.data.guess, objectif: qui.data.goal, ...(qui.data.prenom ? { prenom: qui.data.prenom } : {}) });
    await planifier(story.id, "verdict");
  }
  after(() => executerChaine(story.id));
  return json({ ok: true });
}

/** La progression de la lecture. Relance au passage une tâche abandonnée. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  await relancer(story.id);
  return json(await progression(story));
}
