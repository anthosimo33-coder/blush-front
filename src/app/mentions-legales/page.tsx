import type { Metadata } from "next";
import { MentionsLegalesScreen } from "./MentionsLegalesScreen";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Qui édite BLUSH, qui l’héberge, et où nous écrire.",
};

/** Statique : l’identité de l’éditeur vit dans src/contenu/mentions-legales.ts. */
export default function Page() {
  return <MentionsLegalesScreen />;
}
