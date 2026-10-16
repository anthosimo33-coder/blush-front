import { effacerTournage, poserPrenomDuTournage, poserTournage } from "@/server/cookies";
import { prenomDuLien, tournageDeLaCle } from "@/server/tournage";

/**
 * Le lien d’une conv de tournage, envoyé aux créatrices (src/server/tournage.ts) : il pose le mode tournage sur ce
 * navigateur (son cookie, 30 jours), puis la page qui l’explique. Un lien qui ne vaut rien (arrêté, mal recopié) retire
 * le mode tournage, et la page le dit. L’aperçu d’un lien par une messagerie ne fait que poser un cookie à son robot.
 * `?prenom=` (facultatif, l’outil des créatrices l’ajoute) : le prénom de la créatrice, que l’export sans fichier lui
 * donne à « Qui es-tu ? » (prenomDeLaCreatrice) ; un lien sans lui garde celui d’avant.
 * La redirection est relative : le navigateur reste sur l’adresse qu’il a ouverte, là où son cookie est posé.
 */
export async function GET(req: Request, { params }: RouteContext<"/tournage/[cle]">) {
  const { cle } = await params;
  if (await tournageDeLaCle(cle)) {
    await poserTournage(cle);
    const prenom = prenomDuLien(new URL(req.url).searchParams.get("prenom"));
    if (prenom) await poserPrenomDuTournage(prenom);
  } else await effacerTournage();
  return new Response(null, { status: 307, headers: { Location: "/tournage" } });
}
