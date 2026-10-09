import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { BACKEND } from "@/services/mode";
import { estConnecte, getConvs, getNomsDuCompte } from "@/services/serveur";
import { CompteScreen } from "./CompteScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Mon compte" };

export default async function Page() {
  /* Sans compte connecté (session expirée, autre appareil) : la connexion d’abord, puis retour ici */
  if (BACKEND && !(await estConnecte())) redirect(connexionPuis("/compte"));
  const [noms, convs] = await Promise.all([getNomsDuCompte(), getConvs()]);
  return (
    <>
      <ConvDeLaPage />
      <CompteScreen noms={noms} convs={convs} />
    </>
  );
}
