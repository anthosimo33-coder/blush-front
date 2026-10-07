import { fermerSession } from "@/server/auth";
import { effacerSession, lireSession } from "@/server/cookies";
import { erreur, json, memeOrigine } from "@/server/http";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const secret = await lireSession();
  if (secret) await fermerSession(secret);
  await effacerSession();
  return json({ ok: true });
}
