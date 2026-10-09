import type { Metadata } from "next";
import { RetirerScreen } from "./RetirerScreen";

export const metadata: Metadata = { title: "Liste d’attente", robots: { index: false } };

/** Le lien « Retire ton email de la liste » du mail de la liste d’attente. */
export default async function Page({ searchParams }: PageProps<"/attente/retirer">) {
  const { id, cle } = await searchParams;
  return <RetirerScreen id={typeof id === "string" ? id : ""} cle={typeof cle === "string" ? cle : ""} />;
}
