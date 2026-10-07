import { poserBrouillon } from "@/server/cookies";
import { erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport, importer, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

export const maxDuration = 60;

/** Un export WhatsApp (.zip ou .txt) devient une histoire brouillon. Rien n’est analysé avant l’email. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop", 429);
  const fichier = (await req.formData().catch(() => null))?.get("fichier");
  if (!(fichier instanceof File)) return erreur("fichier", 422);
  try {
    const { id, meta, secret } = await importer(fichier);
    await poserBrouillon(secret);
    const story = storyAffichee(id, meta);
    return json({ source: story.sources[0], story });
  } catch (e) {
    if (e instanceof ErreurImport) return erreur(e.code, 422);
    throw e;
  }
}
