import { eq } from "drizzle-orm";
import { contexteRequete } from "@/server/donnees";
import { db, schema } from "@/server/db";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { ROUTES } from "@/types/api";

/** Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  if (!story) return erreur("aucune");
  const mode = await lireCorps(req, ROUTES["POST /api/chat/vocal"].corps);
  if (!mode) return erreur("invalide");
  await db().update(schema.stories).set({ chatVocal: mode.actif }).where(eq(schema.stories.id, story.id));
  return repondre("POST /api/chat/vocal", { modeVocal: mode.actif });
}
