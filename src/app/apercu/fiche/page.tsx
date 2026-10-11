import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { lireApercu } from "@/server/apercu";
import { cheminDesApercus } from "@/server/drapeaux";
import { FicheScreen } from "../../app/fiche/FicheScreen";
import { ApercuNav } from "../ApercuNav";

export const metadata: Metadata = { title: "Aperçu de sa fiche" };
export const dynamic = "force-dynamic";

/** Hors de Vercel seulement (src/proxy.ts) : sa fiche, telle que la mémoire (prompt 07) l’a remplie. Lue là où pointe BLUSH_APERCU. */
export default async function Page({ searchParams }: PageProps<"/apercu/fiche">) {
  const { cas } = await searchParams;
  const a = await lireApercu(cheminDesApercus(), typeof cas === "string" ? cas : undefined);
  if (!a?.data.fiche) notFound();
  return (
    <div className="[background:var(--paper-light)]">
      <FicheScreen key={a.cas} initial={a.data.fiche} fixed />
      <ApercuNav cas={a.cas} ici="fiche" />
    </div>
  );
}
