import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { aUneSession } from "@/server/cookies";
import { ConnexionScreen } from "./ConnexionScreen";

export const metadata: Metadata = { title: "Se connecter" };

/** Retrouver ses convs sur un autre appareil : l’email du compte, puis un code. Déjà connecté : son accueil. */
export default async function Page() {
  if (await aUneSession()) redirect("/app");
  return <ConnexionScreen />;
}
