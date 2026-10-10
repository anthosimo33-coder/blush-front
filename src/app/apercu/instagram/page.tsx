import type { Metadata } from "next";
import { ApercuChoixConv } from "./ApercuChoixConv";

export const metadata: Metadata = { title: "Aperçu du choix de conv Instagram" };
export const dynamic = "force-dynamic";

/** Hors de Vercel seulement (src/proxy.ts) : le choix de la conv dans un export Instagram complet, avec des convs inventées. */
export default function Page() {
  return <ApercuChoixConv />;
}
