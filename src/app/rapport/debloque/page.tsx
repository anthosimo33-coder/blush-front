import type { Metadata } from "next";
import { suiteSure } from "@/lib/suite";
import { getReport, getStory } from "@/services/serveur";
import { UnlockedScreen } from "./UnlockedScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "C’est débloqué" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const offer = sp.offre === "rapport" ? "rapport" : "blushplus";
  /* Où reprendre après : seulement une adresse interne */
  const next = suiteSure(sp.suite);
  /*
   * Ce que le déblocage ouvre, d’après le rapport : seul le verdict (chapitre 1) était offert, la lecture reprend au
   * chapitre 2. Et le pronom de l’autre, pour « ce qu’elle t’a dit ».
   */
  const [payload, story] = await Promise.all([getReport(), getStory()]);
  const chapitres = payload?.report.chapters ?? [];
  const reprise = 2;
  const restants = Math.max(1, (chapitres.length || 8) - (reprise - 1));
  const autre = story ? (story.participants.find((p) => story.me && p.id !== story.me) ?? story.participants[1]).pronoun : undefined;
  return (
    <>
      <ConvDeLaPage />
      <UnlockedScreen offer={offer} next={next} restants={restants} reprise={reprise} autre={autre} />
    </>
  );
}
