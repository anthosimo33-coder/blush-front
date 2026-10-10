import { compteDe, Email, ouvrirSession, prendreCode } from "@/server/auth";
import { peutEntrer } from "@/server/env";
import { effacerBrouillon, effacerNavigateur, lireBrouillon, lireNavigateur, poserChoisie, poserSession } from "@/server/cookies";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { brouillonALaConnexion } from "@/server/histoires";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/**
 * Le code reçu par email, tapé dans le navigateur qui l’a demandé (son cookie) : bon, il ouvre la session. La conv importée
 * sur ce navigateur rejoint le compte et s’ouvre s’il n’en a encore lu aucune ; sinon elle reste un brouillon, et l’accueil
 * garde la conv qu’on suit (brouillonALaConnexion). Un mauvais code répond 200 `{ ok: false }`, pas une erreur de la liste
 * (src/types/erreurs-api.ts) : voulu, la même réponse pour tous. Trop d’essais ratés aujourd’hui pour cet email : 429
 * `essais`, pour tous aussi.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  if (!(await sousLaLimite(`verif:${ipDe(req)}`, LIMITES.verificationParIp))) return erreur("trop");
  const b = await corps<{ email: string; code: string }>(req);
  const email = Email.safeParse(b.email);
  if (!email.success || typeof b.code !== "string") return json({ ok: false });
  /* Le code d’abord : sans le bon, la réponse est la même, invité ou pas (un email hors de la bêta n’en reçoit jamais) */
  const essai = await prendreCode(email.data, b.code.trim(), await lireNavigateur());
  if (essai === "essais") return erreur("essais");
  if (essai === "faux") return json({ ok: false });
  await effacerNavigateur();
  /* Bêta fermée : un email retiré de la liste après l’envoi de son code (seul celui qui a le code l’apprend) */
  if (!peutEntrer(email.data)) return erreur("beta");
  const utilisateur = await compteDe(email.data);
  const { secret, expiresAt } = await ouvrirSession(utilisateur.id);
  await poserSession(secret, expiresAt);
  const rattachee = await brouillonALaConnexion(utilisateur, await lireBrouillon());
  if (rattachee) {
    await effacerBrouillon();
    await poserChoisie(rattachee);
  }
  return json({ ok: true, email: utilisateur.email });
}
