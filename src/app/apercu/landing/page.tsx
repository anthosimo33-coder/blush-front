import type { Metadata } from "next";
import { situationDe } from "@/contenu/landing-situations";
import { LandingParSituation } from "@/components/landing/situations/LandingParSituation";

export const metadata: Metadata = { title: "Aperçu · la landing par situation" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : la proposition de landing par situation, à côté de la landing d’aujourd’hui
 * (/), qui ne bouge pas. `?s=` choisit la situation d’un lien de campagne (change, flou, dispute, ghost, ex, ami,
 * match) ; sans lui, la page part de la plus fréquente, avec le titre de tout le monde.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/landing">) {
  const { s } = await searchParams;
  return <LandingParSituation situation={situationDe(typeof s === "string" ? s : undefined)?.id ?? null} />;
}
