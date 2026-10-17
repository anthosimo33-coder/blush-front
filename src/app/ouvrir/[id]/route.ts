import { NextResponse } from "next/server";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession, poserChoisie } from "@/server/cookies";
import { compterUnClicDeMail } from "@/server/compteurs";
import { estConvDuCompte } from "@/server/depot";
import { UUID } from "@/server/histoires";
import { estUnMail } from "@/server/sequences";
import { connexionPuis } from "@/lib/suite";

/** Le texte qu’un bouton de mail tape d’avance dans le chat (`?dire=`), au plus : au-delà, il est ignoré. */
const DIRE_MAX = 200;

/**
 * Le lien des mails : il ouvre cette conv-là (elle devient la conv ouverte), si elle est bien au compte connecté, puis :
 * - son rapport (« ton rapport est prêt », le vocal des séquences) ;
 * - la feuille de paiement (la relance « Ton rapport t’attend », `?paiement=1`) ;
 * - le chat, un texte déjà tapé dans le champ (les boutons à une touche des séquences, `?dire=…`, jamais envoyé seul) ;
 * - le chat, la recharge ouverte (les mails des bulles, `?recharger=1`) ;
 * - la page d’une nouvelle conv (les offres gardées, après un 🧊 : `?nouvelle=1`) ;
 * - son lien de parrainage, à partager (`?parrainage=1`).
 * Un bouton d’un mail des séquences porte sa clé (`?m=`) : le clic est compté (/admin).
 * Pas connecté (le mail ouvert dans un autre navigateur) : la connexion, qui ramène ensuite à ce lien. Sinon, le rapport
 * habituel.
 */
export async function GET(req: Request, { params }: RouteContext<"/ouvrir/[id]">) {
  const { id } = await params;
  const p = new URL(req.url).searchParams;
  const dire = p.get("dire");
  /* Un bouton d’un mail des séquences : compté (une fois connecté, pour ne pas compter deux fois l’aller-retour de la connexion) */
  const mail = p.get("m");
  const suite =
    p.get("paiement") === "1"
      ? "/rapport?paiement=1"
      : p.get("nouvelle") === "1"
        ? "/commencer"
        : p.get("parrainage") === "1"
          ? "/parrainage"
          : p.get("recharger") === "1"
            ? "/app?recharger=1"
            : dire !== null && dire.length <= DIRE_MAX
              ? `/app?dire=${encodeURIComponent(dire)}`
              : "/rapport";
  /* Vers une nouvelle conv (S2 : un compte sans conv, peut-être ouvert ailleurs) : pas besoin d’être connecté */
  if (suite === "/commencer") {
    if (estUnMail(mail)) await compterUnClicDeMail(mail);
    return NextResponse.redirect(new URL(suite, req.url));
  }
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur) {
    const ici = new URL(req.url);
    return NextResponse.redirect(new URL(connexionPuis(`/ouvrir/${encodeURIComponent(id)}${ici.search}`), req.url));
  }
  if (estUnMail(mail)) await compterUnClicDeMail(mail);
  if (UUID.test(id) && (await estConvDuCompte(id, utilisateur.id))) await poserChoisie(id);
  return NextResponse.redirect(new URL(suite, req.url));
}
