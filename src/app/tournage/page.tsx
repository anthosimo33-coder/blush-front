import type { Metadata } from "next";
import { tournagePourLaCreatrice } from "@/server/tournage";
import { TournageScreen } from "./TournageScreen";

export const metadata: Metadata = { title: "Mode tournage", robots: { index: false } };

/**
 * Le mode tournage de ce navigateur (src/server/tournage.ts), où mène le lien d’une conv de tournage : ce qu’il fait, et
 * comment filmer, avec le prénom de la créatrice s’il est connu, et jamais celui d’une autre (tournagePourLaCreatrice).
 * Sans mode tournage (pas de lien, ou un lien arrêté), la page le dit.
 */
export default async function Page() {
  const tournage = await tournagePourLaCreatrice();
  return <TournageScreen nom={tournage?.nom ?? null} prenom={tournage?.prenom ?? null} />;
}
