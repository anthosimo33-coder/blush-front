import { effacerBrouillon, effacerChoisie } from "@/server/cookies";
import { erreur, repondre, route } from "@/server/http";
import { metaDe, supprimerHistoire } from "@/server/histoires";
import { storyAffichee } from "@/server/conv-affichee";
import { garde, lecture } from "@/server/requete";

/** L’histoire du parcours : la conv qu’on importe, sinon celle qui est ouverte. */
export const GET = route("GET /api/histoire", async () => {
  const g = await lecture({ session: "facultative", parcours: true });
  if (g instanceof Response) return g;
  return g.story ? repondre("GET /api/histoire", storyAffichee(g.story.id, metaDe(g.story))) : erreur("aucune");
});

/** « Supprimer l’histoire » (celle qui est ouverte) : tout ce qui vient de la conv est effacé, en cascade. La suivante s’ouvre. */
export const DELETE = route("DELETE /api/histoire", async (req: Request) => {
  /* Sans compte aussi : la conv importée sur cet appareil (un brouillon) */
  const g = await garde(req, { session: "facultative" });
  if (g instanceof Response) return g;
  if (g.story) await supprimerHistoire(g.story.id);
  await effacerBrouillon();
  await effacerChoisie();
  return repondre("DELETE /api/histoire", { ok: true });
});
