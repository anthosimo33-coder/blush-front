import { TESTIMONIALS } from "@/contenu/landing";
import { ConvsExemples } from "./ConvsExemples";
import type { Retour } from "./cta";
import { Hero } from "./Hero";
import { Apparitions } from "./ilots";
import { BlushPlus, Facts, FinalCta, LandingFrame, Reviews } from "./parts";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, BLUSH montre son verdict),
 * BLUSH+ en bloc noir, les avis (seulement s’il y en a de vrais, src/contenu/landing.ts), les faits, le dernier appel.
 * `retour` : qui revient, connecté (src/app/retour) ; ses boutons mènent alors à son accueil.
 * Un composant serveur : seuls ses îlots (ilots.tsx, ConvsExemples.tsx) partent dans le navigateur.
 */
export function Landing({ retour = null }: { retour?: Retour }) {
  /* Les avis à montrer : les vrais seulement (aucun : pas de section) */
  const reviews = TESTIMONIALS;
  return (
    <LandingFrame retour={retour}>
      <Hero retour={retour}>
        <ConvsExemples retour={retour} />
      </Hero>
      <BlushPlus />
      <Reviews items={reviews} />
      <Facts />
      <FinalCta retour={retour} />
      <Apparitions cle={reviews.length} />
    </LandingFrame>
  );
}
