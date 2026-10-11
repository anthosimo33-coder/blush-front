import "server-only";
import type { ReactNode } from "react";
import { heureDuRendu } from "@/lib/rendu";
import { pageDeConv } from "@/services/serveur";
import { PoseConv } from "./PoseConv";

/**
 * La page d’une conv (l’accueil, sa fiche, le rapport, la lecture, « Mon compte »…) : elle rend son écran dans
 * `<PageDeConv>`, qui pose la conv qu’elle montre. Ses appels au serveur la désignent alors (src/services/session.ts,
 * ENTETE_CONV) : un geste vise la conv à l’écran, même si un autre onglet en a ouvert une autre. Le compte rendu ici sert à
 * la coque des écrans (AppScreen), qui ne le relit pas au montage. tests/unit/pages-de-conv.test.ts vérifie que chaque
 * page d’une conv passe par lui.
 */
export async function PageDeConv({ children }: { children: ReactNode }) {
  const rendu = heureDuRendu();
  const { id, compte } = await pageDeConv();
  return (
    <PoseConv id={id} compte={compte} rendu={rendu}>
      {children}
    </PoseConv>
  );
}
