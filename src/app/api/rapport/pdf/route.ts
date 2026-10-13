import { storyAffichee } from "@/server/conv-affichee";
import { rapportDe } from "@/server/donnees";
import { env } from "@/server/env";
import { metaDe } from "@/server/histoires";
import { erreur, route } from "@/server/http";
import { pdfDuRapport } from "@/server/rapport-pdf";
import { lecture, sousLaLimiteDuCompte } from "@/server/requete";

/* Les emojis à dessiner et la mise en page d’un long rapport : quelques secondes, rarement plus */
export const maxDuration = 60;

/**
 * Le rapport en PDF (« Télécharger en PDF »), pour son propriétaire seulement : ce que la lecture du rapport lui rend
 * (rapportDe, qui ne planifie rien), donc exactement son accès (débloqué, l’équipe, le mode sobre ; sinon l’aperçu
 * gratuit, le chapitre 1 et les titres des autres). Fait à la demande, jamais gardé (no-store) ni journalisé.
 * `?moi=` : qui est toi pour l’écran (le parcours de l’onglet), quand « Qui es-tu ? » n’a rien dit au serveur.
 */
export const GET = route("GET /api/rapport/pdf", async (req: Request) => {
  const g = await lecture({ session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const rapport = await rapportDe(story, utilisateur);
  /* Rien à lire encore : pas de verdict, ou une alerte dont le rapport doux s’écrit */
  if (!rapport || (rapport.alerte && !rapport.sober)) return erreur("pas_pret");
  if (!(await sousLaLimiteDuCompte(utilisateur, "pdf"))) return erreur("trop");
  const histoire = storyAffichee(story.id, metaDe(story));
  const moi = new URL(req.url).searchParams.get("moi");
  const pdf = await pdfDuRapport({
    payload: rapport,
    story: histoire,
    moi: histoire.participants.some((p) => p.id === moi) ? moi : null,
    le: new Date(),
    site: env().BLUSH_URL,
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="rapport-blush.pdf"', "cache-control": "private, no-store" },
  });
});
