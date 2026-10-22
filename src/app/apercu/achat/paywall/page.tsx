import type { Metadata } from "next";
import { ApercuPaywall } from "./ApercuPaywall";

export const metadata: Metadata = { title: "Aperçu de l’achat dans le chat" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : la suite du parcours « une autre personne » de l’achat dans le chat, le
 * paywall de sa conv payé en un geste avec la carte gardée (une proposition du 22 octobre 2026, paiement simulé).
 */
export default function Page() {
  return <ApercuPaywall />;
}
