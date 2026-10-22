import { NB_CHAPITRES } from "@/contenu/chapitres";
import { SITUATION_PAR_DEFAUT, type SituationId } from "@/contenu/landing-situations";
import { CATALOGUE, prixDe } from "@/contenu/offres";
import { NOTE_DES_AVIS } from "@/contenu/paiement";
import { Apparitions } from "../ilots";
import { Facts, FinalCta, LandingFrame } from "../parts";
import { Situations } from "./Situations";

/*
 * La landing par situation (une proposition, /apercu/landing, jamais en ligne) : la même barre du haut et le même pied
 * que la landing, la page par situation (un îlot, Situations.tsx), puis les faits et le dernier appel de la landing.
 * La landing d’aujourd’hui (/) ne bouge pas tant que celle-ci n’est pas choisie.
 */
export function LandingParSituation({ situation }: { situation: SituationId | null }) {
  return (
    <LandingFrame retour={null}>
      <Situations
        initiale={situation ?? SITUATION_PAR_DEFAUT}
        parLien={situation !== null}
        prix={prixDe("rapport")}
        chapitres={NB_CHAPITRES}
        bulles={CATALOGUE.rapport.bulles}
        note={NOTE_DES_AVIS}
      />
      <Facts />
      <FinalCta retour={null} />
      <Apparitions cle={0} />
    </LandingFrame>
  );
}
