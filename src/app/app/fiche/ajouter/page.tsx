import type { Metadata } from "next";
import { AddToFicheScreen } from "./AddToFicheScreen";

export const metadata: Metadata = { title: "Ajouter à sa fiche" };

export default function Page() {
  return <AddToFicheScreen />;
}
