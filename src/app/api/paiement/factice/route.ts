import { erreur, lireCorps, repondre, route } from "@/server/http";
import { issueDuFauxWhop } from "@/server/paiement/commande";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Les boutons du faux Whop (BLUSH_PAIEMENT_FACTICE : en local et dans les tests, jamais sur Vercel ; src/proxy.ts n’y
 * laisse que ce poste) : le webhook que Whop enverrait pour un achat du compte, payé, refusé ou remboursé, signé du
 * secret de test. Le navigateur le poste ensuite à /api/paiement/whop, comme Whop. Hors du faux Whop : 404.
 */
export const POST = route("POST /api/paiement/factice", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement/factice"].corps);
  if (!corps) return erreur("invalide");
  const r = await issueDuFauxWhop(g.utilisateur, corps.achat, corps.issue);
  return r ? repondre("POST /api/paiement/factice", { webhook: { corps: r.webhook.corps, entetes: { ...r.webhook.entetes } }, retour: r.retour }) : erreur("introuvable");
});
