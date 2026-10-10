import { and, eq } from "drizzle-orm";
import { dechiffrerOctets } from "@/server/chiffrement";
import { utilisateurCourant } from "@/server/donnees";
import { db, schema } from "@/server/db";
import { erreur, reponseAudio } from "@/server/http";

/** L’audio d’une réponse du chat dite en vocal, si elle est dans une conv de son compte (le compte seul : pas besoin de relire l’histoire). */
export async function GET(req: Request, { params }: RouteContext<"/api/vocal/chat/[id]">) {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return erreur("connexion", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return erreur("introuvable", 404);
  const [v] = await db()
    .select({ audio: schema.chatVocals.audio })
    .from(schema.chatVocals)
    .innerJoin(schema.stories, eq(schema.stories.id, schema.chatVocals.storyId))
    .where(and(eq(schema.chatVocals.id, id), eq(schema.stories.userId, utilisateur.id)));
  if (!v) return erreur("introuvable", 404);
  return reponseAudio(req, dechiffrerOctets(v.audio));
}
