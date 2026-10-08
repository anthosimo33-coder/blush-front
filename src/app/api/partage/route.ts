import { CLES, compter } from "@/server/compteurs";
import { contexteRequete } from "@/server/donnees";
import { erreur, json, memeOrigine } from "@/server/http";
import { arreterPartage, ErreurPartage, lienDe, partagerVerdict } from "@/server/partages";

/** Le lien de partage du verdict : le lire (GET), le créer (POST, toujours le même), le désactiver (DELETE). */
async function histoire(req?: Request) {
  if (req && !memeOrigine(req)) return { reponse: erreur("origine", 403) };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return { reponse: erreur("connexion", 401) };
  if (!story) return { reponse: erreur("aucune", 404) };
  return { story };
}

export async function GET() {
  const { story, reponse } = await histoire();
  if (!story) return reponse;
  return json({ id: await lienDe(story.id) });
}

export async function POST(req: Request) {
  const { story, reponse } = await histoire(req);
  if (!story) return reponse;
  try {
    const id = await partagerVerdict(story);
    await compter(CLES.partageOuvert);
    return json({ id });
  } catch (e) {
    if (e instanceof ErreurPartage) return erreur(e.code, 409);
    throw e;
  }
}

export async function DELETE(req: Request) {
  const { story, reponse } = await histoire(req);
  if (!story) return reponse;
  await arreterPartage(story.id);
  return json({ id: null });
}
