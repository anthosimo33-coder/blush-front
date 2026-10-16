import type { Metadata } from "next";
import { Suspense } from "react";
import { Squelette } from "@/components/shell/Squelette";
import { tournageDuNavigateur } from "@/server/tournage";
import { ExportDepuisLadresse } from "../ExportDepuisLadresse";

export const metadata: Metadata = { title: "Exporte votre conv" };

/*
 * /importer/export pour un navigateur qui garde le cookie du mode tournage (next.config.ts la sert à cette adresse) : le
 * même écran, dont le bouton prend la conv du lien au lieu d’ouvrir le choix d’un fichier (src/server/tournage.ts). Le
 * cookie d’un lien arrêté, ou cette adresse ouverte sans lui : l’écran de tout le monde, comme avant.
 */
export default async function Page() {
  const tournage = !!(await tournageDuNavigateur());
  return (
    <Suspense fallback={<Squelette />}>
      <ExportDepuisLadresse tournage={tournage} />
    </Suspense>
  );
}
