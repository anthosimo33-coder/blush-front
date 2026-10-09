import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { BACKEND } from "@/services/mode";
import { estConnecte } from "@/services/serveur";
import type { AppKind } from "@/types";
import { CapturesScreen } from "./CapturesScreen";

export const metadata: Metadata = { title: "Choisis tes captures" };

const APPS: AppKind[] = ["instagram", "hinge", "autre", "whatsapp", "imessage"];

export default async function Page({ searchParams }: PageProps<"/importer/captures">) {
  const { app, mode } = await searchParams;
  const appli = APPS.includes(app as AppKind) ? (app as AppKind) : null;
  /*
   * Bêta fermée : BLUSH ne lit des captures que pour un compte connecté (src/server/captures.ts, lecturePermise). La
   * connexion d’abord, avant de choisir les captures, puis retour ici.
   */
  if (BACKEND && process.env.BLUSH_BETA_FERMEE === "1" && !(await estConnecte())) {
    const ici = new URLSearchParams({ ...(appli ? { app: appli } : {}), ...(mode === "ajout" ? { mode } : {}) }).toString();
    redirect(connexionPuis(`/importer/captures${ici ? `?${ici}` : ""}`));
  }
  return <CapturesScreen app={appli} addMode={mode === "ajout"} />;
}
