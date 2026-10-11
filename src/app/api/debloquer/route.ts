import { eq } from "drizzle-orm";
import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { db, schema } from "@/server/db";
import { assurerLaSuite, contexteRequete } from "@/server/donnees";
import { accesLibre } from "@/server/env";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { SUBSCRIPTIONS } from "@/contenu/offres";
import { peut } from "@/lib/acces";
import { ROUTES } from "@/types/api";

export const maxDuration = 300;

/**
 * Débloquer le rapport. v1, sans paiement : seulement pour les emails de la bêta (BLUSH_ACCES_LIBRE).
 * Le rapport, puis la mémoire, s’écrivent après la réponse.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  /* Une offre qui n’existe pas : « offre » (laquelle, la v1 ne s’en sert pas encore : tout débloque BLUSH+) */
  if (!(await lireCorps(req, ROUTES["POST /api/debloquer"].corps))) return erreur("offre");
  if (!peut(utilisateur.plan, "rapport")) {
    if (!accesLibre(utilisateur.email)) return erreur("bientot");
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, utilisateur.id));
  }
  /* Le rapport s’il n’a jamais été lancé, ou la mémoire d’un rapport sobre déjà offert : ce qui manque part, une seule fois */
  if (story) {
    await assurerLaSuite(story, true);
    after(() => executerChaine(story.id));
  }
  return repondre("POST /api/debloquer", SUBSCRIPTIONS.blushplus);
}
