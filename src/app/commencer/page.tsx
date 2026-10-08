import type { Metadata } from "next";
import { CommencerScreen } from "./CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où ?" };

export default function Page() {
  /* Bêta fermée : on le dit dès le début, avec la liste d’attente, plutôt qu’après l’import */
  return <CommencerScreen fermee={process.env.NEXT_PUBLIC_BLUSH_BACKEND === "1" && process.env.BLUSH_BETA_FERMEE === "1"} />;
}
