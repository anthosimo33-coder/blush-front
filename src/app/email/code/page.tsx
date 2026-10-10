import type { Metadata } from "next";
import { CodeScreen } from "./CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

/* Statique. Bêta fermée : src/proxy.ts sert à la même adresse /email/code/fermee (la bêta lue à l’exécution) */
export default function Page() {
  return <CodeScreen />;
}
