import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { CHAPITRES_OFFERTS, NB_CHAPITRES, PREMIER_PAYANT } from "@/contenu/chapitres";
import { suiteSure } from "@/lib/suite";
import { suiteQuiAttend } from "@/server/ecrans-gardes";
import { getAchatPaye, getReport } from "@/services/serveur";
import { EcranDebloque } from "./EcranDebloque";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "C’est débloqué" };

/*
 * La page lit le rapport par getReport, qui lance ce que le déblocage ouvre (le rapport, la mémoire) s’il n’est pas déjà
 * parti avec la livraison, et le laisse tourner après la réponse : la durée de la fonction est celle de la chaîne.
 * Elle dit ce qu’a ouvert l’achat payé de `?achat=` (le retour du paiement y mène, et le rapport d’avance utilisé),
 * jamais un achat d’un autre compte, ni pas encore payé, ni un achat qui n’a ouvert aucune conv (des bulles, un rapport
 * d’avance qui attend) : sans lui, le rapport.
 */
export const maxDuration = 800;

export default async function Page({ searchParams }: PageProps<"/rapport/debloque">) {
  /* L’heure du rendu, avant les lectures : le compte posé par PageDeConv en part */
  const rendu = heureDuRendu();
  const sp = await searchParams;
  const achat = typeof sp.achat === "string" ? await getAchatPaye(sp.achat) : null;
  if (!achat?.storyId) redirect("/rapport");
  /* Où reprendre après : seulement une adresse interne */
  const demandee = suiteSure(sp.suite);
  /*
   * Ce que le déblocage ouvre : les chapitres du rapport moins ceux qui étaient offerts (src/contenu/chapitres.ts), et
   * la lecture reprend au premier payant.
   */
  const payload = await getReport();
  const chapitres = payload?.report.chapters ?? [];
  /*
   * Payée avant d’être lue (le paywall d’abord) : pas encore de verdict, le rapport entier s’ouvre, et la suite est la
   * lecture qui commence (/lecture), puis le verdict
   */
  const avantLecture = !payload;
  const next = demandee ?? (avantLecture ? "/lecture" : null);
  /* Un rapport écrit peut avoir moins de huit chapitres (une moitié rendue incomplète) : on compte les siens */
  const restants = avantLecture ? NB_CHAPITRES : Math.max(1, (chapitres.length || NB_CHAPITRES) - CHAPITRES_OFFERTS);
  const offerts = avantLecture ? 0 : CHAPITRES_OFFERTS;
  return (
    <PageDeConv rendu={rendu}>
      <EcranDebloque
        achat={achat.id}
        offre={achat.offre}
        bulles={achat.bulles}
        next={next}
        restants={restants}
        total={restants + offerts}
        reprise={avantLecture ? 1 : PREMIER_PAYANT}
        avecLeDebut={avantLecture && (await suiteQuiAttend(achat.storyId))}
      />
    </PageDeConv>
  );
}
