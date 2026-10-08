import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: { absolute: "BLUSH · Ta conv en dit plus que tu crois" },
  description: "Importe ta conv. BLUSH te dit ce qui se passe vraiment entre vous, messages à l’appui, et quoi répondre.",
};

/* La landing : son bouton « Analyser ma conv » mène au parcours (/commencer). Qui revient connecté voit src/app/retour. */
export default function Home() {
  return <Landing />;
}
