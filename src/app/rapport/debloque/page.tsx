import type { Metadata } from "next";
import { CHAPITRES_OFFERTS, NB_CHAPITRES, PREMIER_PAYANT } from "@/contenu/chapitres";
import { suiteSure } from "@/lib/suite";
import { getReport, getStory } from "@/services/serveur";
import { UnlockedScreen } from "./UnlockedScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "C’est débloqué" };

export default async function Page({ searchParams }: PageProps<"/rapport/debloque">) {
  const sp = await searchParams;
  const offer = sp.offre === "rapport" ? "rapport" : "blushplus";
  /* Où reprendre après : seulement une adresse interne */
  const next = suiteSure(sp.suite);
  /*
   * Ce que le déblocage ouvre : les chapitres du rapport moins ceux qui étaient offerts (src/contenu/chapitres.ts), et
   * la lecture reprend au premier payant. Et le pronom de l’autre, pour « ce qu’elle t’a dit ».
   */
  const [payload, story] = await Promise.all([getReport(), getStory()]);
  const chapitres = payload?.report.chapters ?? [];
  /* Un rapport écrit peut avoir moins de huit chapitres (une moitié rendue incomplète) : on compte les siens */
  const restants = Math.max(1, (chapitres.length || NB_CHAPITRES) - CHAPITRES_OFFERTS);
  const autre = story ? (story.participants.find((p) => story.me && p.id !== story.me) ?? story.participants[1]).pronoun : undefined;
  return (
    <>
      <ConvDeLaPage />
      <UnlockedScreen offer={offer} next={next} restants={restants} reprise={PREMIER_PAYANT} autre={autre} />
    </>
  );
}
