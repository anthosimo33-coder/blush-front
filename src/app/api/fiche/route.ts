import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DonneesMemoire } from "@/server/analyse";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { contexteRequete, ficheDe, memoireDe } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";

export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  return json(await ficheDe(story));
}

const Faits = z
  .array(z.object({ section: z.enum(["infos", "aime", "gens", "dates", "notes"]), text: z.string().trim().min(1).max(200) }).passthrough())
  .max(60);

/**
 * Sa fiche, corrigée par l’utilisateur (la liste entière). Ce qu’il ajoute ou corrige fait foi pour la mémoire ;
 * ce qu’il supprime, elle ne le remet pas.
 */
export async function PUT(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const faits = Faits.safeParse((await corps<{ facts: unknown }>(req)).facts);
  if (!faits.success) return erreur("faits", 422);
  const m = await memoireDe(story.id);
  if (!m?.etat.fiche) return erreur("pas_pret", 409);
  const avant = m.etat.fiche.faits;
  const nouveaux = faits.data.map((f) => avant.find((a) => a.texte === f.text && a.section === f.section) ?? { section: f.section, texte: f.text, preuves: [], statut: "garde" as const });
  const textesAvant = new Set(avant.map((a) => a.texte));
  const textes = new Set(nouveaux.map((n) => n.texte));
  const editions = {
    parToi: [...new Set([...(m.editions?.parToi ?? []).filter((t) => textes.has(t)), ...nouveaux.filter((n) => !textesAvant.has(n.texte)).map((n) => n.texte)])],
    supprimees: [...new Set([...(m.editions?.supprimees ?? []), ...avant.filter((a) => !textes.has(a.texte)).map((a) => a.texte)])].filter((t) => !textes.has(t)),
  };
  const donnees: DonneesMemoire = { ...m, etat: { ...m.etat, fiche: { ...m.etat.fiche, faits: nouveaux } }, editions };
  await db().update(schema.memories).set({ data: chiffrer(donnees), updatedAt: new Date() }).where(eq(schema.memories.storyId, story.id));
  return json(await ficheDe(story));
}
