import type { Metadata } from "next";
import { Suspense } from "react";
import { Squelette } from "@/components/shell/Squelette";
import { ExportDepuisLadresse } from "./ExportDepuisLadresse";

export const metadata: Metadata = { title: "Exporte votre conv" };

/*
 * Statique : servie et préchargée tout de suite depuis « Vous vous parlez où ? ». L’appli (?app=) se lit dans le
 * navigateur ; ouverte directement (un rechargement), la page attend son JS sur un écran sobre plutôt que de montrer
 * les étapes d’une autre appli. iMessage ne s’exporte pas : next.config.ts l’envoie filmer son écran.
 */
export default function Page() {
  return (
    <Suspense fallback={<Squelette />}>
      <ExportDepuisLadresse />
    </Suspense>
  );
}
