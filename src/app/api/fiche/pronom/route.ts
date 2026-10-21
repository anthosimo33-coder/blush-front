import { ficheEtMaj } from "@/server/ajouts";
import { definirPronomAutre } from "@/server/histoires";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { ROUTES } from "@/types/api";

/* Une mise à jour de la mémoire restée en plan repart après la réponse (ficheEtMaj, relancerApres) : 20 à 60 s, trois essais au plus */
export const maxDuration = 300;

/**
 * Le pronom de l’autre, corrigé sur sa fiche (« Il » ou « Elle ») : la conv ne le disait pas, ou pas bien. Le chat, sa
 * fiche, les mails et les écrans le suivent ; le verdict et le rapport déjà écrits restent tels quels. À un client
 * seulement, comme corriger sa fiche, et sous la même limite.
 */
export const PUT = route("PUT /api/fiche/pronom", async (req: Request) => {
  const g = await garde(req, { session: "requise", client: true, histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const corps = await lireCorps(req, ROUTES["PUT /api/fiche/pronom"].corps);
  if (!corps) return erreur("invalide");
  if (!(await sousLaLimiteDuCompte(utilisateur, "fiche"))) return erreur("trop");
  const meta = await definirPronomAutre(story.id, corps.pronom);
  return repondre("PUT /api/fiche/pronom", await ficheEtMaj({ ...story, meta }));
});
