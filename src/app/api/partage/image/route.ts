import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { DonneesRapport } from "@/server/analyse";
import { carteMoment, carteReponse } from "@/server/carte-partage";
import { dechiffrer } from "@/server/chiffrement";
import { CLES, compter } from "@/server/compteurs";
import { db, schema } from "@/server/db";
import { contexteRequete } from "@/server/donnees";
import { metaDe } from "@/server/histoires";
import { erreur, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { masquerPrenoms } from "@/server/partages";
import type { BlushAnswer, Chapter } from "@/types";

const Cible = z.discriminatedUnion("type", [
  /* Une réponse de BLUSH dans le chat : l’échange (l’id de ton message) */
  z.object({ type: z.literal("reponse"), echange: z.number().int().positive() }),
  /* La chute d’un chapitre du rapport : le chapitre, et la place du bloc dedans */
  z.object({ type: z.literal("moment"), chapitre: z.number().int().min(1).max(20), bloc: z.number().int().min(0).max(80) }),
]);

/**
 * « Partager en image » : un moment de BLUSH (une réponse du chat, la chute d’un chapitre) dessiné en story.
 * Le contenu est relu ici, dans le compte (jamais pris de la requête : pas de fausse image « askblush.com »),
 * et les prénoms sont masqués.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  if (!(await sousLaLimite(`image:${utilisateur.id}`, LIMITES.imageParCompte))) return erreur("trop", 429);
  const cible = Cible.safeParse(await req.json().catch(() => null));
  if (!cible.success) return erreur("cible", 422);
  const prenoms = metaDe(story).participants.flatMap((p) => [p.prenom, p.nom]);
  const masquer = (t: string) => masquerPrenoms(t, prenoms);
  const c = cible.data;

  if (c.type === "reponse") {
    const [toi] = await db()
      .select()
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.id, c.echange), eq(schema.chatMessages.storyId, story.id), eq(schema.chatMessages.role, "toi")));
    const [blush] = toi
      ? await db()
          .select()
          .from(schema.chatMessages)
          .where(and(eq(schema.chatMessages.storyId, story.id), gt(schema.chatMessages.id, toi.id)))
          .orderBy(asc(schema.chatMessages.id))
          .limit(1)
      : [];
    if (!toi || blush?.role !== "blush") return erreur("introuvable", 404);
    const question = dechiffrer<{ texte: string; affiche?: string }>(toi.data);
    const r = dechiffrer<{ reponse: BlushAnswer }>(blush.data).reponse;
    if (r.kind !== "bubbles") return erreur("introuvable", 404);
    await compter(CLES.imagePartagee);
    return carteReponse({
      question: masquer((question.affiche ?? question.texte).replace(/^\(vocal\)\s*/, "")),
      bulles: [...r.bubbles.map((b) => b.text), ...(r.ask ? [r.ask] : [])].map(masquer),
    });
  }

  const [rapport] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, story.id));
  const chapitres: Chapter[] = rapport?.data ? dechiffrer<DonneesRapport>(rapport.data).chapitres : rapport?.partiel ? dechiffrer<Chapter[]>(rapport.partiel) : [];
  const chapitre = chapitres.find((ch) => ch.number === c.chapitre);
  const bloc = chapitre?.blocks[c.bloc];
  if (!chapitre || bloc?.kind !== "punchline") return erreur("introuvable", 404);
  await compter(CLES.imagePartagee);
  return carteMoment({ surtitre: masquer(`Chapitre ${chapitre.number} · ${chapitre.tocTitle}`), texte: masquer(bloc.text) });
}
