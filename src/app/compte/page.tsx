import type { Metadata } from "next";
import { heureDuRendu } from "@/lib/rendu";
import { getCompte, getConvs, getNomsDuCompte } from "@/services/serveur";
import { CompteScreen } from "./CompteScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Mon compte" };

/* Sans compte connecté, la connexion : la garde est dans layout.tsx, pour une vraie 307 avant le squelette */
export default async function Page() {
  /* Le compte aussi (l’abonnement) : l’écran ne descend plus quand il arrive */
  const rendu = heureDuRendu();
  const [noms, convs, compte] = await Promise.all([getNomsDuCompte(), getConvs(), getCompte()]);
  return (
    <PageDeConv rendu={rendu}>
      <CompteScreen noms={noms} convs={convs} compte={compte} rendu={rendu} />
    </PageDeConv>
  );
}
