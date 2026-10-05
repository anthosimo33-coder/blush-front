import type { Metadata } from "next";
import { EmailScreen } from "./EmailScreen";

export const metadata: Metadata = { title: "Ton email" };

export default function Page() {
  return <EmailScreen />;
}
