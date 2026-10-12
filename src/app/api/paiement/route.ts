import { erreur, lireCorps, repondre, route } from "@/server/http";
import { commencerPaiement } from "@/server/paiement/commande";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Commencer un paiement : une offre du catalogue, pour la conv du corps (sinon celle de la page) quand elle en débloque
 * le rapport. Sans la case de renonciation au droit de rétractation cochée, rien ne part (422 « renonciation »). Le
 * serveur écrit l’achat au prix du catalogue, puis rend la page où payer (Whop, ou le faux Whop), ou rien quand l’offre ③
 * se paie en un geste. Sans paiement branché : 402 « bientot » ; l’équipe, ou un rapport déjà ouvert : 409 « deja ».
 */
export const POST = route("POST /api/paiement", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement"].corps);
  if (!corps) return erreur("offre");
  if (corps.renonciation !== true) return erreur("renonciation");
  const { utilisateur, story } = g;
  if (!(await sousLaLimiteDuCompte(utilisateur, "commande"))) return erreur("trop");
  const r = await commencerPaiement(utilisateur, corps.offre, corps.conv ?? story?.id ?? null);
  if (typeof r === "string") return erreur(r);
  return repondre("POST /api/paiement", { achat: r.achat, checkout: r.checkout, url: r.url });
});
