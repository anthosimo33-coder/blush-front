import { and, asc, eq, gt } from "drizzle-orm";
import type { DonneesRapport } from "@/server/analyse";
import { carteMoment, carteReponse } from "@/server/carte-partage";
import { dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { erreur, lireCorps } from "@/server/http";
import { LIMITES } from "@/server/limites";
import { masqueDe } from "@/server/partages";
import { garde } from "@/server/requete";
import type { BlushAnswer, Chapter } from "@/types";
import { ROUTES } from "@/types/api";

/**
 * « Partager en image » : un moment de BLUSH (une réponse du chat, la chute d’un chapitre) dessiné en story.
 * Le contenu est relu ici, dans le compte (jamais pris de la requête : pas de fausse image « askblush.com »),
 * et le prénom de l’autre est masqué (le tien reste).
 */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true, limite: { cle: "image", limite: LIMITES.imageParCompte, par: "compte" } });
  if (g instanceof Response) return g;
  const { story } = g;
  /* Une réponse du chat (son échange) ou la chute d’un chapitre (sa place) : CibleImage, src/types/api.ts */
  const c = await lireCorps(req, ROUTES["POST /api/partage/image"].corps);
  if (!c) return erreur("cible");
  const masquer = masqueDe(story);

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
    if (!toi || blush?.role !== "blush") return erreur("introuvable");
    const question = dechiffrer<{ texte: string; affiche?: string }>(toi.data);
    const r = dechiffrer<{ reponse: BlushAnswer }>(blush.data).reponse;
    if (r.kind !== "bubbles") return erreur("introuvable");
    return carteReponse({
      question: masquer((question.affiche ?? question.texte).replace(/^\(vocal\)\s*/, "")),
      bulles: [...r.bubbles.map((b) => b.text), ...(r.ask ? [r.ask] : [])].map(masquer),
    });
  }

  const [rapport] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, story.id));
  const chapitres: Chapter[] = rapport?.data ? dechiffrer<DonneesRapport>(rapport.data).chapitres : rapport?.partiel ? dechiffrer<Chapter[]>(rapport.partiel) : [];
  const chapitre = chapitres.find((ch) => ch.number === c.chapitre);
  const bloc = chapitre?.blocks[c.bloc];
  if (!chapitre || bloc?.kind !== "punchline") return erreur("introuvable");
  return carteMoment({ surtitre: masquer(`Chapitre ${chapitre.number} · ${chapitre.tocTitle}`), texte: masquer(bloc.text) });
}
