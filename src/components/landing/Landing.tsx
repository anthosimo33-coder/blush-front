"use client";

import { ConvsDemo } from "./ConvsDemo";
import { Hero } from "./Hero";
import { BlushPlus, Facts, FinalCta, LandingFrame, Reviews, useReveal, useReviews, type Retour } from "./parts";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, BLUSH montre son verdict),
 * BLUSH+ en bloc noir, les avis (seulement s’il y en a de vrais, mocks/landing.ts), les faits, le dernier appel.
 * `retour` : qui revient, connecté (src/app/retour) ; ses boutons mènent alors à son accueil.
 */
export function Landing({ retour = null }: { retour?: Retour }) {
  const reviews = useReviews();
  useReveal(reviews.items.length);
  return (
    <LandingFrame retour={retour}>
      <Hero>
        <ConvsDemo />
      </Hero>
      <BlushPlus />
      <Reviews {...reviews} />
      <Facts />
      <FinalCta />
    </LandingFrame>
  );
}
