"use client";

import Link from "next/link";
import { AppTile } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { LienDiscret, NotePrivee } from "@/components/ui/NotePrivee";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { Lead, ScreenTitle } from "@/components/shell/Screen";
import { PROMESSE_CONV } from "@/contenu/confidentialite";
import { TUILES_IMPORT } from "@/contenu/parcours";
import { useJalon } from "@/lib/jalons";
import { readJourney, resetJourney, setJourney } from "@/state/journey";
import type { AppKind } from "@/types";
import { NBSP } from "@/lib/format";

/* Écran 01 — Vous vous parlez où ? Les tuiles : TUILES_IMPORT (src/contenu/parcours.ts) */

export function CommencerScreen({ fermee = false }: { fermee?: boolean }) {
  /* Le tunnel d’/admin (src/lib/jalons.ts) : arrivé au choix de l’appli. La bêta fermée (la liste d’attente) n’en est pas un */
  useJalon(fermee ? null : "commencer");
  /* Choisir une appli, c’est commencer une nouvelle conv : les réponses de la précédente (qui est qui, ce que tu veux) repartent de zéro. L’email reste */
  const nouvelleConv = (app: AppKind) => {
    const { email } = readJourney();
    resetJourney();
    setJourney({ app, email });
  };
  return (
    <ParcoursScreen
      step={1}
      /* Retour (mobile) : la page d’avant (l’accueil, ou « Tes convs ») ; arrivé ici d’ailleurs, l’accueil. Sur ordinateur, le logo y mène */
      back={{ repli: "/" }}
      retourDesktop={false}
      head={
        <>
          <ScreenTitle size={34}>Vous vous parlez où{NBSP}?</ScreenTitle>
          <Lead>On te montre comment récupérer votre conv.</Lead>
        </>
      }
    >
      <nav aria-label="Ton appli" className="grid grid-cols-2 gap-3">
        {TUILES_IMPORT.map((t) => (
          <AppTile key={t.app} {...t} onClick={() => nouvelleConv(t.app)} />
        ))}
      </nav>
      {/* Une conv en plusieurs morceaux (src/server/morceaux.ts) : l’écran de la conv reçue propose d’ajouter les autres */}
      <p className="m-0 text-legende font-bold leading-[1.45] text-grey">
        Vous vous êtes parlé sur plusieurs applis{NBSP}? Commence par une{NBSP}: tu ajouteras le reste juste après.
      </p>
      <NotePrivee className="leading-[1.45]">
        {PROMESSE_CONV} <LienDiscret href="/confidentialite">Comment ça marche</LienDiscret>
      </NotePrivee>
      {fermee && (
        /* Texte relu le 8 octobre */
        <Link href="/attente" className="row-hover flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-ink no-underline shadow-soft">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,79,154,0.12)]">
            <Icon name="lock" size={17} stroke={2.4} className="text-elle-ink" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-detail font-black">Bêta privée, sur invitation</span>
            <span className="text-legende font-extrabold text-grey">Pas encore d’invitation{NBSP}? Rejoins la liste d’attente.</span>
          </span>
          <Icon name="chevron" size={15} stroke={2.6} className="text-pale" />
        </Link>
      )}
    </ParcoursScreen>
  );
}
