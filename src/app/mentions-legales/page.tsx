import type { Metadata } from "next";
import { pagePublique } from "@/lib/referencement";
import { MentionsLegalesScreen } from "./MentionsLegalesScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts) */
export const metadata: Metadata = pagePublique("/mentions-legales", {
  title: "Mentions légales",
  description: "Qui édite BLUSH, qui l’héberge, et où nous écrire.",
});

/** Statique : l’identité de l’éditeur vit dans src/contenu/mentions-legales.ts. */
export default function Page() {
  return <MentionsLegalesScreen />;
}
