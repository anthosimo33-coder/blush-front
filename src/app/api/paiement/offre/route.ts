import { erreur, lireCorps, repondre, route } from "@/server/http";
import { proposerOffreUnique } from "@/server/paiement/commande";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Montrer une offre unique, si le serveur le veut : ① la suite moins chère (la feuille du paiement fermée sans payer, pour
 * la conv de la page), ③ Premium pour 5 € de plus (« C’est débloqué », après le rapport seul). Une fois par compte, jamais
 * deux le même jour : la réponse dit laquelle, jusqu’à quand, et si elle se paie en un geste ; ou aucune.
 */
export const POST = route("POST /api/paiement/offre", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement/offre"].corps);
  if (!corps) return erreur("offre");
  return repondre("POST /api/paiement/offre", await proposerOffreUnique(g.utilisateur, corps.offre, g.story?.id ?? null));
});
