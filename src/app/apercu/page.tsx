import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { lireApercu } from "@/server/apercu";
import { cheminDesApercus } from "@/server/drapeaux";
import { ReportScreen } from "../rapport/ReportScreen";
import { ApercuNav } from "./ApercuNav";

export const metadata: Metadata = { title: "Aperçu d’un rapport" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : affiche un vrai rapport produit par les prompts (prompts/evals/vers-front.mts),
 * lu là où pointe BLUSH_APERCU (un fichier, ou un dossier et `?cas=`) et mis en écrans comme ceux de l’appli
 * (src/server/apercu.ts). Rien de ce rapport ne vit dans le dépôt.
 */
export default async function Page({ searchParams }: PageProps<"/apercu">) {
  const { cas } = await searchParams;
  const a = await lireApercu(cheminDesApercus(), typeof cas === "string" ? cas : undefined);
  if (!a) notFound();
  return (
    <>
      <ReportScreen key={a.cas} initial={a.data.payload} story={a.data.story} openPaywall={false} fixed />
      <ApercuNav cas={a.cas} ici="rapport" />
    </>
  );
}
