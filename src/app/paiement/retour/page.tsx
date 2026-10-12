import type { Metadata } from "next";
import { RetourScreen } from "./RetourScreen";

export const metadata: Metadata = { title: "Ton paiement", robots: { index: false } };

/** Une seule valeur d’un paramètre d’adresse, ou null. */
const une = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

/*
 * Le retour du paiement (le redirect_url de Whop, ou le faux Whop) : `?achat=` (le nôtre), et ce que Whop ajoute,
 * `payment=pay_…` et `status=`. La page ne livre rien : elle attend que l’achat soit payé (le webhook), puis mène au
 * rapport ou à « C’est débloqué ». La vague 2 la met au dessin.
 */
export default async function Page({ searchParams }: PageProps<"/paiement/retour">) {
  const sp = await searchParams;
  return <RetourScreen achat={une(sp.achat)} paiement={une(sp.payment) ?? une(sp.paiement)} />;
}
