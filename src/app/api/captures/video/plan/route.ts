import { lecturePermise } from "@/server/captures";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { consentementImport } from "@/server/juridique";
import { planDeLecture } from "@/server/lecture-partielle";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { tournageDuNavigateur } from "@/server/tournage";
import { ROUTES } from "@/types/api";

/**
 * Avant de lire une longue vidéo (plus de lots qu’un tour de lecteurs) : en entier avant l’achat, comme avant, ou
 * d’abord sa partie la plus récente, le reste de ses écrans gardé pour après le paiement (src/server/lecture-partielle.ts :
 * le mode BLUSH_LECTURE_PARTIELLE, la moitié de l’A/B d’après `video`, son sens). Rien n’est lu ni gardé ici : une
 * question, une fois par enregistrement. Un morceau ajouté et une prise du mode tournage se lisent en entier.
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
  const lecture = planDeLecture({ lots: corps.lots, video: corps.video, sensSur: corps.sensSur, ajout: corps.mode === "ajout", tournage });
  return repondre("POST /api/captures/video/plan", { lecture });
});
