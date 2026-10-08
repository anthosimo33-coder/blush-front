import type { Metadata } from "next";
import { CodeScreen } from "@/app/email/code/CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

export default function Page() {
  return <CodeScreen connexion />;
}
