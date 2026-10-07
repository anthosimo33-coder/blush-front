import { effacerBrouillon } from "@/server/cookies";
import { contexteRequete, storyCourante } from "@/server/donnees";
import { erreur, json, memeOrigine } from "@/server/http";
import { supprimerHistoire } from "@/server/histoires";

export async function GET() {
  const story = await storyCourante();
  return story ? json(story) : erreur("aucune", 404);
}

/** « Supprimer mon histoire » : tout ce qui vient de la conv est effacé, en cascade. */
export async function DELETE(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { story } = await contexteRequete();
  if (story) await supprimerHistoire(story.id);
  await effacerBrouillon();
  return json({ ok: true });
}
