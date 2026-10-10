"use client";

import { TESTIMONIALS } from "@/contenu/landing";
import { ConvsExemples } from "./ConvsExemples";
import { Hero } from "./Hero";
import { BlushPlus, Facts, FinalCta, LandingFrame, Reviews, useReveal, type Retour } from "./parts";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, BLUSH montre son verdict),
 * BLUSH+ en bloc noir, les avis (seulement s’il y en a de vrais, src/contenu/landing.ts), les faits, le dernier appel.
 * `retour` : qui revient, connecté (src/app/retour) ; ses boutons mènent alors à son accueil.
 */
export function Landing({ retour = null }: { retour?: Retour }) {
  /* Les avis à montrer : les vrais seulement (aucun : pas de section) */
  const reviews = TESTIMONIALS;
  useReveal(reviews.length);
  return (
    <LandingFrame retour={retour}>
      <Hero>
        <ConvsExemples />
      </Hero>
      <BlushPlus />
      <Reviews items={reviews} />
      <Facts />
      <FinalCta />
    </LandingFrame>
  );
}
