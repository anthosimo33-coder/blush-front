import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeDepuisLadresse, CodeScreen } from "@/app/email/code/CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

/*
 * Statique, comme /connexion : `?suite=` se lit dans le navigateur (avec la même garde, suiteSure). Bêta fermée :
 * src/proxy.ts sert à la même adresse /connexion/code/fermee (la bêta lue à l’exécution).
 */
export default function Page() {
  return (
    <Suspense fallback={<CodeScreen connexion />}>
      <CodeDepuisLadresse />
    </Suspense>
  );
}
