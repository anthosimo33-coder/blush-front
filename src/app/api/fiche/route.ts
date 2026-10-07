import { eq } from "drizzle-orm";
import { z } from "zod";
import { ajouterALaFiche, depuisCaptures, depuisExport, ErreurAjout } from "@/server/ajouts";
import type { DonneesMemoire } from "@/server/analyse";
import { imagesDe } from "@/server/captures";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { contexteRequete, ficheDe, memoireDe } from "@/server/donnees";
import { ErreurTache } from "@/server/erreurs";
import { depuisPaquet, ErreurImport } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";

/* Lire les captures, puis mettre la mémoire à jour : jusqu’à deux minutes */
export const maxDuration = 300;

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

/**
 * Des captures (son profil, leur conv) ou un nouvel export, pour sa fiche : BLUSH les lit, met sa mémoire à jour
 * tout de suite, et renvoie la fiche avec les infos qui viennent d’arriver.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (utilisateur.plan !== "blushplus") return erreur("acces", 402);
  if (!story) return erreur("aucune", 404);
  const fd = await req.formData().catch(() => null);
  const captures = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const paquet = fd?.get("export");
  if (!captures.length && !(paquet instanceof File)) return erreur("fichier", 422);
  if (!(await sousLaLimite(`ajout:${utilisateur.id}`, LIMITES.ajoutParCompte))) return erreur("trop", 429);
  const memoire = await memoireDe(story.id);
  if (!memoire?.etat.fiche) return erreur("pas_pret", 409);
  try {
    const avant = new Set((await ficheDe(story)).facts.map((f) => f.text));
    const ajout = captures.length ? await depuisCaptures(story, memoire, await imagesDe(captures)) : await depuisExport(story, memoire, await depuisPaquet(paquet as File));
    return json(await ajouterALaFiche(story, avant, ajout));
  } catch (e) {
    if (e instanceof ErreurAjout) return erreur(e.code, 422);
    if (e instanceof ErreurImport) return erreur("fichier", 422);
    if (e instanceof ErreurTache) return erreur(e.message, 502);
    throw e;
  }
}
