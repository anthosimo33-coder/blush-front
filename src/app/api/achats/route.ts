import { achatsDuCompte } from "@/server/achats";
import { repondre, route } from "@/server/http";
import { lecture } from "@/server/requete";

/** « Tes achats » (Mon compte) : les achats payés du compte, même repris ensuite, du plus récent au plus ancien (achatsDuCompte). */
export const GET = route("GET /api/achats", async () => {
  const g = await lecture({ session: "requise" });
  return g instanceof Response ? g : repondre("GET /api/achats", { achats: await achatsDuCompte(g.utilisateur.id) });
});
