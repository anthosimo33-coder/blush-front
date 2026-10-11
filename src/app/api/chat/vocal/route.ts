import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { erreur, lireCorps, repondre } from "@/server/http";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/** Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const mode = await lireCorps(req, ROUTES["POST /api/chat/vocal"].corps);
  if (!mode) return erreur("invalide");
  await db().update(schema.stories).set({ chatVocal: mode.actif }).where(eq(schema.stories.id, g.story.id));
  return repondre("POST /api/chat/vocal", { modeVocal: mode.actif });
}
