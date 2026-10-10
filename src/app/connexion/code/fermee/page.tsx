import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeDepuisLadresse, CodeScreen } from "@/app/email/code/CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

/* /connexion/code en bêta fermée (src/proxy.ts sert cette page à la même adresse) : le même écran pour tous, invité ou pas */
export default function Page() {
  return (
    <Suspense fallback={<CodeScreen connexion fermee />}>
      <CodeDepuisLadresse fermee />
    </Suspense>
  );
}
