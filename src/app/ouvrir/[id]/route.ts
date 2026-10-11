import { NextResponse } from "next/server";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession, poserChoisie } from "@/server/cookies";
import { estConvDuCompte } from "@/server/depot";
import { UUID } from "@/server/histoires";
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
  if (UUID.test(id) && (await estConvDuCompte(id, utilisateur.id))) await poserChoisie(id);
  return NextResponse.redirect(new URL("/rapport", req.url));
}
