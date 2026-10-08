import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApercuChoixConv } from "./ApercuChoixConv";

export const metadata: Metadata = { title: "Aperçu du choix de conv Instagram" };
export const dynamic = "force-dynamic";

/** En local seulement : le choix de la conv dans un export Instagram complet, avec des convs inventées. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ApercuChoixConv />;
}
