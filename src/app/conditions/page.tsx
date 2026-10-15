import type { Metadata } from "next";
import { pagePublique } from "@/lib/referencement";
import { ConditionsScreen } from "./ConditionsScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts) */
export const metadata: Metadata = pagePublique("/conditions", {
  title: "Conditions",
  description: "Les conditions d’utilisation et de vente de BLUSH\u00a0: ce que fait BLUSH, ce que tu peux acheter, les bulles, les remboursements.",
});

/** Statique : rien n’y dépend du compte ni de la bêta. */
export default function Page() {
  return <ConditionsScreen />;
}
