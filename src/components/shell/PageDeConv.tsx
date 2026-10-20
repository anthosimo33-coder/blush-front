import "server-only";
import type { ReactNode } from "react";
import { pageDeConv } from "@/services/serveur";
import { PoseConv } from "./PoseConv";

/**
 * La page d’une conv (l’accueil, sa fiche, le rapport, la lecture, « Mon compte »…) : elle rend son écran dans
 * `<PageDeConv>`, qui pose la conv qu’elle montre. Ses appels au serveur la désignent alors (src/services/session.ts,
 * ENTETE_CONV) : un geste vise la conv à l’écran, même si un autre onglet en a ouvert une autre. Le compte rendu ici sert à
 * la coque des écrans (AppScreen), qui ne le relit pas au montage. `rendu` : l’heure du rendu (heureDuRendu), que la page
 * prend une fois, en tête, avant ses lectures (src/lib/rendu.ts) ; prise ici, après elles, elle daterait le compte trop
 * tard. tests/unit/pages-de-conv.test.ts vérifie que chaque page d’une conv passe par lui.
 */
export async function PageDeConv({ rendu, children }: { rendu: number; children: ReactNode }) {
  const { id, compte, secrets } = await pageDeConv();
  return (
    <PoseConv id={id} compte={compte} rendu={rendu} secrets={secrets}>
      {children}
    </PoseConv>
  );
}
