import type { Metadata } from "next";
import { HomeScreen } from "./HomeScreen";

export const metadata: Metadata = { title: "Accueil" };

export default function Page() {
  return <HomeScreen />;
}
