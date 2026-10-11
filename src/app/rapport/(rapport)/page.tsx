import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { ReportScreen } from "../ReportScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Ton rapport" };

export default async function Page({ searchParams }: PageProps<"/rapport">) {
  const { paiement } = await searchParams;
  const rendu = heureDuRendu();
  const [initial, story] = await Promise.all([getReport(), getStory()]);
  /*
   * Les gardes sont dans layout.tsx (une vraie 307, avant le squelette) : celles-ci ne servent qu’au type, et à une
   * navigation qui ne rejoue pas le layout (la même page, d’autres paramètres : ?paiement=1)
   */
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  return (
    <PageDeConv>
      <ReportScreen initial={initial} story={story} openPaywall={paiement === "1"} rendu={rendu} />
    </PageDeConv>
  );
}
