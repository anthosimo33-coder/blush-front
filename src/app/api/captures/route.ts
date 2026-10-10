import { AppliCaptures } from "@/server/appli-captures";
import { cleEnvoi, ErreurCaptures, imagesDe, LectureRefusee, lecturePermise, lireCaptures, uneSeuleLecture } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, json, memeOrigine } from "@/server/http";
import { ErreurImport, importerCaptures, storyAffichee } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { avecEcheance, echeancePour } from "@/server/echeance";

/* La lecture de 20 captures prend jusqu’à une minute */
export const maxDuration = 180;

const Appli = AppliCaptures;

/**
 * Des captures d’écran de la conv (réduites par le navigateur) : BLUSH les lit (prompt 01) et en fait une histoire
 * brouillon, avant l’email, comme un export. Un nouvel essai du même envoi (`cle`, après une coupure du réseau) rend
 * la lecture déjà faite (src/server/captures.ts, uneSeuleLecture).
 */
async function traiter(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  if (!(await sousLaLimite(`import:${ipDe(req)}`, LIMITES.importParIp))) return erreur("trop");
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const appli = Appli.safeParse(fd?.get("app"));
  if (fd?.get("mode") === "add") return erreur("capture");
  const app = appli.success ? appli.data : "autre";
  try {
    const images = await imagesDe(fichiers);
    const lu = await uneSeuleLecture(cleEnvoi(fd?.get("cle")), async (secret) => {
      /* Le modèle va lire : la bêta et les plafonds d’abord (après la vérification de l’envoi, qu’un envoi invalide ne compte pas) */
      const permis = await lecturePermise("captures");
      if (permis !== "ok") throw new LectureRefusee(permis);
      const t = await lireCaptures(images, app);
      const { id, meta } = await importerCaptures({ appli: app, t, secret });
      /* Ici, une fois par lecture : un nouvel essai qui la reprend ne compte pas l’import deux fois */
      await compterImportVenuDuPartage();
      return { id, meta, secret, messages: t.messages };
    });
    await poserBrouillon(lu.secret);
    const story = storyAffichee(lu.id, lu.meta);
    return json({ source: story.sources[0], messagesRead: lu.messages, story });
  } catch (e) {
    if (e instanceof LectureRefusee) return erreur(e.code);
    if (e instanceof ErreurCaptures) return erreur("capture");
    if (e instanceof ErreurImport) return erreur(e.code);
    throw e;
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export function POST(req: Request) {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
}
