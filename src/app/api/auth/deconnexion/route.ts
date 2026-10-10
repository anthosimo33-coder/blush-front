import { fermerSession } from "@/server/auth";
import { effacerBrouillon, effacerChoisie, effacerSession, lireSession } from "@/server/cookies";
import { erreur, json, memeOrigine } from "@/server/http";

/**
 * Se déconnecter : la session, et ce qui désigne une conv sur cet appareil (le brouillon d’un import laissé en plan,
 * la conv choisie). Sur un appareil partagé, la personne suivante ne retrouve rien.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const secret = await lireSession();
  if (secret) await fermerSession(secret);
  await effacerSession();
  await effacerBrouillon();
  await effacerChoisie();
  return json({ ok: true });
}
