import { after } from "next/server";
import { CLES, compter } from "@/server/compteurs";
import { repondre, route } from "@/server/http";
import { arreterPartage, partager, versionImage } from "@/server/partages";
import { garde } from "@/server/requete";
import { noterAuFil } from "@/server/visites";

/*
 * Le lien de partage du verdict : le créer (POST, toujours le même), le désactiver (DELETE). La feuille de partage reçoit
 * le lien en le créant : rien ne le relit. Pas encore de verdict, ou une alerte de danger : le code de l’ErreurPartage
 * (l’enveloppe `route`, src/server/http.ts).
 */

export const POST = route("POST /api/partage", async (req: Request) => {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { story } = g;
  /* Le verdict tel que le montre le lien (le prénom de l’autre masqué) : c’est lui que le texte partagé reprend */
  const { id, verdict } = await partager(story);
  /* Compté après la réponse : la feuille attend ce lien pour demander l’image story */
  after(() => Promise.all([compter(CLES.partageOuvert), noterAuFil(req, { genre: "partage" })]));
  /*
   * `v` : la version de l’image story, gardée par le CDN à cette adresse (`/v/<id>/image?format=story&v=<v>`). Du
   * verdict, ce que la feuille montre et reprend dans le texte partagé (VerdictMontre), pas son sous-titre
   */
  return repondre("POST /api/partage", { id, verdict: { emoji: verdict.emoji, title: verdict.title }, v: versionImage(id, verdict) });
});

export const DELETE = route("DELETE /api/partage", async (req: Request) => {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  await arreterPartage(g.story.id);
  return repondre("DELETE /api/partage", { id: null });
});
