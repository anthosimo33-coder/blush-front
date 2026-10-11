import { CLES, compter } from "@/server/compteurs";
import { repondre } from "@/server/http";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";

/** Une image vraiment partagée (ou enregistrée) depuis « Partager en image » : c’est ce geste qu’on compte, pas l’aperçu. */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  if (await sousLaLimiteDuCompte(g.utilisateur, "partage-compte")) await compter(CLES.imagePartagee);
  return repondre("POST /api/partage/compte", { ok: true });
}
