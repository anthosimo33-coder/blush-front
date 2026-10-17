import type { Metadata } from "next";
import { DesinscriptionScreen } from "./DesinscriptionScreen";

export const metadata: Metadata = { title: "Désinscription", robots: { index: false } };

/**
 * Le lien de désinscription en pied des mails : la relance (« Ton rapport t’attend », src/server/mail-relance.ts) et les
 * séquences (src/server/mail-sequence.ts). `quoi` : ce qu’il coupe (les offres sans lui, comme les liens d’avant).
 */
export default async function Page({ searchParams }: PageProps<"/desinscription">) {
  const { id, cle, quoi } = await searchParams;
  return <DesinscriptionScreen id={typeof id === "string" ? id : ""} cle={typeof cle === "string" ? cle : ""} quoi={quoi === "conseils" ? "conseils" : "offres"} />;
}
