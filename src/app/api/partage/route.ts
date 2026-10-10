import { after } from "next/server";
import { CLES, compter } from "@/server/compteurs";
import { contexteRequete } from "@/server/donnees";
import { erreur, json, memeOrigine } from "@/server/http";
import { arreterPartage, ErreurPartage, lienDe, partager, versionImage } from "@/server/partages";

/** Le lien de partage du verdict : le lire (GET), le créer (POST, toujours le même), le désactiver (DELETE). */
async function histoire(req?: Request) {
  if (req && !memeOrigine(req)) return { reponse: erreur("origine") };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return { reponse: erreur("connexion") };
  if (!story) return { reponse: erreur("aucune") };
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
    /* Le verdict tel que le montre le lien (le prénom de l’autre masqué) : c’est lui que le texte partagé reprend */
    const { id, verdict } = await partager(story);
    /* Compté après la réponse : la feuille attend ce lien pour demander l’image story */
    after(() => compter(CLES.partageOuvert));
    /* `v` : la version de l’image story, gardée par le CDN à cette adresse (`/v/<id>/image?format=story&v=<v>`) */
    return json({ id, verdict, v: versionImage(id, verdict) });
  } catch (e) {
    if (e instanceof ErreurPartage) return erreur(e.code);
    throw e;
  }
}

export async function DELETE(req: Request) {
  const { story, reponse } = await histoire(req);
  if (!story) return reponse;
  await arreterPartage(story.id);
  return json({ id: null });
}
