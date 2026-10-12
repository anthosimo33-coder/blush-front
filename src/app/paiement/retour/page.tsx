import type { Metadata } from "next";
import { RetourScreen, type StatutDuRetour } from "./RetourScreen";

export const metadata: Metadata = { title: "Ton paiement", robots: { index: false } };

/** Une seule valeur d’un paramètre d’adresse, ou null. */
const une = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

/** Ce que Whop dit du paiement en revenant (`status=`), s’il le dit dans ses mots. */
const STATUTS: readonly StatutDuRetour[] = ["succeeded", "failed", "canceled"];
const statutDe = (v: string | null) => STATUTS.find((s) => s === v) ?? null;

/*
 * Le retour du paiement (le redirect_url de Whop, ou le faux Whop) : `?achat=` (le nôtre), et ce que Whop ajoute,
 * `payment=pay_…` et `status=` (refusé, annulé sur sa page : dit tout de suite). La page ne livre rien : elle attend que
 * l’achat soit payé (le webhook), puis mène à « C’est débloqué », ou dit les bulles reçues.
 */
export default async function Page({ searchParams }: PageProps<"/paiement/retour">) {
  const sp = await searchParams;
  return <RetourScreen achat={une(sp.achat)} paiement={une(sp.payment) ?? une(sp.paiement)} statut={statutDe(une(sp.status))} />;
}
