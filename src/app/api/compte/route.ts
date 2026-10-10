import { eq } from "drizzle-orm";
import { effacerBrouillon, effacerSession } from "@/server/cookies";
import { db, schema } from "@/server/db";
import { compteDe, contexteRequete } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";

export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  return utilisateur ? json(compteDe(utilisateur, story)) : erreur("connexion");
}

/** Mettre BLUSH en pause (ou le reprendre). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  const { paused } = await corps<{ paused: boolean }>(req);
  await db().update(schema.users).set({ paused: paused === true }).where(eq(schema.users.id, utilisateur.id));
  return json({ ok: true });
}

/** « Supprimer mon compte » : le compte, ses sessions et ses histoires, en cascade. */
export async function DELETE(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur } = await contexteRequete();
  if (utilisateur) await db().delete(schema.users).where(eq(schema.users.id, utilisateur.id));
  await effacerSession();
  await effacerBrouillon();
  return json({ ok: true });
}
