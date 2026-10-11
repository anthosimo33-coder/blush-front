import { compteDe, Email, ouvrirSession, prendreCode } from "@/server/auth";
import { peutEntrer } from "@/server/env";
import { effacerBrouillon, effacerNavigateur, lireBrouillon, lireNavigateur, poserChoisie, poserSession } from "@/server/cookies";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { brouillonALaConnexion } from "@/server/histoires";
import { ipDe, LIMITES } from "@/server/limites";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/* Le corps du contrat, l’email vérifié comme à la demande du code */
const Corps = ROUTES["POST /api/auth/verifier"].corps.extend({ email: Email });

/**
 * Le code reçu par email, tapé dans le navigateur qui l’a demandé (son cookie) : bon, il ouvre la session. La conv importée
 * sur ce navigateur rejoint le compte et s’ouvre s’il n’en a encore lu aucune ; sinon elle reste un brouillon, et l’accueil
 * garde la conv qu’on suit (brouillonALaConnexion). Un mauvais code répond 200 `{ ok: false }`, pas une erreur de la liste
 * (src/types/erreurs-api.ts) : voulu, la même réponse pour tous. Trop d’essais ratés aujourd’hui pour cet email, depuis ce
 * navigateur ou cette adresse IP (prendreCode) : 429 `essais`, pour tous aussi.
 */
export const POST = route(async (req: Request) => {
  const g = await garde(req, { session: "aucune", limite: { ip: "verif", limite: LIMITES.verificationParIp } });
  if (g instanceof Response) return g;
  const b = await lireCorps(req, Corps);
  if (!b) return repondre("POST /api/auth/verifier", { ok: false });
  /* Le code d’abord : sans le bon, la réponse est la même, invité ou pas (un email hors de la bêta n’en reçoit jamais) */
  const essai = await prendreCode(b.email, b.code.trim(), { navigateur: await lireNavigateur(), ip: ipDe(req) });
  if (essai === "essais") return erreur("essais");
  if (essai === "faux") return repondre("POST /api/auth/verifier", { ok: false });
  await effacerNavigateur();
  /* Bêta fermée : un email retiré de la liste après l’envoi de son code (seul celui qui a le code l’apprend) */
  if (!peutEntrer(b.email)) return erreur("beta");
  const utilisateur = await compteDe(b.email);
  const { secret, expiresAt } = await ouvrirSession(utilisateur.id);
  await poserSession(secret, expiresAt);
  const rattachee = await brouillonALaConnexion(utilisateur, await lireBrouillon());
  if (rattachee) {
    await effacerBrouillon();
    await poserChoisie(rattachee);
  }
  return repondre("POST /api/auth/verifier", { ok: true, email: utilisateur.email });
});
