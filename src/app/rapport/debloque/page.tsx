import type { Metadata } from "next";
import { UnlockedScreen } from "./UnlockedScreen";

export const metadata: Metadata = { title: "C’est débloqué" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const offer = sp.offre === "rapport" ? "rapport" : "blushplus";
  /* Où reprendre après : seulement une adresse interne */
  const next = typeof sp.suite === "string" && sp.suite.startsWith("/") && !sp.suite.startsWith("//") ? sp.suite : null;
  return <UnlockedScreen offer={offer} next={next} />;
}
