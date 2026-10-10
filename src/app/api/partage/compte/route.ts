import { CLES, compter } from "@/server/compteurs";
import { contexteRequete } from "@/server/donnees";
import { erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";

/** Une image vraiment partagée (ou enregistrée) depuis « Partager en image » : c’est ce geste qu’on compte, pas l’aperçu. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  if (await sousLaLimite(`partage-compte:${utilisateur.id}`, LIMITES.imageParCompte)) await compter(CLES.imagePartagee);
  return json({ ok: true });
}
