import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { imagesDe, lecturePermise, lireLot } from "@/server/captures";
import { erreur, repondre, route } from "@/server/http";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { lecturePayeeRefusee, tournageDuNavigateur } from "@/server/tournage";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { avecEcheance, echeancePour } from "@/server/echeance";

/* Un lot de six à douze images (ECRANS_PAR_LOT) : une demi-minute de lecture, une minute et demie au pire */
export const maxDuration = 180;

/** Le lot d’un enregistrement en mode tournage : vide, sans appel au modèle (POST /api/captures/video n’en lit rien). */
const LOT_DU_TOURNAGE = { appli: null, autre: null, captures: [], blocs: [], profil: [], doutes: [] };

/**
 * Un lot d’images tirées d’un enregistrement d’écran (dans le navigateur) : BLUSH les lit (prompt 01) et rend
 * sa lecture brute. Les images ne sont gardées nulle part. Les lots sont ensuite rassemblés (/api/captures/video).
 */
async function traiter(req: Request) {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = AppliCaptures.safeParse(fd?.get("app"));
  const images = await imagesDe(fichiers);
  /* La conv part au modèle : l’accord de l’import d’abord (sans lui, 422 `consentement`, rien n’est lu ni compté) */
  if (!consentementImport(fd?.get("consentement"))) return erreur("consentement");
  /* Avant toute limite : la bêta (sans compte, « connexion »), puis le laissez-passer du CAPTCHA (src/server/captcha.ts) */
  const beta = await lecturePermise(null);
  if (beta !== "ok") return erreur(beta);
  const captcha = await humainRefuse("lot");
  if (captcha) return captcha;
  /*
   * Le modèle va lire : la limite de l’adresse IP, la bêta et les plafonds d’abord, une fois l’envoi vérifié (un envoi
   * invalide ne compte pas : il ne coûte rien, et un voisin derrière la même IP n’y perd rien)
   */
  if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
  /* Le mode tournage (src/server/tournage.ts) : rien n’est lu, la fin de l’enregistrement reprend la conv de tournage */
  if (await tournageDuNavigateur()) return repondre("POST /api/captures/lot", { lot: LOT_DU_TOURNAGE });
  /* Son lien arrêté (ou une créatrice sans son lien) : le modèle ne lit rien, qu’elle rouvre le nouveau */
  if (await lecturePayeeRefusee(await utilisateurDeSession(await lireSession()))) return erreur("tournage");
  const permis = await lecturePermise("lots");
  if (permis !== "ok") return erreur(permis);
  return repondre("POST /api/captures/lot", { lot: await lireLot(images, appli.success ? appli.data : "autre", "captures_video") });
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export const POST = route("POST /api/captures/lot", async (req: Request) => {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
});
