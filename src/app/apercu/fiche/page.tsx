import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FicheScreen } from "../../app/fiche/FicheScreen";
import { ApercuNav } from "../ApercuNav";
import { lireApercu } from "../lire";

export const metadata: Metadata = { title: "Aperçu de sa fiche" };
export const dynamic = "force-dynamic";

/** En local seulement : sa fiche, telle que la mémoire (prompt 07) l’a remplie. Lue là où pointe BLUSH_APERCU. */
export default async function Page({ searchParams }: PageProps<"/apercu/fiche">) {
  const { cas } = await searchParams;
  const a = await lireApercu(typeof cas === "string" ? cas : undefined);
  if (!a?.data.fiche) notFound();
  return (
    <div className="[background:var(--paper-light)]">
      <FicheScreen key={a.cas} initial={a.data.fiche} fixed />
      <ApercuNav cas={a.cas} ici="fiche" />
    </div>
  );
}
