import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, imagesDe, LectureRefusee, lecturePermise, lireLot } from "@/server/captures";
import { erreur, repondre, route } from "@/server/http";
import { envoiDe } from "@/server/imports";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { attendreLePremier, empreinteDuLot, envoiArrete, ErreurLot, premierLot, unSeulLot } from "@/server/lots";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { lecturePayeeRefusee, tournageDuNavigateur } from "@/server/tournage";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { avecEcheance, echeancePour } from "@/server/echeance";
import { aujourdhuiParis } from "@/server/temps";

/* Un lot de six à douze images (ECRANS_PAR_LOT) : une demi-minute de lecture, une minute et demie au pire */
export const maxDuration = 180;

/** Le lot d’un enregistrement en mode tournage : vide, sans appel au modèle (POST /api/captures/video n’en lit rien). */
const LOT_DU_TOURNAGE = { appli: null, autre: null, captures: [], blocs: [], profil: [], doutes: [] };

/**
 * Un lot d’images tirées d’un enregistrement d’écran (dans le navigateur) : BLUSH les lit (prompt 01) et rend
 * sa lecture brute. Les images ne sont gardées nulle part. Les lots sont ensuite rassemblés (/api/captures/video).
 * Jamais payé deux fois (src/server/lots.ts) : un lot déjà lu (ses images, son appli, le jour), ici ou sur une autre
 * instance, revient sans rappeler le modèle ni compter les plafonds de lecture. `cle` : celle de l’envoi (la même pour
 * tous ses lots, et pour leur fin), dont l’empreinte range le coût de chaque lot (src/server/imports.ts) ; `ordre` :
 * « premier » pour le lot qui part d’abord, « suite » pour ceux qui attendent que sa réponse commence. Un envoi
 * abandonné par le navigateur (pour de bon, ou sa page fermée avant que le lot appelle le modèle) : 409 `abandon`.
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
   * Le modèle va lire : la limite de l’adresse IP d’abord, une fois l’envoi vérifié (un envoi invalide ne compte pas : il
   * ne coûte rien, et un voisin derrière la même IP n’y perd rien)
   */
  if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
  /* Le mode tournage (src/server/tournage.ts) : rien n’est lu, la fin de l’enregistrement reprend la conv de tournage */
  if (await tournageDuNavigateur()) return repondre("POST /api/captures/lot", { lot: LOT_DU_TOURNAGE });
  /* Son lien arrêté (ou une créatrice sans son lien) : le modèle ne lit rien, qu’elle rouvre le nouveau */
  if (await lecturePayeeRefusee(await utilisateurDeSession(await lireSession()))) return erreur("tournage");
  const app = appli.success ? appli.data : "autre";
  const envoi = envoiDe(cleEnvoi(fd?.get("cle")));
  const ordre = fd?.get("ordre");
  /* Le premier lot de l’envoi dit aux autres quand sa réponse commence, ou qu’il a fini (lu, retrouvé, refusé, en échec) */
  const commence = ordre === "premier" && envoi ? premierLot(envoi) : null;
  try {
    const empreinte = empreinteDuLot(images, app, aujourdhuiParis().iso);
    const lot = await unSeulLot(empreinte, envoi, async ({ signal, surAvance, partir }) => {
      if (ordre === "suite" && envoi) await attendreLePremier(envoi, signal);
      if (envoi && (signal.aborted || (await envoiArrete(envoi)))) throw new ErreurLot("abandon");
      /* Le modèle va lire pour de bon : les plafonds de lecture (bêta, compte, sans compte), une fois par lot lu */
      const permis = await lecturePermise("lots");
      if (permis !== "ok") throw new LectureRefusee(permis);
      /* Dès ici, son entrée se paie : la page fermée ne l’arrête plus (le nouvel essai de la page rechargée le retrouvera) */
      partir();
      if (signal.aborted) throw new ErreurLot("abandon");
      return lireLot(images, app, "captures_video", { envoi, lot: empreinte, signal, ...(surAvance ? { surAvance } : {}), ...(commence ? { auDebut: commence } : {}) });
    });
    return repondre("POST /api/captures/lot", { lot });
  } finally {
    commence?.();
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export const POST = route("POST /api/captures/lot", async (req: Request) => {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
});
