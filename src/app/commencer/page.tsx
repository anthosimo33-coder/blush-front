import type { Metadata } from "next";
import { aUneSession } from "@/server/cookies";
import { CommencerScreen } from "./CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où ?" };

export default async function Page() {
  /* Bêta fermée : on le dit dès le début, avec la liste d’attente, plutôt qu’après l’import. Pas à qui est déjà connecté (une autre conv) */
  const fermee = process.env.NEXT_PUBLIC_BLUSH_BACKEND === "1" && process.env.BLUSH_BETA_FERMEE === "1" && !(await aUneSession());
  return <CommencerScreen fermee={fermee} />;
}
