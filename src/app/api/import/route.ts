import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, repondre, reponseErreur } from "@/server/http";
import { depuisFichier, depuisPaquet, importer, storyAffichee } from "@/server/histoires";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";

export const maxDuration = 60;

/**
 * Un export (WhatsApp ou Instagram) devient une histoire brouillon. Rien n’est analysé avant l’email.
 * Le navigateur envoie un paquet préparé (« export » : seulement le texte de la conv, compressé) ; un fichier brut
 * (« fichier ») est aussi accepté, sous la limite de taille de Vercel.
 */
export async function POST(req: Request) {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const paquet = fd?.get("export");
  const fichier = fd?.get("fichier");
  if (!(paquet instanceof File) && !(fichier instanceof File)) return erreur("fichier");
  /*
   * La limite de l’adresse IP, une fois le formulaire vérifié (un envoi sans fichier ne compte pas), mais avant de le
   * lire : décompresser et lire un export coûte, un fichier illisible compte aussi
   */
  if (!(await sousLaLimiteDeLIp(req, "import", LIMITES.importParIp))) return erreur("trop");
  try {
    const lu = paquet instanceof File ? await depuisPaquet(paquet) : await depuisFichier(fichier as File);
    const { id, meta, secret } = await importer(lu);
    await poserBrouillon(secret);
    await compterImportVenuDuPartage();
    const story = storyAffichee(id, meta);
    return repondre("POST /api/import", { source: story.sources[0], story });
  } catch (e) {
    return reponseErreur(e);
  }
}
