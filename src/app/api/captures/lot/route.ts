import { AppliCaptures } from "@/server/appli-captures";
import { imagesDe, lecturePermise, lireLot } from "@/server/captures";
import { erreur, repondre, reponseErreur } from "@/server/http";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { avecEcheance, echeancePour } from "@/server/echeance";

/* Un lot de six images : une trentaine de secondes de lecture, une minute au pire */
export const maxDuration = 180;

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
  try {
    const images = await imagesDe(fichiers);
    /*
     * Le modèle va lire : la limite de l’adresse IP, la bêta et les plafonds d’abord, une fois l’envoi vérifié (un envoi
     * invalide ne compte pas : il ne coûte rien, et un voisin derrière la même IP n’y perd rien)
     */
    if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
    const permis = await lecturePermise("lots");
    if (permis !== "ok") return erreur(permis);
    return repondre("POST /api/captures/lot", { lot: await lireLot(images, appli.success ? appli.data : "autre", "captures_video") });
  } catch (e) {
    return reponseErreur(e);
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export function POST(req: Request) {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
}
