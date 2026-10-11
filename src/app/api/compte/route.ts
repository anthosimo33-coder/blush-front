import { eq } from "drizzle-orm";
import { oublierCetAppareil } from "@/server/cookies";
import { db, schema } from "@/server/db";
import { compteDe, contexteRequete } from "@/server/donnees";
import { erreur, lireCorps, memeOrigine, OUBLIER_LE_NAVIGATEUR, repondre } from "@/server/http";
import { ROUTES } from "@/types/api";

export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  return utilisateur ? repondre("GET /api/compte", compteDe(utilisateur, story)) : erreur("connexion");
}

/** Mettre BLUSH en pause (ou le reprendre). Un corps mal formé le reprend. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  const paused = (await lireCorps(req, ROUTES["POST /api/compte"].corps))?.paused === true;
  await db().update(schema.users).set({ paused }).where(eq(schema.users.id, utilisateur.id));
  return repondre("POST /api/compte", { ok: true });
}

/**
 * « Tout effacer » : le compte, ses sessions (sur tous ses appareils) et ses histoires, en cascade. Ce navigateur oublie
 * aussi ce qu’il gardait de BLUSH, comme à la déconnexion.
 */
export async function DELETE(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur } = await contexteRequete();
  if (utilisateur) await db().delete(schema.users).where(eq(schema.users.id, utilisateur.id));
  await oublierCetAppareil();
  return repondre("DELETE /api/compte", { ok: true }, 200, OUBLIER_LE_NAVIGATEUR);
}
