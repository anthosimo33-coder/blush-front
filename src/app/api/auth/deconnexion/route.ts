import { fermerSession } from "@/server/auth";
import { lireSession, oublierCetAppareil } from "@/server/cookies";
import { erreur, lireCorps, memeOrigine, OUBLIER_LE_NAVIGATEUR, repondre } from "@/server/http";
import { ROUTES } from "@/types/api";

/**
 * Se déconnecter : la session (`partout` : toutes celles du compte, sur tous ses appareils), et les cookies qui désignent
 * une conv ou un code sur cet appareil (oublierCetAppareil). La réponse fait aussi oublier au navigateur ce qu’il garde
 * de BLUSH (OUBLIER_LE_NAVIGATEUR) : sur un appareil partagé, la personne suivante ne retrouve rien.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  /* Un corps mal formé ne déconnecte que cet appareil */
  const partout = (await lireCorps(req, ROUTES["POST /api/auth/deconnexion"].corps))?.partout === true;
  const secret = await lireSession();
  if (secret) await fermerSession(secret, { partout });
  await oublierCetAppareil();
  return repondre("POST /api/auth/deconnexion", { ok: true }, 200, OUBLIER_LE_NAVIGATEUR);
}
