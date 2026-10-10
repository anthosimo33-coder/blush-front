import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { ajouterALaFiche, depuisCaptures, depuisExport, ErreurAjout, majEnCours } from "@/server/ajouts";
import { executerChaine, SUPPRIMEES_MAX, type DonneesMemoire } from "@/server/analyse";
import { imagesDe } from "@/server/captures";
import { chiffrer, dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { contexteRequete, ficheDe, memoireDe } from "@/server/donnees";
import { alerter } from "@/server/alertes";
import { ErreurTache } from "@/server/erreurs";
import { depuisPaquet, ErreurImport, type Ligne } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { avecEcheance } from "@/server/echeance";
import type { Fiche } from "@/types";

/* Lire les captures (jusqu’à une minute), puis, après la réponse, mettre la mémoire à jour (20 à 60 s) */
export const maxDuration = 300;

/**
 * Sa fiche, et si une mise à jour de la mémoire est en attente ou en cours (`updating`) : l’écran la relit toutes les
 * 3 s jusqu’à ce qu’elle ait fini. Une mise à jour restée en plan (l’instance arrêtée, ou plus le temps de la commencer
 * après la lecture des captures) repart après la réponse ; si une autre la tient, executerChaine la laisse faire.
 */
async function ficheEtMaj(story: Ligne): Promise<Fiche> {
  const [fiche, enCours] = await Promise.all([ficheDe(story), majEnCours(story.id)]);
  if (!enCours) return fiche;
  after(() => executerChaine(story.id));
  return { ...fiche, updating: true };
}

export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  return json(await ficheEtMaj(story));
}

const Faits = z
  .array(z.object({ section: z.enum(["infos", "aime", "gens", "dates", "notes"]), text: z.string().trim().min(1).max(200) }).passthrough())
  .max(60);

/**
 * Sa fiche, corrigée par l’utilisateur (la liste entière). Ce qu’il ajoute ou corrige fait foi pour la mémoire ;
 * ce qu’il supprime, elle ne le remet pas. On n’écrit que sur la mémoire qu’on a lue : si une mise à jour l’a changée
 * entre-temps, la correction se refait sur la nouvelle (rien de ce que la mise à jour a appris n’est effacé).
 */
export async function PUT(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const faits = Faits.safeParse((await corps<{ facts: unknown }>(req)).facts);
  if (!faits.success) return erreur("faits", 422);
  if (!(await sousLaLimite(`fiche:${utilisateur.id}`, LIMITES.ficheParCompte))) return erreur("trop", 429);
  for (let essai = 0; essai < 3; essai++) {
    const [ligne] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, story.id));
    const m = ligne ? dechiffrer<DonneesMemoire>(ligne.data) : null;
    if (!ligne || !m?.etat.fiche) return erreur("pas_pret", 409);
    const avant = m.etat.fiche.faits;
    const nouveaux = faits.data.map((f) => avant.find((a) => a.texte === f.text && a.section === f.section) ?? { section: f.section, texte: f.text, preuves: [], statut: "garde" as const });
    const textesAvant = new Set(avant.map((a) => a.texte));
    const textes = new Set(nouveaux.map((n) => n.texte));
    const editions = {
      parToi: [...new Set([...(m.editions?.parToi ?? []).filter((t) => textes.has(t)), ...nouveaux.filter((n) => !textesAvant.has(n.texte)).map((n) => n.texte)])],
      supprimees: [...new Set([...(m.editions?.supprimees ?? []), ...avant.filter((a) => !textes.has(a.texte)).map((a) => a.texte)])].filter((t) => !textes.has(t)).slice(-SUPPRIMEES_MAX),
    };
    const donnees: DonneesMemoire = { ...m, etat: { ...m.etat, fiche: { ...m.etat.fiche, faits: nouveaux } }, editions };
    const ecrite = await db()
      .update(schema.memories)
      .set({ data: chiffrer(donnees), version: ligne.version + 1, updatedAt: new Date() })
      .where(and(eq(schema.memories.storyId, story.id), eq(schema.memories.version, ligne.version)))
      .returning({ version: schema.memories.version });
    /* Avec l’état de la mise à jour : la fiche, en train de se relire, continue de le faire */
    if (ecrite.length) return json(await ficheEtMaj(story));
  }
  return erreur("occupe", 409);
}

/**
 * Des captures (son profil, leur conv) ou un nouvel export, pour sa fiche : BLUSH les lit et répond avec ce qu’il a lu ;
 * sa mémoire se met à jour après la réponse (ajouterALaFiche), et la fiche se relit jusqu’à ce que ce soit fait.
 */
async function traiter(req: Request) {
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
    const ajout = captures.length ? await depuisCaptures(story, memoire, await imagesDe(captures)) : await depuisExport(story, memoire, await depuisPaquet(paquet as File));
    return json(await ajouterALaFiche(story, ajout));
  } catch (e) {
    if (e instanceof ErreurAjout) return erreur(e.code, 422);
    if (e instanceof ErreurImport) return erreur("fichier", 422);
    if (e instanceof ErreurTache) {
      await alerter(`ajout à la fiche en échec`, [`Histoire ${story.id}`, `Erreur : ${e.message}`]);
      return erreur(e.message, 502);
    }
    throw e;
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export function POST(req: Request) {
  return avecEcheance(285_000, () => traiter(req));
}
