import { z } from "zod";
import { contexteRequete } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { noterEcoute } from "@/server/vocal";
import { EVENEMENTS_ECOUTE } from "@/types";

const Evenement = z.enum(EVENEMENTS_ECOUTE);

/** Un moment de l’écoute du vocal (début, fin, réécoute, fermé avant la fin), pour comparer les deux voix. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  if (!story) return erreur("aucune");
  const { evenement, position } = await corps<{ evenement: unknown; position: unknown }>(req);
  const quoi = Evenement.safeParse(evenement);
  if (!quoi.success || typeof position !== "number" || !Number.isFinite(position)) return erreur("invalide");
  /* Les chiffres de l’A/B test des voix : quelques dizaines d’écoutes par jour suffisent, pas des milliers */
  if (!(await sousLaLimite(`ecoute:${utilisateur.id}`, LIMITES.ecouteParCompte))) return json({ ok: true });
  await noterEcoute(story.id, quoi.data, position * 1000);
  return json({ ok: true });
}
