import { effacerBrouillon, effacerChoisie } from "@/server/cookies";
import { storyCourante } from "@/server/donnees";
import { erreur, repondre } from "@/server/http";
import { supprimerHistoire } from "@/server/histoires";
import { garde } from "@/server/requete";

/** L’histoire du parcours : la conv qu’on importe, sinon celle qui est ouverte. */
export async function GET() {
  const story = await storyCourante(true);
  return story ? repondre("GET /api/histoire", story) : erreur("aucune");
}

/** « Supprimer l’histoire » (celle qui est ouverte) : tout ce qui vient de la conv est effacé, en cascade. La suivante s’ouvre. */
export async function DELETE(req: Request) {
  /* Sans compte aussi : la conv importée sur cet appareil (un brouillon) */
  const g = await garde(req, { session: "facultative" });
  if (g instanceof Response) return g;
  if (g.story) await supprimerHistoire(g.story.id);
  await effacerBrouillon();
  await effacerChoisie();
  return repondre("DELETE /api/histoire", { ok: true });
}
