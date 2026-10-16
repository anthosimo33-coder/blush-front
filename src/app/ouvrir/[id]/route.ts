import { NextResponse } from "next/server";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession, poserChoisie } from "@/server/cookies";
import { estConvDuCompte } from "@/server/depot";
import { UUID } from "@/server/histoires";
import { connexionPuis } from "@/lib/suite";

/**
 * Le lien des mails « ton rapport est prêt » et « Ton rapport t’attend » (la relance, `?paiement=1`) : il ouvre le rapport
 * de cette conv-là (elle devient la conv ouverte), si elle est bien au compte connecté ; la relance, sur la feuille de
 * paiement. Pas connecté (le mail ouvert dans un autre navigateur) : la connexion, qui ramène ensuite à ce lien. Sinon,
 * le rapport habituel.
 */
export async function GET(req: Request, { params }: RouteContext<"/ouvrir/[id]">) {
  const { id } = await params;
  const paiement = new URL(req.url).searchParams.get("paiement") === "1";
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur) return NextResponse.redirect(new URL(connexionPuis(`/ouvrir/${encodeURIComponent(id)}${paiement ? "?paiement=1" : ""}`), req.url));
  if (UUID.test(id) && (await estConvDuCompte(id, utilisateur.id))) await poserChoisie(id);
  return NextResponse.redirect(new URL(paiement ? "/rapport?paiement=1" : "/rapport", req.url));
}
