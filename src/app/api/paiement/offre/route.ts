import { erreur, lireCorps, repondre, route } from "@/server/http";
import { proposerOffreUnique } from "@/server/paiement/commande";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Montrer une offre unique, si le serveur le veut : ① la suite moins chère (la feuille du paiement fermée sans payer, pour
 * la conv de la page), ③ Premium pour 6,90 € de plus (« C’est débloqué », `achat` : le rapport seul, payé il y a moins de 15
 * minutes). Une fois par compte, jamais
 * deux le même jour : la réponse dit laquelle, jusqu’à quand, et si elle se paie en un geste ; ou aucune (toujours pour
 * ④, arrêtée le 23 octobre 2026, qu’un onglet d’avant demande encore).
 */
export const POST = route("POST /api/paiement/offre", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement/offre"].corps);
  if (!corps) return erreur("offre");
  return repondre("POST /api/paiement/offre", await proposerOffreUnique(g.utilisateur, corps.offre, g.story?.id ?? null, corps.achat ?? null));
});
