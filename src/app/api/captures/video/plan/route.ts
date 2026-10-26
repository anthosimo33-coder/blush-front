import { utilisateurDeSession } from "@/server/auth";
import { cleEnvoi, lecturePermise } from "@/server/captures";
import { lireSession } from "@/server/cookies";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { envoiDe, noterLePlan } from "@/server/imports";
import { consentementImport } from "@/server/juridique";
import { brasDeLaVideo, planDeLecture } from "@/server/lecture-partielle";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { tournageDuNavigateur } from "@/server/tournage";
import { ROUTES } from "@/types/api";

/**
 * Avant de lire une longue vidéo (plus de lots qu’un tour de lecteurs) : en entier avant l’achat, comme avant, ou
 * d’abord sa partie la plus récente, le reste de ses écrans gardé pour après le paiement (src/server/lecture-partielle.ts :
 * le mode BLUSH_LECTURE_PARTIELLE, la moitié de l’A/B d’après `video`, son sens). Rien n’est lu ni gardé ici : une
 * question, une fois par enregistrement. Un morceau ajouté et une prise du mode tournage se lisent en entier. Dans l’A/B,
 * sa moitié se note avec l’empreinte de l’envoi (`cle`, noterLePlan) : /admin compte chaque vidéo dès son plan, qu’elle
 * aille ou non jusqu’à l’import.
 */
export const POST = route("POST /api/captures/video/plan", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/captures/video/plan"].corps);
  if (!corps) return erreur("invalide");
  /* La même règle que les lots qui suivront : l’accord de l’import, la bêta ; comptée avec eux, par adresse */
  if (!consentementImport(corps.consentement)) return erreur("consentement");
  const permis = await lecturePermise(null);
  if (permis !== "ok") return erreur(permis);
  if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
  const tournage = !!(await tournageDuNavigateur());
  const video = { lots: corps.lots, video: corps.video, sensSur: corps.sensSur, ajout: corps.mode === "ajout", tournage };
  const bras = brasDeLaVideo(video);
  const envoi = envoiDe(cleEnvoi(corps.cle));
  if (bras && envoi) await noterLePlan({ envoi, video: corps.video, bras, compte: await utilisateurDeSession(await lireSession()) });
  return repondre("POST /api/captures/video/plan", { lecture: planDeLecture(video) });
});
