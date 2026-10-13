import { utiliserAvance } from "@/server/achats";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { renonciationPaiement } from "@/server/juridique";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Utiliser le rapport d’avance du compte (le 2e rapport à −50 %, payé sur « C’est débloqué ») pour la conv du corps
 * (sinon celle de la page) : son rapport se débloque sans rien payer. Comme un paiement, le geste donne la renonciation
 * au délai de rétractation (sa version d’aujourd’hui ; sans elle : 422 « renonciation »), gardée avec l’achat. Aucun
 * rapport d’avance valable : 422 « offre » ; la conv d’un autre : 404 « aucune » ; déjà débloquée (ou l’équipe) : 409 « deja ».
 */
export const POST = route("POST /api/paiement/avance", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement/avance"].corps);
  if (!corps) return erreur("invalide");
  const renonciation = renonciationPaiement(corps.renonciation);
  if (!renonciation) return erreur("renonciation");
  const { utilisateur, story } = g;
  const conv = corps.conv ?? story?.id;
  if (!conv) return erreur("aucune");
  if (!(await sousLaLimiteDuCompte(utilisateur, "commande"))) return erreur("trop");
  const r = await utiliserAvance(utilisateur, conv, renonciation);
  if (typeof r === "string") return erreur(r);
  return repondre("POST /api/paiement/avance", { achat: r.id });
});
