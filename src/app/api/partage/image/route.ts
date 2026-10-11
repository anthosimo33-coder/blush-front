import { carteMoment, carteReponse } from "@/server/carte-partage";
import { erreur, lireCorps } from "@/server/http";
import { momentAPartager } from "@/server/partages";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * « Partager en image » : un moment de BLUSH (une réponse du chat, la chute d’un chapitre) dessiné en story, le prénom
 * de l’autre masqué (le tien reste). Ce qui se dessine, et ce qui ne se dessine pas (le mode sobre, un chapitre sans
 * l’accès) : momentAPartager, src/server/partages.ts.
 */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  /* Une réponse du chat (son échange) ou la chute d’un chapitre (sa place) : CibleImage, src/types/api.ts */
  const c = await lireCorps(req, ROUTES["POST /api/partage/image"].corps);
  if (!c) return erreur("cible");
  const moment = await momentAPartager(story, utilisateur.plan, c);
  if (typeof moment === "string") return erreur(moment);
  /* Compté une fois le moment trouvé : un refus ne dessine rien, et ne coûte rien */
  if (!(await sousLaLimiteDuCompte(utilisateur, "image"))) return erreur("trop");
  return moment.type === "reponse" ? carteReponse(moment) : carteMoment(moment);
}
