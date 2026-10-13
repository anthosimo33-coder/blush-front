import { repondre, route } from "@/server/http";
import { feuilleDuPaiement } from "@/server/paiement/commande";
import { lecture } from "@/server/requete";

/**
 * Ce que la feuille du paiement doit savoir avant de s’ouvrir : comment payer dans la feuille (les Elements de Whop et son
 * compte, le faux Whop, ou rien), et ce que le compte a d’avance pour une conv pas encore débloquée (un rapport d’avance,
 * le −50 % gardé). Rien d’autre : ni prix (le catalogue), ni moyen de paiement gardé.
 */
export const GET = route("GET /api/paiement/feuille", async () => {
  const g = await lecture({ session: "requise" });
  return g instanceof Response ? g : repondre("GET /api/paiement/feuille", await feuilleDuPaiement(g.utilisateur));
});
