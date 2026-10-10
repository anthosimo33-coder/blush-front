import { fermerSession } from "@/server/auth";
import { effacerBrouillon, effacerChoisie, effacerNavigateur, effacerSession, lireSession } from "@/server/cookies";
import { corps, erreur, json, memeOrigine, OUBLIER_LE_NAVIGATEUR } from "@/server/http";

/**
 * Se déconnecter : la session (`partout` : toutes celles du compte, sur tous ses appareils), et ce qui désigne une conv
 * sur cet appareil (le brouillon d’un import laissé en plan, la conv choisie). La réponse fait aussi oublier au navigateur
 * ce qu’il garde de BLUSH (OUBLIER_LE_NAVIGATEUR) : sur un appareil partagé, la personne suivante ne retrouve rien.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { partout } = await corps<{ partout: boolean }>(req);
  const secret = await lireSession();
  if (secret) await fermerSession(secret, { partout: partout === true });
  await effacerSession();
  await effacerBrouillon();
  await effacerChoisie();
  await effacerNavigateur();
  return json({ ok: true }, 200, OUBLIER_LE_NAVIGATEUR);
}
