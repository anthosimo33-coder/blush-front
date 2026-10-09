import type { Metadata } from "next";
import { CodeScreen } from "./CodeScreen";

export const metadata: Metadata = { title: "Ton code" };

export default function Page() {
  return <CodeScreen fermee={process.env.NEXT_PUBLIC_BLUSH_BACKEND === "1" && process.env.BLUSH_BETA_FERMEE === "1"} />;
}
