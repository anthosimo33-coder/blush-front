"use client";

import { ConvsDemo } from "./ConvsDemo";
import { Hero } from "./Hero";
import { CrushPlus, Facts, FinalCta, LandingFrame, Reviews, useReveal, useReviews } from "./parts";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, CRUSH montre son verdict),
 * CRUSH+ en bloc noir, les avis (seulement s’il y en a de vrais, mocks/landing.ts), les faits, le dernier appel.
 */
export function Landing() {
  const reviews = useReviews();
  useReveal(reviews.items.length);
  return (
    <LandingFrame>
      <Hero>
        <ConvsDemo />
      </Hero>
      <CrushPlus />
      <Reviews {...reviews} />
      <Facts />
      <FinalCta />
    </LandingFrame>
  );
}
