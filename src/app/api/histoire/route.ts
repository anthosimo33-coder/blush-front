import { effacerBrouillon, effacerChoisie } from "@/server/cookies";
import { contexteRequete, storyCourante } from "@/server/donnees";
import { erreur, memeOrigine, repondre } from "@/server/http";
import { supprimerHistoire } from "@/server/histoires";

/** L’histoire du parcours : la conv qu’on importe, sinon celle qui est ouverte. */
export async function GET() {
  const story = await storyCourante(true);
  return story ? repondre("GET /api/histoire", story) : erreur("aucune");
}

/** « Supprimer l’histoire » (celle qui est ouverte) : tout ce qui vient de la conv est effacé, en cascade. La suivante s’ouvre. */
export async function DELETE(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { story } = await contexteRequete();
  if (story) await supprimerHistoire(story.id);
  await effacerBrouillon();
  await effacerChoisie();
  return repondre("DELETE /api/histoire", { ok: true });
}
