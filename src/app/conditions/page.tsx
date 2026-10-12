import type { Metadata } from "next";
import { ConditionsScreen } from "./ConditionsScreen";

export const metadata: Metadata = {
  title: "Conditions",
  description: "Les conditions d’utilisation et de vente de BLUSH\u00a0: ce que fait BLUSH, ce que tu peux acheter, les bulles, les remboursements.",
};

/** Statique : rien n’y dépend du compte ni de la bêta. */
export default function Page() {
  return <ConditionsScreen />;
}
