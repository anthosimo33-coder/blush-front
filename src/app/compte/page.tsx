import type { Metadata } from "next";
import { getConvs, getNomsDuCompte } from "@/services/serveur";
import { CompteScreen } from "./CompteScreen";

export const metadata: Metadata = { title: "Mon compte" };

export default async function Page() {
  const [noms, convs] = await Promise.all([getNomsDuCompte(), getConvs()]);
  return <CompteScreen noms={noms} convs={convs} />;
}
