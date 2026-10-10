import { eq } from "drizzle-orm";
import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { db, schema } from "@/server/db";
import { assurerLaSuite, contexteRequete } from "@/server/donnees";
import { accesLibre } from "@/server/env";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { SUBSCRIPTIONS } from "@/contenu/offres";

export const maxDuration = 300;

/**
 * Débloquer le rapport. v1, sans paiement : seulement pour les emails de la bêta (BLUSH_ACCES_LIBRE).
 * Le rapport, puis la mémoire, s’écrivent après la réponse.
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  const { offre } = await corps<{ offre: "rapport" | "blushplus" }>(req);
  if (offre !== "rapport" && offre !== "blushplus") return erreur("offre", 422);
  if (utilisateur.plan === "gratuit") {
    if (!accesLibre(utilisateur.email)) return erreur("bientot", 402);
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, utilisateur.id));
  }
  /* Le rapport s’il n’a jamais été lancé, ou la mémoire d’un rapport sobre déjà offert : ce qui manque part, une seule fois */
  if (story) {
    await assurerLaSuite(story, true);
    after(() => executerChaine(story.id));
  }
  return json(SUBSCRIPTIONS.blushplus);
}
