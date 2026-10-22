import type { Metadata } from "next";
import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getFicheEtMaj, idDeLaConv, sansHistoire } from "@/services/serveur";
import { FicheScreen } from "./FicheScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Sa fiche" };

/*
 * Une mise à jour de la mémoire restée en plan repart après le rendu (getFicheEtMaj, relancerApres) : elle prend 20 à
 * 60 s, trois essais au plus. La même durée que GET /api/fiche, qui fait la même chose (src/app/api/fiche/route.ts).
 */
export const maxDuration = 800;

/* Depuis l’accueil, sa fiche arrive par la droite ; « Retour » la renvoie à droite (globals.css, « Sophie, en glissé ») */
export default async function Page() {
  const rendu = heureDuRendu();
  /* La même conv que sa fiche : le contexte de la requête est lu une fois pour le rendu (contexte, mémorisé) */
  const [storyId, fiche] = await Promise.all([idDeLaConv(), getFicheEtMaj()]);
  if (!fiche || !storyId) redirect(await sansHistoire("/app/fiche"));
  return (
    <PageDeConv rendu={rendu}>
      <ViewTransition enter={{ "nav-forward": "push-in", default: "none" }} exit={{ "nav-back": "pop-out", default: "none" }} default="none">
        {/* data-prive : tout son texte masqué dans l’enregistrement des visites (src/lib/secrets.ts) */}
        <div data-prive="" className="[background:var(--paper-light)]">
          {/* L’heure du rendu : préchargée, la page peut dater de plusieurs minutes (voir FicheScreen) */}
          <FicheScreen initial={fiche} storyId={storyId} rendu={rendu} />
        </div>
      </ViewTransition>
    </PageDeConv>
  );
}
