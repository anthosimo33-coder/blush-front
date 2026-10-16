import type { Metadata } from "next";
import { prenomDuNavigateur, tournageDuNavigateur } from "@/server/tournage";
import { TournageScreen } from "./TournageScreen";

export const metadata: Metadata = { title: "Mode tournage", robots: { index: false } };

/**
 * Le mode tournage de ce navigateur (src/server/tournage.ts), où mène le lien d’une conv de tournage : ce qu’il fait, et
 * comment filmer, avec le prénom de la créatrice si son lien le porte. Sans mode tournage (pas de lien, ou un lien
 * arrêté), la page le dit.
 */
export default async function Page() {
  const [tournage, prenom] = await Promise.all([tournageDuNavigateur(), prenomDuNavigateur()]);
  return <TournageScreen nom={tournage?.nom ?? null} prenom={prenom} />;
}
