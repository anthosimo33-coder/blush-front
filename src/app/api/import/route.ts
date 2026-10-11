import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, memeOrigine, repondre } from "@/server/http";
import { depuisFichier, depuisPaquet, ErreurImport, importer, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

export const maxDuration = 60;

/**
 * Un export (WhatsApp ou Instagram) devient une histoire brouillon. Rien n’est analysé avant l’email.
 * Le navigateur envoie un paquet préparé (« export » : seulement le texte de la conv, compressé) ; un fichier brut
 * (« fichier ») est aussi accepté, sous la limite de taille de Vercel.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop");
  const fd = await req.formData().catch(() => null);
  const paquet = fd?.get("export");
  const fichier = fd?.get("fichier");
  if (!(paquet instanceof File) && !(fichier instanceof File)) return erreur("fichier");
  try {
    const lu = paquet instanceof File ? await depuisPaquet(paquet) : await depuisFichier(fichier as File);
    const { id, meta, secret } = await importer(lu);
    await poserBrouillon(secret);
    await compterImportVenuDuPartage();
    const story = storyAffichee(id, meta);
    return repondre("POST /api/import", { source: story.sources[0], story });
  } catch (e) {
    if (e instanceof ErreurImport) return erreur(e.code);
    throw e;
  }
}
