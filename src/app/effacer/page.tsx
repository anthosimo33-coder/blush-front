import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { compteRetireDeLaBeta } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { estConnecte } from "@/services/serveur";
import { EffacerScreen } from "./EffacerScreen";

export const metadata: Metadata = { title: "Tes données" };

/*
 * Un testeur retiré de la bêta, sa session encore ouverte : la bêta ne le laisse plus entrer nulle part, mais ce qu’il a
 * laissé reste à lui (S-29). /compte et /connexion l’envoient ici : « Tout effacer », ou un autre email. Un compte que la
 * bêta laisse entrer a son écran du compte ; sans session, la connexion.
 */
export default async function Page() {
  if (await estConnecte()) redirect("/compte");
  const compte = await compteRetireDeLaBeta(await lireSession());
  if (!compte) redirect(connexionPuis("/compte") as Route);
  return <EffacerScreen email={compte.email} />;
}
