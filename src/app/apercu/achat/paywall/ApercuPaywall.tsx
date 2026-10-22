"use client";

import { useMemo } from "react";
import type { Story } from "@/types";
import { Paywall } from "../../../lecture/Paywall";
import { EXEMPLES, STORY_D_EXEMPLE } from "../../paywall/exemples";

/** Le temps d’un paiement en un geste, simulé, en ms. */
const PAIEMENT_MS = 1300;

/* La conv de Léa, celle que Hugo vient d’importer depuis le chat (les chiffres de l’exemple du paywall) */
const STORY: Story = {
  ...STORY_D_EXEMPLE,
  participants: [
    { id: "p0", name: "Hugo", initial: "H", pronoun: "il" },
    { id: "p1", name: "Léa", initial: "L", pronoun: "elle" },
  ],
};

/** Le paywall d’une conv inventée, payé en un geste avec la carte gardée : la suite du parcours « une autre personne ». */
export function ApercuPaywall() {
  const enUnGeste = useMemo(() => ({ carte: { marque: "Visa", fin: "4242" }, payer: () => new Promise<"paye">((ok) => setTimeout(() => ok("paye"), PAIEMENT_MS)) }), []);
  return <Paywall story={STORY} apercu={EXEMPLES.tendance} enUnGeste={enUnGeste} />;
}
