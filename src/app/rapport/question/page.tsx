import type { Metadata } from "next";
import { QuestionScreen } from "./QuestionScreen";

export const metadata: Metadata = { title: "Ta question" };

export default function Page() {
  return <QuestionScreen />;
}
