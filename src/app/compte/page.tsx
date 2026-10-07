import type { Metadata } from "next";
import { getNomsDuCompte } from "@/services/serveur";
import { CompteScreen } from "./CompteScreen";

export const metadata: Metadata = { title: "Mon compte" };

export default async function Page() {
  return <CompteScreen noms={await getNomsDuCompte()} />;
}
