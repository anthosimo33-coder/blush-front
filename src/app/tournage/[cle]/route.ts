import { effacerTournage, poserTournage } from "@/server/cookies";
import { tournageDeLaCle } from "@/server/tournage";

/**
 * Le lien d’une conv de tournage, envoyé aux créatrices (src/server/tournage.ts) : il pose le mode tournage sur ce
 * navigateur (son cookie, 30 jours), puis la page qui l’explique. Un lien qui ne vaut rien (arrêté, mal recopié) retire
 * le mode tournage, et la page le dit. L’aperçu d’un lien par une messagerie ne fait que poser un cookie à son robot.
 * La redirection est relative : le navigateur reste sur l’adresse qu’il a ouverte, là où son cookie est posé.
 */
export async function GET(_req: Request, { params }: RouteContext<"/tournage/[cle]">) {
  const { cle } = await params;
  if (await tournageDeLaCle(cle)) await poserTournage(cle);
  else await effacerTournage();
  return new Response(null, { status: 307, headers: { Location: "/tournage" } });
}
