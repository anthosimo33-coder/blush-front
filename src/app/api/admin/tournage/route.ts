import { erreur, lireCorps, repondre, route } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { cleDeLApi, etatDuTournage, preparerTournage, tournageDeLaRef } from "@/server/tournage";
import { ROUTES } from "@/types/api";

/* La lecture part après la réponse (le verdict, puis le rapport et la mémoire) : la fonction vit le temps de l’enchaîner */
export const maxDuration = 300;

/**
 * L’API du mode tournage (src/server/tournage.ts) : l’outil des créatrices prépare un lien depuis le .txt d’une
 * créatrice. Sa clé d’abord (401 « interdit »), puis le corps (422 « invalide »). Une `ref` déjà vue rend sa conv de
 * tournage sans rien relire ; sinon une nouvelle lecture, dans la limite du jour pour tous (429 « trop »). Personne ne
 * porte ce prénom dans le fichier : 422 « qui » ; un fichier illisible : son erreur d’import (fichier, groupe, courte).
 */
export const POST = route("POST /api/admin/tournage", async (req: Request) => {
  if (!cleDeLApi(req)) return erreur("interdit");
  const corps = await lireCorps(req, ROUTES["POST /api/admin/tournage"].corps);
  if (!corps) return erreur("invalide");
  const deja = corps.ref ? await tournageDeLaRef(corps.ref) : null;
  if (!deja && !(await sousLaLimite("tournage:api", LIMITES.tournageApiParJour))) return erreur("trop");
  const r = deja ? { id: deja, nouvelle: false } : await preparerTournage(corps);
  if ("refus" in r) return erreur("qui");
  const etat = await etatDuTournage(r.id);
  return repondre("POST /api/admin/tournage", { id: r.id, nouvelle: r.nouvelle, statut: etat?.statut ?? "en_lecture" });
});
