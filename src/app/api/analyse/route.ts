import { relancerApres } from "@/server/pipeline";
import { effacerBrouillon, lireBrouillon, poserChoisie } from "@/server/cookies";
import { progression, relancer } from "@/server/donnees";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { definirQui, metaDe, quiRempli, rattacherBrouillon } from "@/server/histoires";
import { LIMITES } from "@/server/limites";
import { garde, lecture, rendreAuCompte, sousLaLimiteDeLIp, sousLaLimiteDuCompte } from "@/server/requete";
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
export const POST = route("POST /api/analyse", async (req: Request) => {
  /* L’origine d’abord, comme partout : une requête venue d’un autre site n’est même pas lue */
  const origine = await garde(req, { session: "aucune" });
  if (origine instanceof Response) return origine;
  /*
   * Le corps de sa ligne : « Qui es-tu ? » rempli (il a `me`), ou `{}`, une relance depuis l’écran de lecture. Un corps
   * qui n’est ni l’un ni l’autre (null) est pris pour une relance aussi, comme avant : y répondre « qui » serait une
   * autre décision. Lu avant la session : il dit quelle conv suivre (celle du parcours, ou celle qu’on lit)
   */
  const lu = await lireCorps(req, ROUTES["POST /api/analyse"].corps);
  const qui = lu && "me" in lu ? lu : null;
  const g = await lecture({ session: "requise", histoire: true, parcours: !!qui });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  /* Une relance (l’écran de lecture, un autre onglet) : « Qui es-tu ? » est déjà en base. Pas rempli : /qui d’abord */
  if (!qui && !quiRempli(metaDe(story))) return erreur("qui");
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  if (!verdict || verdict.status === "echec") {
    /*
     * Chaque lecture coûte : un nombre de nouvelles convs par jour, par compte (son email canonique : un alias ou un
     * compte recréé ne repart pas de zéro) et par adresse IP (des comptes ouverts à la chaîne d’une même box), et
     * quelques relances après un échec. Refusée par l’adresse IP, la lecture du compte lui est rendue : rien n’est parti,
     * et derrière un réseau partagé, réessayer ne doit pas user ses lectures du jour
     */
    if (!verdict && !(await sousLaLimiteDuCompte(utilisateur, "analyse"))) return erreur("trop");
    if (!verdict && !(await sousLaLimiteDeLIp(req, "analyse", LIMITES.analyseParIp))) {
      await rendreAuCompte(utilisateur, "analyse");
      return erreur("trop");
    }
    if (verdict && !(await sousLaLimiteDuCompte(utilisateur, "relance:verdict"))) return erreur("trop");
    if (!story.userId) {
      await rattacherBrouillon(utilisateur, await lireBrouillon());
      await effacerBrouillon();
    }
    await poserChoisie(story.id);
    if (qui)
      await definirQui(story.id, { moi: qui.me === "p0" ? 0 : 1, pronom: qui.pronom, devinette: qui.guess, objectif: qui.goal, ...(qui.prenom ? { prenom: qui.prenom } : {}) });
    await planifier(story.id, "verdict");
  }
  relancerApres(story.id);
  return repondre("POST /api/analyse", { ok: true });
});

/** La progression de la lecture. Relance au passage une tâche abandonnée. */
export const GET = route("GET /api/analyse", async () => {
  const g = await lecture({ session: "requise", histoire: true });
  if (g instanceof Response) return g;
  await relancer(g.story.id);
  return repondre("GET /api/analyse", await progression(g.story));
});
