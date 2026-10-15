import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { estAdmin } from "@/server/env";
import { contexte } from "@/server/requete";
import { convsCandidates, tournagesAffiches } from "@/server/tournage";
import { PageTournage } from "../PageTournage";

export const metadata: Metadata = { title: "Tournage · Admin" };

/* Les dates de la page, à l’heure de Paris (lues sur le serveur : le navigateur n’a pas à les refaire) */
const JOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });
const JOUR_ET_HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Le mode tournage (src/server/tournage.ts) dans /admin, réservé aux emails de BLUSH_ADMINS comme le tableau de bord :
 * créer une conv de tournage depuis une conv de son propre compte, envoyer son lien, l’arrêter.
 */
export default async function Page() {
  const { utilisateur } = await contexte();
  if (!utilisateur || !estAdmin(utilisateur.email)) notFound();
  const [tournages, convs] = await Promise.all([tournagesAffiches(), convsCandidates(utilisateur.id)]);
  return (
    <PageTournage
      tournages={tournages.map((t) => ({ ...t, creeLe: JOUR.format(new Date(t.creeLe)), derniere: t.derniere ? JOUR_ET_HEURE.format(new Date(t.derniere)) : null }))}
      convs={convs.map((c) => ({ ...c, le: JOUR.format(new Date(c.le)) }))}
    />
  );
}
