import { Email, ouvrirSession, verifierCode } from "@/server/auth";
import { peutEntrer } from "@/server/env";
import { effacerBrouillon, lireBrouillon, poserChoisie, poserSession } from "@/server/cookies";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { brouillonALaConnexion } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/**
 * Le code reçu par email : bon, il ouvre la session. La conv importée sur ce navigateur rejoint le compte et s’ouvre s’il
 * n’en a encore lu aucune ; sinon elle reste un brouillon, et l’accueil garde la conv qu’on suit (brouillonALaConnexion).
 */
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
  const rattachee = await brouillonALaConnexion(utilisateur, await lireBrouillon());
  if (rattachee) {
    await effacerBrouillon();
    await poserChoisie(rattachee);
  }
  return json({ ok: true, email: utilisateur.email });
}
