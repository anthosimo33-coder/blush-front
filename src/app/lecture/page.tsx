import type { Metadata } from "next";
import { heureDuRendu } from "@/lib/rendu";
import { redirect } from "next/navigation";
import { getApercuAvantPaiement, getStory, sansHistoire } from "@/services/serveur";
import { LectureScreen } from "./LectureScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";
import { RepereTournage } from "@/components/shell/RepereTournage";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page({ searchParams }: PageProps<"/lecture">) {
  /* L’heure du rendu, avant les lectures : le compte posé par PageDeConv en part */
  const rendu = heureDuRendu();
  /* Arrivé par un mail de S1 : le paywall tout de suite (`?paywall=1`), et la one time offer rouverte (`&offre=1`, J+6) */
  const [story, haut, { paywall, offre }] = await Promise.all([getStory(), getApercuAvantPaiement(), searchParams]);
  /*
   * Les gardes sont dans layout.tsx (une vraie 307) : celle-ci ne sert qu’au type, et à une navigation qui ne rejoue pas
   * le layout (la même page, d’autres paramètres)
   */
  if (!story) redirect(await sansHistoire("/lecture"));
  return (
    <PageDeConv rendu={rendu}>
      {/* Une conv qui attend son paiement (le paywall d’abord) : la lecture mène au paywall, avec ce que le code a compté */}
      <LectureScreen total={story.totalMessages} apercu={haut ? { story, haut } : null} paywallDirect={paywall === "1"} offreDirecte={paywall === "1" && offre === "1"} />
      {/* Le mode tournage, pour l’équipe seulement (son layout est une garde, qui rend la page telle quelle) */}
      <RepereTournage />
    </PageDeConv>
  );
}
