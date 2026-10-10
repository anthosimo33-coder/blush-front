import { fermerSession } from "@/server/auth";
import { lireSession, oublierCetAppareil } from "@/server/cookies";
import { corps, erreur, json, memeOrigine, OUBLIER_LE_NAVIGATEUR } from "@/server/http";

/**
 * Se déconnecter : la session (`partout` : toutes celles du compte, sur tous ses appareils), et les cookies qui désignent
 * une conv ou un code sur cet appareil (oublierCetAppareil). La réponse fait aussi oublier au navigateur ce qu’il garde
 * de BLUSH (OUBLIER_LE_NAVIGATEUR) : sur un appareil partagé, la personne suivante ne retrouve rien.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { partout } = await corps<{ partout: boolean }>(req);
  const secret = await lireSession();
  if (secret) await fermerSession(secret, { partout: partout === true });
  await oublierCetAppareil();
  return json({ ok: true }, 200, OUBLIER_LE_NAVIGATEUR);
}
