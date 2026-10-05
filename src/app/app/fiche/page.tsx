import type { Metadata } from "next";
import { getFiche } from "@/services/api";
import { FicheScreen } from "./FicheScreen";

export const metadata: Metadata = { title: "Sa fiche" };

export default async function Page() {
  return <FicheScreen initial={await getFiche()} />;
}
