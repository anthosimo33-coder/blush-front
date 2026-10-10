import { z } from "zod";
import { Sortie01 } from "@prompts/lib/schemas";
import { AppliCaptures } from "@/server/appli-captures";
import { cleEnvoi, enTexte, ErreurCaptures, lecturePermise, uneSeuleLecture } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport, importerCaptures, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { fusionnerLots } from "@/server/video";

/*
 * Les lots viennent du navigateur (relus par le prompt 01, mais renvoyés par lui) : on borne ce qu’un envoi peut
 * contenir, pour qu’un envoi forgé ne coûte pas des secondes de calcul ni des Mo en base. Un enregistrement réel en
 * est loin (seize lots de six écrans au plus, un peu plus quand des écrans lourds les font couper).
 */
const MESSAGES_MAX = 3000;
const TEXTE_MAX = 4000;
/* Tous les messages ensemble : un enregistrement réel en compte une centaine de Ko */
const TEXTE_TOTAL_MAX = 2_000_000;
/*
 * Chaque chaîne a sa borne. Le nom de l’autre (`autre`) est recopié devant chacun de ses messages : sans borne, un envoi
 * de quelques centaines de Ko devenait des centaines de Mo en mémoire.
 */
const Lot = Sortie01.extend({
  appli: z.string().max(40).nullable(),
  autre: z.string().max(80).nullable(),
  captures: Sortie01.shape.captures.max(40),
  profil: z.array(z.string().max(1000)).max(50),
  doutes: z.array(z.string().max(1000)).max(50),
});
const Envoi = z
  /* `cle` : celle de l’envoi, pour qu’un nouvel essai après une coupure retrouve l’histoire déjà créée */
  .object({ app: AppliCaptures, lots: z.array(Lot).min(1).max(40), cle: z.string().max(64).optional() })
  .refine(({ lots }) => {
    const blocs = lots.flatMap((l) => l.blocs);
    const messages = blocs.flatMap((b) => b.messages);
    const total = messages.reduce((n, m) => n + m.texte.length, 0);
    const reperes = blocs.every((b) => !b.repere || (b.repere.date.length <= 20 && (b.repere.heure?.length ?? 0) <= 20));
    return blocs.length <= 600 && messages.length <= MESSAGES_MAX && total <= TEXTE_TOTAL_MAX && reperes && messages.every((m) => m.texte.length <= TEXTE_MAX && (m.reaction?.length ?? 0) <= 50);
  });

/**
 * Un enregistrement d’écran, lu lot par lot (/api/captures/lot) : les lectures sont rassemblées (sans les messages
 * vus deux fois au bord de deux lots), puis la conv devient une histoire brouillon, comme des captures.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop", 429);
  /* Les lots viennent de /api/captures/lot : la même règle (bêta fermée, un compte), sans plafond de modèle ici */
  const permis = await lecturePermise(null);
  if (permis !== "ok") return erreur(permis, permis === "connexion" ? 401 : 429);
  const envoi = Envoi.safeParse(await corps(req));
  if (!envoi.success) return erreur("fichier", 422);
  const { app, lots, cle } = envoi.data;
  try {
    const lu = await uneSeuleLecture(cleEnvoi(cle), async (secret) => {
      const t = enTexte(fusionnerLots(lots, app));
      const { id, meta } = await importerCaptures({ appli: app, t, secret });
      /* Une fois par histoire créée : un nouvel essai qui la retrouve ne compte pas l’import deux fois */
      await compterImportVenuDuPartage();
      return { id, meta, secret, messages: t.messages };
    });
    await poserBrouillon(lu.secret);
    const story = storyAffichee(lu.id, lu.meta);
    return json({ source: story.sources[0], messagesRead: lu.messages, story });
  } catch (e) {
    if (e instanceof ErreurCaptures) return erreur("capture", 422);
    if (e instanceof ErreurImport) return erreur(e.code, 422);
    throw e;
  }
}
