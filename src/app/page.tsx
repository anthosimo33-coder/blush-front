import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: { absolute: "BLUSH · Passe de « on se parle » à « on est ensemble »" },
  description: "Importe votre conv. BLUSH te dit où vous en êtes, preuves à l’appui, et t’aide à passer à l’étape suivante.",
};

/* La landing : son bouton « Analyser ma conv » mène au parcours (/commencer). */
export default function Home() {
  return <Landing />;
}
