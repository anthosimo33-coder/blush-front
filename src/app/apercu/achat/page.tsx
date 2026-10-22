import type { Metadata } from "next";
import { ApercuAchat } from "./ApercuAchat";
import { PARCOURS, type Parcours } from "./parcours";

export const metadata: Metadata = { title: "Aperçu de l’achat dans le chat" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : l’achat dans le chat, une proposition du 22 octobre 2026, joué dans le vrai
 * accueil sur une conv inventée. `?parcours=` : demande (il demande le rapport), moment (BLUSH le propose), bulles (à zéro
 * bulle), autre (une autre conv), reimport (un ancien rapport doux), refus (la banque dit non, puis c’est payé).
 */
export default async function Page({ searchParams }: PageProps<"/apercu/achat">) {
  const { parcours } = await searchParams;
  const p: Parcours = PARCOURS.find((x) => x === parcours) ?? "demande";
  return <ApercuAchat parcours={p} />;
}
