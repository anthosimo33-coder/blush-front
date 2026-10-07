import { eq } from "drizzle-orm";
import { after } from "next/server";
import { executerChaine } from "@/server/analyse";
import { db, schema } from "@/server/db";
import { contexteRequete } from "@/server/donnees";
import { accesLibre } from "@/server/env";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { etatDesTaches, planifier } from "@/server/taches";
import { SUBSCRIPTIONS } from "@/mocks/daily";

export const maxDuration = 800;

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
  if (story) {
    const { rapport_plan } = await etatDesTaches(story.id, ["rapport_plan"]);
    if (!rapport_plan) await planifier(story.id, "rapport_plan");
    after(() => executerChaine(story.id));
  }
  return json(SUBSCRIPTIONS.blushplus);
}
