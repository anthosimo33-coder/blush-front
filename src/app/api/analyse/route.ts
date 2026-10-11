import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { effacerBrouillon, lireBrouillon, poserChoisie } from "@/server/cookies";
import { contexteRequete, progression, relancer } from "@/server/donnees";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { definirQui, metaDe, quiRempli, rattacherBrouillon } from "@/server/histoires";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { etatDesTaches, planifier } from "@/server/taches";
import { ROUTES } from "@/types/api";

/* Le verdict, puis (avec l’accès) le rapport et la mémoire s’enchaînent après la réponse */
export const maxDuration = 300;

/**
 * Lance la lecture : « Qui es-tu ? » est rempli, le verdict part. Relancer ne refait rien de ce qui est fait.
 * Avec les réponses de « Qui es-tu ? » (depuis /qui, ou le code reçu par email), c’est la conv en train d’être importée :
 * déjà connecté, elle rejoint ici le compte, et devient la conv ouverte. Sans (l’écran de lecture), c’est la conv qu’on
 * suit : un brouillon laissé en plan ne prend pas sa place.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  /*
   * Le corps de sa ligne : « Qui es-tu ? » rempli (il a `me`), ou `{}`, une relance depuis l’écran de lecture. Un corps
   * qui n’est ni l’un ni l’autre (null) est pris pour une relance aussi, comme avant : y répondre « qui » serait une
   * autre décision
   */
  const lu = await lireCorps(req, ROUTES["POST /api/analyse"].corps);
  const qui = lu && "me" in lu ? lu : null;
  const { utilisateur, story } = await contexteRequete(!!qui);
  if (!utilisateur) return erreur("connexion");
  if (!story) return erreur("aucune");
  /* Une relance (l’écran de lecture, un autre onglet) : « Qui es-tu ? » est déjà en base. Pas rempli : /qui d’abord */
  if (!qui && !quiRempli(metaDe(story))) return erreur("qui");
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  if (!verdict || verdict.status === "echec") {
    /* Chaque lecture coûte : un nombre de nouvelles convs par jour et par compte, et quelques relances après un échec */
    if (!verdict && !(await sousLaLimite(`analyse:${utilisateur.id}`, LIMITES.analyseParCompte))) return erreur("trop");
    if (verdict && !(await sousLaLimite(`relance:verdict:${utilisateur.id}`, LIMITES.relanceParCompte))) return erreur("trop");
    if (!story.userId) {
      await rattacherBrouillon(utilisateur, await lireBrouillon());
      await effacerBrouillon();
    }
    await poserChoisie(story.id);
    if (qui) await definirQui(story.id, { moi: qui.me === "p0" ? 0 : 1, pronom: qui.pronom, devinette: qui.guess, objectif: qui.goal, ...(qui.prenom ? { prenom: qui.prenom } : {}) });
    await planifier(story.id, "verdict");
  }
  after(() => executerChaine(story.id));
  return repondre("POST /api/analyse", { ok: true });
}

/** La progression de la lecture. Relance au passage une tâche abandonnée. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  if (!story) return erreur("aucune");
  await relancer(story.id);
  return repondre("GET /api/analyse", await progression(story));
}
