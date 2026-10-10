import { AppliCaptures } from "@/server/appli-captures";
import { imagesDe, lecturePermise, lireLot } from "@/server/captures";
import { erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { avecEcheance, echeancePour } from "@/server/echeance";

/* Un lot de six images : une trentaine de secondes de lecture, une minute au pire */
export const maxDuration = 180;

/**
 * Un lot d’images tirées d’un enregistrement d’écran (dans le navigateur) : BLUSH les lit (prompt 01) et rend
 * sa lecture brute. Les images ne sont gardées nulle part. Les lots sont ensuite rassemblés (/api/captures/video).
 */
async function traiter(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`lot:${ipDe(req)}`, LIMITES.lotParIp))) return erreur("trop", 429);
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = AppliCaptures.safeParse(fd?.get("app"));
  try {
    const images = await imagesDe(fichiers);
    /* Le modèle va lire : la bêta et les plafonds d’abord (après la vérification de l’envoi, qu’un envoi invalide ne compte pas) */
    const permis = await lecturePermise("lots");
    if (permis !== "ok") return erreur(permis, permis === "connexion" ? 401 : 429);
    return json({ lot: await lireLot(images, appli.success ? appli.data : "autre", "captures_video") });
  } catch (e) {
    if (e instanceof ErreurImport) return erreur(e.code, 422);
    throw e;
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export function POST(req: Request) {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
}
