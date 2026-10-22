import { TESTIMONIALS } from "@/contenu/landing";
import { ConvsExemples } from "./ConvsExemples";
import type { Retour } from "./cta";
import { Hero } from "./Hero";
import { Apparitions } from "./ilots";
import { Facts, LandingFrame, Quotidien, Reviews } from "./parts";
import { PiedDePage } from "./PiedDePage";

/*
 * La landing (/) : la promesse en bulles, les convs qui défilent (on en touche une, BLUSH montre son verdict),
 * le quotidien en bloc noir, les avis (seulement s’il y en a de vrais, src/contenu/landing.ts), les faits, puis le pied de
 * page en grand bloc rose, qui fait le dernier appel (PiedDePage.tsx).
 * `retour` : qui revient, connecté (src/app/retour) ; ses boutons mènent alors à son accueil.
 * Un composant serveur : seuls ses îlots (ilots.tsx, ilots-pied.tsx, ConvsExemples.tsx) partent dans le navigateur.
 */
export function Landing({ retour = null }: { retour?: Retour }) {
  /* Les avis à montrer : les vrais seulement (aucun : pas de section) */
  const reviews = TESTIMONIALS;
  return (
    <LandingFrame retour={retour} pied={<PiedDePage retour={retour} />}>
      <Hero retour={retour}>
        <ConvsExemples retour={retour} />
      </Hero>
      <Quotidien />
      <Reviews items={reviews} />
      <Facts />
      <Apparitions cle={reviews.length} />
    </LandingFrame>
  );
}
