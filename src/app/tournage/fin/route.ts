import { utilisateurDeSession } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { memeOrigine } from "@/server/http";
import { quitterLeTournage } from "@/server/tournage";

/** Où revenir une fois sorti : l’accueil, ou « Mon compte » quand on l’a quitté de là (son champ `retour`). Rien d’autre. */
const RETOURS = ["/", "/compte"] as const;

/**
 * « Quitter le mode tournage » (un formulaire de /tournage, ou de « Mon compte ») : le cookie s’efface, le compte connecté
 * ne compte plus ses prises d’avant pour celles d’une créatrice (quitterLeTournage), et BLUSH redevient celui de tout le
 * monde. Un POST de l’appli elle-même : un autre site ne le fait pas quitter (ni un préchargement). Un formulaire plutôt
 * qu’un appel : la page qui suit se charge en entier, et le routeur ne garde rien du mode tournage (l’export sans
 * fichier déjà préchargé, src/app/importer/export/tournage).
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response(null, { status: 403 });
  await quitterLeTournage(await utilisateurDeSession(await lireSession()));
  const demande = (await req.formData().catch(() => null))?.get("retour");
  const retour = RETOURS.find((r) => r === demande) ?? "/";
  /* Relative, comme celle du lien : le navigateur reste sur son adresse */
  return new Response(null, { status: 303, headers: { Location: retour } });
}
