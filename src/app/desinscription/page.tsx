import type { Metadata } from "next";
import { DesinscriptionScreen } from "./DesinscriptionScreen";

export const metadata: Metadata = { title: "Désinscription", robots: { index: false } };

/** Le lien « Désinscris-toi » du mail de relance (« Ton rapport t’attend », src/server/mail-relance.ts). */
export default async function Page({ searchParams }: PageProps<"/desinscription">) {
  const { id, cle } = await searchParams;
  return <DesinscriptionScreen id={typeof id === "string" ? id : ""} cle={typeof cle === "string" ? cle : ""} />;
}
