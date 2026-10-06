import type { Metadata } from "next";
import { getQuickQuestions } from "@/services/api";
import { HomeScreen } from "./HomeScreen";

export const metadata: Metadata = { title: "Accueil" };

/* Proposition : des questions toutes prêtes au-dessus du champ. Le chat sans elles reste visible avec ?version=actuelle, pour comparer. */
export default async function Page({ searchParams }: PageProps<"/app">) {
  const { version } = await searchParams;
  return <HomeScreen quick={version === "actuelle" ? [] : await getQuickQuestions()} />;
}
