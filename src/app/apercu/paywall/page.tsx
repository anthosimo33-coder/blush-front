import type { Metadata } from "next";
import { SCORES, STORY, TROUVAILLES } from "./donnees";
import { OffreProposee, PaywallA, PaywallB } from "./Maquettes";

export const metadata: Metadata = { title: "Maquettes du paywall" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : les maquettes du paywall sur un seul écran, sur une conv inventée.
 * `?v=a` (par défaut) : « Ta formule » sur l’écran ; `?v=b` : le teaser seul ; `?v=offre` : l’offre ① au texte proposé.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/paywall">) {
  const { v } = await searchParams;
  const d = { story: STORY, scores: SCORES, trouvailles: TROUVAILLES };
  return <div className="[background:var(--paper-light)]">{v === "b" ? <PaywallB {...d} /> : v === "offre" ? <OffreProposee {...d} /> : <PaywallA {...d} />}</div>;
}
