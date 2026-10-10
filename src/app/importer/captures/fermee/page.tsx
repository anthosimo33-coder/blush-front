import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { estConnecte } from "@/services/serveur";
import { adresseDesCaptures } from "../adresse";
import { CapturesScreen } from "../CapturesScreen";

export const metadata: Metadata = { title: "Choisis tes captures" };

/*
 * /importer/captures en bêta fermée (src/proxy.ts sert cette page à la même adresse) : BLUSH ne lit des captures que
 * pour un compte connecté (src/server/captures.ts, lecturePermise). La connexion d’abord, avant de choisir les captures,
 * puis retour ici. Hors bêta fermée, /importer/captures reste statique.
 */
export default async function Page({ searchParams }: PageProps<"/importer/captures/fermee">) {
  const { app, mode } = await searchParams;
  const { appli, ajout } = adresseDesCaptures(app, mode);
  if (process.env.BLUSH_BETA_FERMEE === "1" && !(await estConnecte())) {
    const ici = new URLSearchParams({ ...(appli ? { app: appli } : {}), ...(ajout ? { mode: "ajout" } : {}) }).toString();
    redirect(connexionPuis(`/importer/captures${ici ? `?${ici}` : ""}`));
  }
  return <CapturesScreen app={appli} addMode={ajout} />;
}
