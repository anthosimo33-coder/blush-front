import { effacerTournage } from "@/server/cookies";
import { memeOrigine } from "@/server/http";

/**
 * « Quitter le mode tournage » (un formulaire de /tournage) : le cookie s’efface, et BLUSH redevient celui de tout le
 * monde sur ce navigateur. Un POST de l’appli elle-même : un autre site ne le fait pas quitter (ni un préchargement).
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response(null, { status: 403 });
  await effacerTournage();
  /* Relative, comme celle du lien : le navigateur reste sur son adresse */
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
