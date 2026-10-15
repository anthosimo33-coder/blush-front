import type { Metadata } from "next";
import { pagePublique } from "@/lib/referencement";
import { ConfidentialiteScreen } from "./ConfidentialiteScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts) */
export const metadata: Metadata = pagePublique("/confidentialite", {
  title: "Ta conv, en sécurité",
  description: "Ce que BLUSH fait de ta conv\u00a0: ce qui part, qui la lit, comment elle est protégée, combien de temps on la garde.",
});

export default function Page() {
  return <ConfidentialiteScreen />;
}
