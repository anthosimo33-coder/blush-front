import { ajouterALaFiche, depuisCaptures, depuisExport, ficheEtMaj } from "@/server/ajouts";
import { imagesDe } from "@/server/captures";
import { modifierMemoire } from "@/server/depot";
import { fusionnerFaits } from "@/server/fiche";
import { depuisPaquet } from "@/server/import";
import { memoireAssuree } from "@/server/pipeline";
import { erreur, lireCorps, repondre, reponseErreur, route } from "@/server/http";
import { garde, lecture, sousLaLimiteDuCompte } from "@/server/requete";
import { avecEcheance, echeancePour } from "@/server/echeance";
import { ROUTES } from "@/types/api";

/* Lire les captures (jusqu’à une minute), puis, après la réponse, mettre la mémoire à jour (20 à 60 s) */
export const maxDuration = 300;

/**
 * Sa fiche, et si une mise à jour de la mémoire tourne (ficheEtMaj, src/server/ajouts.ts). Comme la corriger ou y ajouter
 * des captures : à un client seulement (un rapport débloqué, un achat payé, ou l’équipe : 402 « acces » sinon, S-26).
 */
export const GET = route("GET /api/fiche", async () => {
  const g = await lecture({ session: "requise", client: true, histoire: true });
  return g instanceof Response ? g : repondre("GET /api/fiche", await ficheEtMaj(g.story));
});

/**
 * Sa fiche, corrigée par l’utilisateur (la liste entière). Ce qu’il ajoute ou corrige fait foi pour la mémoire ;
 * ce qu’il supprime, elle ne le remet pas (fusionnerFaits, src/server/fiche.ts). On n’écrit que sur la mémoire qu’on a
 * lue : si une mise à jour l’a changée entre-temps, la correction se refait sur la nouvelle (rien de ce que la mise à
 * jour a appris n’est effacé). À un client seulement, comme la lire.
 */
export const PUT = route("PUT /api/fiche", async (req: Request) => {
  const g = await garde(req, { session: "requise", client: true, histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const corrigee = await lireCorps(req, ROUTES["PUT /api/fiche"].corps);
  if (!corrigee) return erreur("faits");
  if (!(await sousLaLimiteDuCompte(utilisateur, "fiche"))) return erreur("trop");
  /* Sans mémoire encore (la vraie en échec, ou pas encore écrite) : celle de secours, que la correction complète */
  await memoireAssuree(story);
  /* Trois essais : une mise à jour de la mémoire qui finit pendant la correction ne la fait pas échouer */
  const modifiee = await modifierMemoire(story.id, (m) => fusionnerFaits(m, corrigee.facts), { essais: 3 });
  if (modifiee === "occupee") return erreur("occupe");
  if (modifiee !== "ecrite") return erreur("pas_pret");
  /* Avec l’état de la mise à jour : la fiche, en train de se relire, continue de le faire */
  return repondre("PUT /api/fiche", await ficheEtMaj(story));
});

/**
 * Des captures (son profil, leur conv) ou un nouvel export, pour sa fiche : BLUSH les lit et répond avec ce qu’il a lu ;
 * sa mémoire se met à jour après la réponse (ajouterALaFiche), et la fiche se relit jusqu’à ce que ce soit fait.
 * Sans bulle : la fiche est offerte (COUT_EN_BULLES, src/contenu/offres.ts, et les conditions de vente), seule la limite
 * « ajout » du compte borne ces lectures, alors que le même envoi coûte 3 bulles dans le chat : un choix du produit
 * (15/10), la fiche reste offerte.
 */
async function traiter(req: Request) {
  const g = await garde(req, { session: "requise", client: true, histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const fd = await req.formData().catch(() => null);
  const captures = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const paquet = fd?.get("export");
  if (!captures.length && !(paquet instanceof File)) return erreur("fichier");
  if (!(await sousLaLimiteDuCompte(utilisateur, "ajout"))) return erreur("trop");
  const memoire = await memoireAssuree(story);
  if (!memoire) return erreur("pas_pret");
  try {
    const ajout = captures.length ? await depuisCaptures(story, memoire, await imagesDe(captures)) : await depuisExport(story, memoire, await depuisPaquet(paquet as File));
    return repondre("POST /api/fiche", await ajouterALaFiche(story, ajout));
  } catch (e) {
    /* Le code interne part à l’équipe ; le navigateur n’apprend que le refus ou la panne */
    return reponseErreur(e, { route: "POST /api/fiche", alerte: { sujet: "ajout à la fiche en échec", lignes: [`Histoire ${story.id}`] } });
  }
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export const POST = route("POST /api/fiche", async (req: Request) => {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
});
