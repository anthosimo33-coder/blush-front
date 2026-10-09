import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession, poserChoisie } from "@/server/cookies";
import { db, schema } from "@/server/db";
import { connexionPuis } from "@/lib/suite";

/**
 * Le lien du mail « ton rapport est prêt » : il ouvre le rapport de cette conv-là (elle devient la conv ouverte),
 * si elle est bien au compte connecté. Pas connecté (le mail ouvert dans un autre navigateur) : la connexion, qui
 * ramène ensuite à ce lien. Sinon, le rapport habituel.
 */
export async function GET(req: Request, { params }: RouteContext<"/ouvrir/[id]">) {
  const { id } = await params;
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur) return NextResponse.redirect(new URL(connexionPuis(`/ouvrir/${encodeURIComponent(id)}`), req.url));
  if (utilisateur && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const [s] = await db()
      .select({ id: schema.stories.id })
      .from(schema.stories)
      .where(and(eq(schema.stories.id, id), eq(schema.stories.userId, utilisateur.id)));
    if (s) await poserChoisie(s.id);
  }
  return NextResponse.redirect(new URL("/rapport", req.url));
}
