import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurDeSession } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { lienDeParrainage } from "@/server/parrainage";
import { ParrainageScreen } from "./ParrainageScreen";

export const metadata: Metadata = { title: "Ton lien de parrainage", robots: { index: false } };

/** Son lien de parrainage (src/server/parrainage.ts), à copier ou à partager : le bouton du mail du parrainage mène ici. */
export default async function Page() {
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur) redirect("/connexion");
  return <ParrainageScreen lien={await lienDeParrainage(utilisateur.id)} />;
}
