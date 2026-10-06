"use client";

import { ConvsDemo } from "./ConvsDemo";
import { Hero } from "./Hero";
import { BlushPlus, Facts, FinalCta, LandingFrame, Reviews, useReveal, useReviews } from "./parts";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, BLUSH montre son verdict),
 * BLUSH+ en bloc noir, les avis (seulement s’il y en a de vrais, mocks/landing.ts), les faits, le dernier appel.
 */
export function Landing() {
  const reviews = useReviews();
  useReveal(reviews.items.length);
  return (
    <LandingFrame>
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
