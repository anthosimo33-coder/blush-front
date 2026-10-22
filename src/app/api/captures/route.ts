import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, imagesDe, LectureRefusee, lectureDeLAjout, lecturePermise, lireCaptures, uneSeuleLecture, unSeulAjout } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { lireBrouillon, poserBrouillon } from "@/server/cookies";
import { erreur, repondre, route } from "@/server/http";
import { storyEtSource } from "@/server/conv-affichee";
import { ajouterDesCaptures, importerCaptures, morceauDejaAjoute } from "@/server/histoires";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { brouillonDeTournage, lecturePayeeRefusee, tournageDuNavigateur } from "@/server/tournage";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { avecEcheance, echeancePour } from "@/server/echeance";
import { noterAuFil } from "@/server/visites";

/* La lecture de 20 captures prend jusqu’à une minute */
export const maxDuration = 180;

const Appli = AppliCaptures;

/**
 * Des captures d’écran de la conv (réduites par le navigateur) : BLUSH les lit (prompt 01) et en fait une histoire
 * brouillon, avant l’email, comme un export. Un nouvel essai du même envoi (`cle`, après une coupure du réseau) rend
 * la lecture déjà faite (src/server/captures.ts, uneSeuleLecture). Sans la case de l’import cochée : 422 `consentement`
 * (src/server/juridique.ts). La lecture refusée (LectureRefusee), rien de lisible
 * (ErreurCaptures), un import refusé : leur code ; le modèle : refus ou panne (l’enveloppe `route`, src/server/http.ts).
 * `mode=add` : un morceau de plus pour la conv qu’on importe (src/server/morceaux.ts), lu puis ajouté à son brouillon,
 * une seule fois par envoi (unSeulAjout). Sans brouillon où l’ajouter (ni en mode tournage) : 404 `aucune` ; des
 * captures avec quelqu’un d’autre : 422 `autre_conv` ; rien de nouveau : 422 `rien_de_neuf` ; un morceau de trop : 422
 * `morceaux`. `forcer=1` (« Ajouter quand même », le même envoi) : ajoutées même avec quelqu’un d’autre, sans les relire
 * si cette instance garde leur lecture (lectureDeLAjout).
 */
async function traiter(req: Request) {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = Appli.safeParse(fd?.get("app"));
  const app = appli.success ? appli.data : "autre";
  /* Un morceau de plus : le brouillon où l’ajouter, d’abord (rien n’est lu sans lui) */
  const ajout = fd?.get("mode") === "add";
  const brouillon = ajout ? await lireBrouillon() : null;
  if (ajout && !brouillon) return erreur("aucune");
  const images = await imagesDe(fichiers);
  /* L’accord de l’import (les conditions, et que BLUSH lise toute la conv) : sans lui, rien n’est lu ni compté */
  const consentement = consentementImport(fd?.get("consentement"));
  if (!consentement) return erreur("consentement");
  /*
   * Une fois l’envoi vérifié, avant toute limite : la bêta (sans compte, « connexion »), puis le laissez-passer du CAPTCHA
   * d’un visiteur sans compte (src/server/captcha.ts). Un nouvel essai du même envoi en use un second, le dernier
   */
  const beta = await lecturePermise(null);
  if (beta !== "ok") return erreur(beta);
  const captcha = await humainRefuse("brouillon");
  if (captcha) return captcha;
  /* La limite de l’adresse IP, une fois l’envoi vérifié : un envoi invalide ne compte pas */
  if (!(await sousLaLimiteDeLIp(req, "import", LIMITES.importParIp))) return erreur("trop");
  /* Le mode tournage (src/server/tournage.ts) : rien n’est lu, le brouillon reprend la conv de tournage, sans compter d’import */
  const tournage = await tournageDuNavigateur();
  /* Son lien arrêté (ou une créatrice sans son lien) : le modèle ne lit rien, qu’elle rouvre le nouveau */
  if (!tournage && (await lecturePayeeRefusee(await utilisateurDeSession(await lireSession())))) return erreur("tournage");
  const cle = cleEnvoi(fd?.get("cle"));
  if (brouillon) {
    /* Pas de morceau en mode tournage : sa conv n’est pas lue, rien à réunir */
    if (tournage) return erreur("aucune");
    const lu = await unSeulAjout(
      cle,
      brouillon,
      async () => {
        const t = await lectureDeLAjout(cle, brouillon, async () => {
          const permis = await lecturePermise("captures");
          if (permis !== "ok") throw new LectureRefusee(permis);
          return lireCaptures(images, app);
        });
        const forcer = fd?.get("forcer") === "1";
        return { ...(await ajouterDesCaptures(brouillon, { appli: app, t, cle, forcer })), secret: brouillon, messages: t.messages };
      },
      () => (cle ? morceauDejaAjoute(brouillon, cle) : Promise.resolve(null)),
    );
    const { story, source } = storyEtSource(lu.id, lu.meta);
    return repondre("POST /api/captures", { source, messagesRead: lu.messages, story });
  }
  const lu = await uneSeuleLecture(cle, async (secret) => {
    if (tournage) return brouillonDeTournage(tournage, { appli: app, captures: images.length, secret, consentement });
    /* Le modèle va lire : la bêta et les plafonds d’abord (après la vérification de l’envoi, qu’un envoi invalide ne compte pas) */
    const permis = await lecturePermise("captures");
    if (permis !== "ok") throw new LectureRefusee(permis);
    const t = await lireCaptures(images, app);
    const { id, meta } = await importerCaptures({ appli: app, t, secret, consentement });
    /* Ici, une fois par lecture : un nouvel essai qui la reprend ne compte pas l’import deux fois */
    await compterImportVenuDuPartage();
    await noterAuFil(req, { genre: "import" });
    return { id, meta, secret, messages: t.messages };
  });
  await poserBrouillon(lu.secret);
  const { story, source } = storyEtSource(lu.id, lu.meta);
  return repondre("POST /api/captures", { source, messagesRead: lu.messages, story });
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export const POST = route("POST /api/captures", async (req: Request) => {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
});
