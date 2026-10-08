import { Email, ouvrirSession, verifierCode } from "@/server/auth";
import { peutEntrer } from "@/server/env";
import { effacerBrouillon, lireBrouillon, poserChoisie, poserSession } from "@/server/cookies";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { rattacherBrouillon } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/** Le code reçu par email : bon, il ouvre la session et rattache la conv importée au compte (c’est elle qui s’ouvre). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  if (!(await sousLaLimite(`verif:${ipDe(req)}`, LIMITES.verificationParIp))) return erreur("trop", 429);
  const b = await corps<{ email: string; code: string }>(req);
  const email = Email.safeParse(b.email);
  if (!email.success || typeof b.code !== "string") return json({ ok: false });
  if (!peutEntrer(email.data)) return erreur("beta", 403);
  const utilisateur = await verifierCode(email.data, b.code.trim());
  if (!utilisateur) return json({ ok: false });
  const { secret, expiresAt } = await ouvrirSession(utilisateur.id);
  await poserSession(secret, expiresAt);
  const rattachee = await rattacherBrouillon(utilisateur, await lireBrouillon());
  await effacerBrouillon();
  if (rattachee) await poserChoisie(rattachee);
  return json({ ok: true, email: utilisateur.email });
}
