import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { convChoisie, getChat, getContact, getConvs, getFiche, getQuickQuestions, getRetour, getStory, sansHistoire } from "@/services/serveur";
import { ARRIVAL_COOKIE } from "@/services/session";
import { HomeScreen } from "./HomeScreen";
import { IDEES_MASQUEES } from "./idees";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Accueil" };

/*
 * Proposition : des questions toutes prêtes au-dessus du champ. Le chat sans elles reste visible avec ?version=actuelle, pour comparer.
 * Proposition : l’accueil en mouvement (arrivée, vols de bulles, gestes, transitions). L’accueil d’avant reste visible avec ?anim=avant.
 * L’arrivée ne se joue qu’une fois par jour : un cookie (posé par l’accueil, jusqu’à minuit) la saute ensuite, dès le rendu serveur.
 * ?arrivee=1 la rejoue.
 */
export default async function Page({ searchParams }: PageProps<"/app">) {
  const { version, anim, arrivee, depuis } = await searchParams;
  const motion = anim !== "avant";
  const [storyId, jar] = await Promise.all([convChoisie(), cookies()]);
  /* ?arrivee=1 rejoue l’arrivée sans attendre le lendemain (pour la revoir, ou la montrer) */
  const arrived = arrivee !== "1" && jar.has(ARRIVAL_COOKIE);
  /* Du rapport, l’accueil ne montre que le verdict, le niveau, la tendance et le prochain pas : getContact ne lit que le verdict */
  const lectures = Promise.all([getQuickQuestions(), getContact(), getFiche(), getStory(), getChat(), getConvs()]);
  /* Une erreur remonte quand l’accueil les attend (plus bas) ; redirigé avant, on ne les attend pas */
  lectures.catch(() => {});
  /*
   * Pas encore d’accueil (« Qui es-tu ? » à remplir, la lecture pas finie) : droit à la bonne page, dès que la conv et son
   * verdict sont lus (lus pour l’accueil de toute façon, une fois par rendu), sans attendre le reste ni repasser par le
   * rapport et la lecture, un aller-retour chacun. Le reste est lu en même temps : l’accueil ne l’attend pas plus.
   */
  const retour = await getRetour();
  if (retour && retour.destination !== "/app") redirect(retour.destination);
  const [quick, report, fiche, story, chat, all] = await lectures;
  if (!story) redirect(await sansHistoire("/app"));
  if (!report || !fiche) redirect("/rapport");
  const screen = (
    <HomeScreen
      quick={version === "actuelle" ? [] : quick}
      script={chat.echanges}
      plusAnciens={chat.plus}
      modeVocalInitial={chat.modeVocal}
      contact={{ report: { verdict: report.verdict, level: report.level, trend: report.trend, nextStep: report.nextStep }, fiche: { person: fiche.person, summaryShort: fiche.summaryShort }, period: story.period }}
      motion={motion}
      arrive={motion && !arrived}
      fromReport={depuis === "rapport"}
      others={all.filter((c) => !c.current)}
      introAt={chat.introAt}
      ideesMasquees={jar.get(IDEES_MASQUEES)?.value === "1"}
      storyId={storyId ?? ""}
    />
  );
  if (!motion)
    return (
      <>
        <ConvDeLaPage />
        {screen}
      </>
    );
  /*
   * Vers sa fiche, l’accueil recule à gauche ; au retour, il revient de la gauche (globals.css, « Sophie, en glissé »).
   * Proposition « plusieurs convs » : choisi dans la liste, il arrive par la droite ; vers la liste, il repart à droite.
   * Pas de <ViewTransition> autour de l’accueil : il glisse en entier (la racine, une image de l’écran). Nommé, il serait
   * capturé sur toute la hauteur de la conv, et le départ attendrait cette image (HomeScreen, « 10 · »).
   */
  return (
    <>
      <ConvDeLaPage />
      <div className="[background:var(--paper-light)]">{screen}</div>
    </>
  );
}
