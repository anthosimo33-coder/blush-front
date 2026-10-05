import type { Metadata } from "next";
import { CodeScreen } from "./CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

export default function Page() {
  return <CodeScreen />;
}
