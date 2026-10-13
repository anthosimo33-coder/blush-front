import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, imagesDe, LectureRefusee, lecturePermise, lireCaptures, uneSeuleLecture } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, repondre, route } from "@/server/http";
import { storyEtSource } from "@/server/conv-affichee";
import { importerCaptures } from "@/server/histoires";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { avecEcheance, echeancePour } from "@/server/echeance";

/* La lecture de 20 captures prend jusqu’à une minute */
export const maxDuration = 180;

const Appli = AppliCaptures;

/**
 * Des captures d’écran de la conv (réduites par le navigateur) : BLUSH les lit (prompt 01) et en fait une histoire
 * brouillon, avant l’email, comme un export. Un nouvel essai du même envoi (`cle`, après une coupure du réseau) rend
 * la lecture déjà faite (src/server/captures.ts, uneSeuleLecture). Sans la case de l’import cochée : 422 `consentement`
 * (src/server/juridique.ts). La lecture refusée (LectureRefusee), rien de lisible
 * (ErreurCaptures), un import refusé : leur code ; le modèle : refus ou panne (l’enveloppe `route`, src/server/http.ts).
 */
async function traiter(req: Request) {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = Appli.safeParse(fd?.get("app"));
  if (fd?.get("mode") === "add") return erreur("capture");
  const app = appli.success ? appli.data : "autre";
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
  const lu = await uneSeuleLecture(cleEnvoi(fd?.get("cle")), async (secret) => {
    /* Le modèle va lire : la bêta et les plafonds d’abord (après la vérification de l’envoi, qu’un envoi invalide ne compte pas) */
    const permis = await lecturePermise("captures");
    if (permis !== "ok") throw new LectureRefusee(permis);
    const t = await lireCaptures(images, app);
    const { id, meta } = await importerCaptures({ appli: app, t, secret, consentement });
    /* Ici, une fois par lecture : un nouvel essai qui la reprend ne compte pas l’import deux fois */
    await compterImportVenuDuPartage();
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
