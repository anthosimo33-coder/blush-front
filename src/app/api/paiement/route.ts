import { after } from "next/server";
import { livreeAuPaiement } from "@/contenu/offres";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { commencerPaiement } from "@/server/paiement/commande";
import { renonciationPaiement } from "@/server/juridique";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { noterAuFil } from "@/server/visites";
import { ROUTES } from "@/types/api";

/**
 * Commencer un paiement : une offre du catalogue, pour la conv du corps (sinon celle de la page) quand elle en débloque
 * le rapport. Sans la renonciation au délai de rétractation (sa version d’aujourd’hui, que le geste de payer envoie),
 * rien ne part (422 « renonciation ») ; avec elle, l’achat garde sa version et l’heure (le rapport d’avance, livré
 * seulement à son usage, n’en prend aucune : livreeAuPaiement). Le serveur écrit l’achat au prix
 * du catalogue, puis le paie dans la feuille avec le jeton des Elements de Whop (`jeton` : le paiement créé, que le
 * navigateur finit ; la banque qui dit non : 402 « carte »), ou en un geste (les offres de « C’est débloqué »), ou rend
 * la page où le payer (Whop, ou le faux Whop). Sans paiement branché : 402 « bientot » ; l’équipe, ou un rapport déjà
 * ouvert : 409 « deja ».
 */
export const POST = route("POST /api/paiement", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/paiement"].corps);
  if (!corps) return erreur("offre");
  /* Le rapport d’avance n’est livré qu’à son usage : aucune renonciation à son achat (même envoyée), elle se donne en l’utilisant */
  const livree = livreeAuPaiement(corps.offre);
  const renonciation = livree ? renonciationPaiement(corps.renonciation) : null;
  if (livree && !renonciation) return erreur("renonciation");
  const { utilisateur, story } = g;
  if (!(await sousLaLimiteDuCompte(utilisateur, "commande"))) return erreur("trop");
  const r = await commencerPaiement(utilisateur, corps.offre, corps.conv ?? story?.id ?? null, renonciation, { jeton: corps.jeton ?? null });
  if (typeof r === "string") return erreur(r);
  /* Au fil du direct, avec la ville de la connexion : l’achat payé la reprendra (le webhook n’a pas de connexion à situer) */
  after(() => noterAuFil(req, { genre: "paiement", offre: corps.offre, ref: r.achat }));
  return repondre("POST /api/paiement", { achat: r.achat, checkout: r.checkout, url: r.url, paiement: r.paiement });
});
