import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { getFiche, getQuickQuestions, getReport, getStory } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { ARRIVAL_COOKIE } from "@/services/session";
import { HomeScreen } from "./HomeScreen";

export const metadata: Metadata = { title: "Accueil" };

/*
 * Proposition : des questions toutes prêtes au-dessus du champ. Le chat sans elles reste visible avec ?version=actuelle, pour comparer.
 * Proposition : l’accueil en mouvement (arrivée, vols de bulles, gestes, transitions). L’accueil d’avant reste visible avec ?anim=avant.
 * L’arrivée ne se joue qu’une fois par jour : un cookie (posé par l’accueil, jusqu’à minuit) la saute ensuite, dès le rendu serveur.
 * ?arrivee=1 la rejoue.
 */
export default async function Page({ searchParams }: PageProps<"/app">) {
  const { version, anim, arrivee } = await searchParams;
  const motion = anim !== "avant";
  const storyId = await currentStoryId();
  /* ?arrivee=1 rejoue l’arrivée sans attendre le lendemain (pour la revoir, ou la montrer) */
  const arrived = arrivee !== "1" && (await cookies()).has(ARRIVAL_COOKIE);
  const [quick, payload, fiche, story] = await Promise.all([getQuickQuestions(storyId), getReport(storyId), getFiche(storyId), getStory(storyId)]);
  if (!story) redirect("/commencer");
  if (!payload || !fiche) redirect("/rapport");
  const { report } = payload;
  const screen = (
    <HomeScreen
      quick={version === "actuelle" ? [] : quick}
      contact={{ report: { verdict: report.verdict, level: report.level, trend: report.trend, nextStep: report.nextStep }, fiche: { person: fiche.person, summaryShort: fiche.summaryShort }, period: story.period }}
      motion={motion}
      arrive={motion && !arrived}
    />
  );
  if (!motion) return screen;
  /* Vers sa fiche, l’accueil recule à gauche ; au retour, il revient de la gauche (globals.css, « Sophie, en glissé ») */
  return (
    <ViewTransition enter={{ "nav-back": "pop-in", default: "none" }} exit={{ "nav-forward": "push-out", default: "none" }} default="none">
      {/* Un fond à elle : pendant le glissé, chaque page est une image qui doit être opaque */}
      <div className="[background:var(--paper-light)]">{screen}</div>
    </ViewTransition>
  );
}
