import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAchatDuFauxWhop } from "@/services/serveur";
import { FauxWhopScreen } from "./FauxWhopScreen";

export const metadata: Metadata = { title: "Paiement factice", robots: { index: false } };

/*
 * La page de paiement du faux Whop (BLUSH_PAIEMENT_FACTICE) : en local et dans les tests seulement (src/proxy.ts la
 * rend introuvable sur Vercel et hors de ce poste ; sans le faux Whop, elle n’a pas d’achat à montrer : 404). Elle dit
 * l’achat et son prix, et deux boutons : « Payer » et « Refuser ».
 */
export default async function Page({ searchParams }: PageProps<"/paiement/factice">) {
  const { achat } = await searchParams;
  const id = typeof achat === "string" ? achat : null;
  const lu = id ? await getAchatDuFauxWhop(id) : null;
  if (!id || !lu) notFound();
  return <FauxWhopScreen achat={id} titre={lu.titre} centimes={lu.centimes} statut={lu.statut} />;
}
