import type { Metadata } from "next";
import { ConfidentialiteScreen } from "./ConfidentialiteScreen";

export const metadata: Metadata = {
  title: "Ta conv, en sécurité",
  description: "Ce que BLUSH fait de ta conv\u00a0: ce qui part, qui la lit, comment elle est protégée, combien de temps on la garde.",
};

export default function Page() {
  return <ConfidentialiteScreen />;
}
