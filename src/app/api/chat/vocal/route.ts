import { eq } from "drizzle-orm";
import { contexteRequete } from "@/server/donnees";
import { db, schema } from "@/server/db";
import { corps, erreur, json, memeOrigine } from "@/server/http";

/** Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const { actif } = await corps<{ actif: boolean }>(req);
  if (typeof actif !== "boolean") return erreur("invalide", 422);
  await db().update(schema.stories).set({ chatVocal: actif }).where(eq(schema.stories.id, story.id));
  return json({ modeVocal: actif });
}
