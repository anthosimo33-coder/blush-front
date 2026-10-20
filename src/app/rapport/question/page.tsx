import type { Metadata } from "next";
import { heureDuRendu } from "@/lib/rendu";
import { redirect } from "next/navigation";
import { getStory, questionsDeLaConv, rapportDebloque, sansHistoire } from "@/services/serveur";
import { QuestionChat } from "./QuestionChat";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Ta question" };

/* Ta question, en conversation avec BLUSH */
export default async function Page() {
  /* L’heure du rendu, avant les lectures : le compte posé par PageDeConv en part */
  const rendu = heureDuRendu();
  const [ideas, story, debloque] = await Promise.all([questionsDeLaConv(), getStory(), rapportDebloque()]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect(await sansHistoire("/rapport/question"));
  return (
    <PageDeConv rendu={rendu}>
      {/* data-prive : tout son texte masqué dans l’enregistrement des visites (src/lib/secrets.ts) */}
      <div data-prive="" className="contents">
        <QuestionChat ideas={ideas} story={story} ferme={!debloque} />
      </div>
    </PageDeConv>
  );
}
