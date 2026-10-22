import { ecrireLeContexte } from "@/server/analyse";
import { rapportOuvertEnBase } from "@/server/droits";
import { lancerApresPaiement, relancerApres } from "@/server/pipeline";
import { effacerBrouillon, lireBrouillon, poserChoisie } from "@/server/cookies";
import { progression, relancer } from "@/server/donnees";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { definirQui, metaDe, quiRempli, rattacherBrouillon, tropCourte } from "@/server/histoires";
import { LIMITES } from "@/server/limites";
import { garde, lecture, rendreAuCompte, sousLaLimiteDeLIp, sousLaLimiteDuCompte } from "@/server/requete";
import { attendreLePaiement, etatDesTaches, planifier } from "@/server/taches";
import { lecturePayeeRefusee, rejouer, tournageDe, tournageDuNavigateur } from "@/server/tournage";
import { ROUTES } from "@/types/api";

/* Le verdict (le rapport ouvert : payé, ou l’équipe), puis le rapport et la mémoire s’enchaînent après la réponse */
export const maxDuration = 800;

/**
 * Lance la lecture : « Qui es-tu ? » est rempli. Le paywall passe avant toute lecture (décidé le 16 octobre) : sans le
 * rapport ouvert (payé, ou un compte de l’équipe), le verdict attend son paiement, et rien ne part au modèle ; le code
 * calcule seulement ce qu’il sait (les trouvailles), que la lecture et le paywall montrent. Le rapport ouvert, le verdict
 * part. Relancer ne refait rien de ce qui est fait.
 * Avec les réponses de « Qui es-tu ? » (depuis /qui, ou le code reçu par email), c’est la conv en train d’être importée :
 * déjà connecté, elle rejoint ici le compte, et devient la conv ouverte. Sans (l’écran de lecture), c’est la conv qu’on
 * suit : un brouillon laissé en plan ne prend pas sa place. Une conv encore trop courte (tropCourte, un premier morceau
 * gardé pour qu’on lui ajoute le début) ne part pas : 422 `courte`.
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
     * Le mode tournage (src/server/tournage.ts), pour une nouvelle lecture : la conv de tournage de son brouillon (des
     * captures importées en mode tournage), sinon celle du lien ouvert sur ce navigateur (un export importé comme
     * d’habitude). Sa lecture déjà faite sera recopiée : rien ne part au modèle, rien ne compte dans les lectures du jour
     */
    const tournage = verdict ? null : story.tournageId ? await tournageDe(story.tournageId) : await tournageDuNavigateur();
    /* Rien à lire : un brouillon de tournage dont la conv de tournage a été effacée depuis n’a pas de conv brute */
    if (!tournage && !verdict && !story.aConv) return erreur("aucune");
    /* Une conv encore trop courte (un premier morceau, qui attend le début) : rien ne part tant qu’on n’en a pas ajouté */
    if (!tournage && !verdict && tropCourte(metaDe(story))) return erreur("courte");
    /* Le lien de tournage arrêté (ou une créatrice sans son lien) : jamais une vraie lecture, qu’elle rouvre le nouveau */
    if (!tournage && !verdict && (await lecturePayeeRefusee(utilisateur))) return erreur("tournage");
    if (tournage) {
      if (!(await sousLaLimiteDuCompte(utilisateur, "tournage"))) return erreur("trop");
    } else {
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
    }
    if (!story.userId) {
      await rattacherBrouillon(utilisateur, await lireBrouillon());
      await effacerBrouillon();
    }
    await poserChoisie(story.id);
    if (qui)
      await definirQui(story.id, {
        moi: qui.me === "p0" ? 0 : 1,
        pronom: qui.pronom,
        devinette: qui.guess,
        objectif: qui.goal,
        ...(qui.prenom ? { prenom: qui.prenom } : {}),
        ...(qui.prenomAutre ? { prenomAutre: qui.prenomAutre } : {}),
      });
    /* Une prise : sa lecture recopiée (avec son prénom, que « Qui es-tu ? » vient d’écrire), que l’écran de lecture rejoue */
    if (tournage) {
      await rejouer(story.id, tournage, utilisateur);
      return repondre("POST /api/analyse", { ok: true });
    }
    /* Le rapport ouvert se lit en base, après le rattachement : un brouillon n’avait pas encore de compte */
    if (!(await rapportOuvertEnBase(story.id))) {
      await ecrireLeContexte(story.id);
      await attendreLePaiement(story.id, "verdict");
      return repondre("POST /api/analyse", { ok: true });
    }
    await planifier(story.id, "verdict");
  } else if (verdict.status === "paiement") await lancerApresPaiement(story, verdict.status);
  relancerApres(story.id);
  return repondre("POST /api/analyse", { ok: true });
});

/** La progression de la lecture. Relance au passage une tâche abandonnée, et le verdict d’un paiement que le webhook n’a pas encore lancé. */
export const GET = route("GET /api/analyse", async () => {
  const g = await lecture({ session: "requise", histoire: true });
  if (g instanceof Response) return g;
  await lancerApresPaiement(g.story);
  await relancer(g.story.id);
  return repondre("GET /api/analyse", await progression(g.story));
});
