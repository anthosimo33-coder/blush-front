import { z } from "zod";
import { ErreurCaptures, imagesDe, lireCaptures } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport, importerCaptures, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/* La lecture de 20 captures prend jusqu’à une minute */
export const maxDuration = 180;

const Appli = z.enum(["instagram", "hinge", "autre"]);

/**
 * Des captures d’écran de la conv (réduites par le navigateur) : BLUSH les lit (prompt 01) et en fait une histoire
 * brouillon, avant l’email, comme un export.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop", 429);
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = Appli.safeParse(fd?.get("app"));
  if (fd?.get("mode") === "add") return erreur("capture", 422);
  try {
    const t = await lireCaptures(await imagesDe(fichiers), appli.success ? appli.data : "autre");
    const { id, meta, secret } = await importerCaptures({ appli: appli.success ? appli.data : "autre", t });
    await poserBrouillon(secret);
    await compterImportVenuDuPartage();
    const story = storyAffichee(id, meta);
    return json({ source: story.sources[0], messagesRead: t.messages, story });
  } catch (e) {
    if (e instanceof ErreurCaptures) return erreur("capture", 422);
    if (e instanceof ErreurImport) return erreur(e.code, 422);
    throw e;
  }
}
