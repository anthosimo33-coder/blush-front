import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { ReportScreen } from "../ReportScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Ton rapport" };

/*
 * La page lit le rapport par getReport, qui lance ce qui manque à la chaîne (le rapport, le vocal) et le laisse tourner
 * après la réponse : la durée de la fonction est celle de /api/rapport, pour que la chaîne ne soit pas coupée en route.
 */
export const maxDuration = 300;

export default async function Page({ searchParams }: PageProps<"/rapport">) {
  const rendu = heureDuRendu();
  const { paiement } = await searchParams;
  const [initial, story] = await Promise.all([getReport(), getStory()]);
  /*
   * Les gardes sont dans layout.tsx (une vraie 307, avant le squelette) : celles-ci ne servent qu’au type, et à une
   * navigation qui ne rejoue pas le layout (la même page, d’autres paramètres : ?paiement=1)
   */
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  return (
    <PageDeConv rendu={rendu}>
      {/* data-prive : tout son texte masqué dans l’enregistrement des visites (src/lib/secrets.ts) */}
      <div data-prive="" className="contents">
        <ReportScreen initial={initial} story={story} openPaywall={paiement === "1"} rendu={rendu} />
      </div>
    </PageDeConv>
  );
}
