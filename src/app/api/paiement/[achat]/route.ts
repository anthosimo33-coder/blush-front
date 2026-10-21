import { erreur, repondre, route } from "@/server/http";
import { etatDeLAchat } from "@/server/paiement/commande";
import { garde } from "@/server/requete";

/* Un achat livré ici (vérifié chez Whop quand le webhook tarde) relance la chaîne du rapport après la réponse (after) : elle a la durée d’une fonction de la chaîne */
export const maxDuration = 800;

/**
 * Où en est un achat du compte (la page du retour du paiement le relit chaque seconde). `?paiement=pay_…` : le paiement
 * que Whop a donné au retour ; tant que le webhook tarde, il est vérifié chez Whop, et livré s’il est encaissé.
 */
export const GET = route("GET /api/paiement/[achat]", async (req: Request, { params }: RouteContext<"/api/paiement/[achat]">) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const paiement = new URL(req.url).searchParams.get("paiement");
  const etat = await etatDeLAchat(g.utilisateur, (await params).achat, paiement);
  return etat ? repondre("GET /api/paiement/[achat]", etat) : erreur("introuvable");
});
