import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { CHAPITRES_OFFERTS, NB_CHAPITRES, PREMIER_PAYANT } from "@/contenu/chapitres";
import { CATALOGUE } from "@/contenu/offres";
import { suiteSure } from "@/lib/suite";
import { getAchatPaye, getReport } from "@/services/serveur";
import { UnlockedScreen } from "./UnlockedScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "C’est débloqué" };

/*
 * La page lit le rapport par getReport, qui lance ce que le déblocage ouvre (le rapport, la mémoire) s’il n’est pas déjà
 * parti avec la livraison, et le laisse tourner après la réponse : la durée de la fonction est celle de la chaîne.
 * Elle dit ce qu’a ouvert l’achat payé de `?achat=` (le retour du paiement y mène), jamais un achat d’un autre compte,
 * ni pas encore payé : sans lui, le rapport.
 */
export const maxDuration = 300;

export default async function Page({ searchParams }: PageProps<"/rapport/debloque">) {
  /* L’heure du rendu, avant les lectures : le compte posé par PageDeConv en part */
  const rendu = heureDuRendu();
  const sp = await searchParams;
  const achat = typeof sp.achat === "string" ? await getAchatPaye(sp.achat) : null;
  if (!achat || !CATALOGUE[achat.offre].conv) redirect("/rapport");
  /* Où reprendre après : seulement une adresse interne */
  const next = suiteSure(sp.suite);
  /*
   * Ce que le déblocage ouvre : les chapitres du rapport moins ceux qui étaient offerts (src/contenu/chapitres.ts), et
   * la lecture reprend au premier payant.
   */
  const payload = await getReport();
  const chapitres = payload?.report.chapters ?? [];
  /* Un rapport écrit peut avoir moins de huit chapitres (une moitié rendue incomplète) : on compte les siens */
  const restants = Math.max(1, (chapitres.length || NB_CHAPITRES) - CHAPITRES_OFFERTS);
  return (
    <PageDeConv rendu={rendu}>
      <UnlockedScreen achat={achat.id} offre={achat.offre} bulles={achat.bulles} next={next} restants={restants} total={restants + CHAPITRES_OFFERTS} reprise={PREMIER_PAYANT} />
    </PageDeConv>
  );
}
