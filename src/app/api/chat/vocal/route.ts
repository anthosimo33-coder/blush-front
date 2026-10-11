import { definirChatVocal } from "@/server/depot";
import { erreur, lireCorps, repondre } from "@/server/http";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/** Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const mode = await lireCorps(req, ROUTES["POST /api/chat/vocal"].corps);
  if (!mode) return erreur("invalide");
  await definirChatVocal(g.story.id, mode.actif);
  return repondre("POST /api/chat/vocal", { modeVocal: mode.actif });
}
