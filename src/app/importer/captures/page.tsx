import type { Metadata } from "next";
import { Suspense } from "react";
import { Squelette } from "@/components/shell/Squelette";
import { CapturesDepuisLadresse } from "./CapturesDepuisLadresse";

export const metadata: Metadata = { title: "Choisis tes captures" };

/*
 * Statique : servie et préchargée tout de suite depuis « Vous vous parlez où ? ». L’appli et le mode se lisent dans le
 * navigateur. Bêta fermée : src/proxy.ts sert à la place /importer/captures/fermee, qui vérifie la connexion d’abord.
 */
export default function Page() {
  return (
    <Suspense fallback={<Squelette />}>
      <CapturesDepuisLadresse />
    </Suspense>
  );
}
