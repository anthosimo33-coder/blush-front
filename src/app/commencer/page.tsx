import type { Metadata } from "next";
import { CommencerScreen } from "./CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où ?" };

export default function Page() {
  return <CommencerScreen />;
}
