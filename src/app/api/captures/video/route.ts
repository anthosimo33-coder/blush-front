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

/*
 * Les lots viennent du navigateur (relus par le prompt 01, mais renvoyés par lui) : on borne ce qu’un envoi peut
 * contenir, pour qu’un envoi forgé ne coûte pas des secondes de calcul ni des Mo en base. Un enregistrement réel en
 * est loin (une dizaine de lots d’une douzaine d’écrans, un peu plus quand des écrans lourds les font couper).
 */
const MESSAGES_MAX = 3000;
const TEXTE_MAX = 4000;
const Envoi = z
  .object({ app: AppliCaptures, lots: z.array(Sortie01).min(1).max(20) })
  .refine(({ lots }) => {
    const blocs = lots.flatMap((l) => l.blocs);
    const messages = blocs.flatMap((b) => b.messages);
    return blocs.length <= 600 && messages.length <= MESSAGES_MAX && messages.every((m) => m.texte.length <= TEXTE_MAX && (m.reaction?.length ?? 0) <= 50);
  });

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
