import type { Metadata } from "next";
import { CompteScreen } from "./CompteScreen";

export const metadata: Metadata = { title: "Mon compte" };

export default function Page() {
  return <CompteScreen />;
}
