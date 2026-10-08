import { z } from "zod";
import { Sortie01 } from "@prompts/lib/schemas";
import { AppliCaptures } from "@/server/appli-captures";
import { enTexte, ErreurCaptures } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport, importerCaptures, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { fusionnerLots } from "@/server/video";

const Envoi = z.object({ app: AppliCaptures, lots: z.array(Sortie01).min(1).max(10) });

/**
 * Un enregistrement d’écran, lu lot par lot (/api/captures/lot) : les lectures sont rassemblées (sans les messages
 * vus deux fois au bord de deux lots), puis la conv devient une histoire brouillon, comme des captures.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop", 429);
  const envoi = Envoi.safeParse(await corps(req));
  if (!envoi.success) return erreur("fichier", 422);
  const { app, lots } = envoi.data;
  try {
    const t = enTexte(fusionnerLots(lots, app));
    const { id, meta, secret } = await importerCaptures({ appli: app, t });
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
