import type { Metadata } from "next";
import { heureDuRendu } from "@/lib/rendu";
import { rappelDuTournage } from "@/server/tournage";
import { getAchats, getCompte, getConvs, getNomsDuCompte } from "@/services/serveur";
import { CompteScreen } from "./CompteScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Mon compte" };

/* Sans compte connecté, la connexion : la garde est dans layout.tsx, pour une vraie 307 avant le squelette */
export default async function Page() {
  /* Le compte aussi (ses bulles) et ses achats : l’écran ne descend plus quand ils arrivent. Et le mode tournage de ce navigateur */
  const rendu = heureDuRendu();
  const [noms, convs, compte, achats, tournage] = await Promise.all([getNomsDuCompte(), getConvs(), getCompte(), getAchats(), rappelDuTournage()]);
  return (
    <PageDeConv rendu={rendu}>
      <CompteScreen noms={noms} convs={convs} compte={compte} achats={achats} tournage={tournage} rendu={rendu} />
    </PageDeConv>
  );
}
