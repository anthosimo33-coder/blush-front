import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { VerdictReveal } from "./VerdictReveal";
import { PageDeConv } from "@/components/shell/PageDeConv";
import { ENCRE } from "@/server/marque";

export const metadata: Metadata = { title: "Ton verdict" };

/* La scène est sombre : la barre du navigateur aussi */
export const viewport: Viewport = { themeColor: ENCRE };

/*
 * La page lit le rapport par getReport, qui lance ce qui manque à la chaîne (le rapport, le vocal) et le laisse tourner
 * après la réponse : la durée de la fonction est celle de /api/rapport, pour que la chaîne ne soit pas coupée en route.
 */
export const maxDuration = 300;

/* La révélation du verdict, juste après l’analyse ; elle mène au rapport (/rapport), qui ne change pas. */
export default async function Page() {
  /* Le rapport rendu ici n’est pas relu au montage de la scène (VerdictReveal, `rendu`) */
  const rendu = heureDuRendu();
  const [initial, story] = await Promise.all([getReport(), getStory()]);
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  /*
   * Une alerte de danger (mode sobre) : pas de scène, le rapport tout de suite, même avant que le rapport doux soit écrit
   * (`alerte`, su dès le verdict ; /rapport montre alors l’attente sobre). L’effet de VerdictReveal reste en secours
   */
  if (initial.sober || initial.alerte) redirect("/rapport");
  return (
    <PageDeConv rendu={rendu}>
      {/* data-prive : tout son texte masqué dans l’enregistrement des visites (src/lib/secrets.ts) */}
      <div data-prive="" className="contents">
        <VerdictReveal initial={initial} story={story} rendu={rendu} />
      </div>
    </PageDeConv>
  );
}
