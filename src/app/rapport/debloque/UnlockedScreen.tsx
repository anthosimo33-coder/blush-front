"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { CATALOGUE, prixDe } from "@/contenu/offres";
import { delai } from "@/lib/motion";
import { cheminDe } from "@/lib/navigation";
import { apresDeblocage } from "@/lib/requetes";
import { useSoundOnce } from "@/lib/sound";
import { CheckBurst } from "@/components/brand/objects3d";
import { ButtonLink } from "@/components/ui/Button";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Screen } from "@/components/shell/Screen";
import type { Formule } from "@/types";
import { ancreDuChapitre } from "../ancres";

/* Ce que la formule vient d’ouvrir, dit simplement (le prototype des bulles) : les chapitres qui restent, d’où la lecture reprend, les bulles reçues. */
const ouvert = (offre: Formule, restants: number, reprise: number) => [
  { title: `Les ${restants} chapitres qui restent`, sub: `Ta lecture reprend au chapitre ${reprise}` },
  { title: `${CATALOGUE[offre].bulles} bulles pour parler à BLUSH`, sub: "1 bulle = 1 réponse · elles n’expirent jamais" },
];

/*
 * Paiement réussi : un moment, pas une facture. La gerbe (« une réussite » dans le design system),
 * le titre, ce qui vient de s’ouvrir, puis un seul bouton pour reprendre.
 */
export function UnlockedScreen({
  offer,
  next,
  restants,
  total,
  reprise,
}: {
  offer: Formule;
  next: Route | null;
  /** Les chapitres qui restaient à lire, et le premier d’entre eux (où la lecture reprend). */
  restants: number;
  /** Les chapitres du rapport, offerts compris : ceux qu’il a vraiment (un rapport écrit peut en avoir moins de huit). */
  total: number;
  reprise: number;
}) {
  /* Le seul son qui suit un achat : la serrure, puis la signature sur un accord ouvert */
  useSoundOnce("debloque");
  /* Ce qui vient de s’ouvrir : relu ici, une fois le paiement parti (pas sous la feuille, où le rapport sautait) */
  useEffect(() => apresDeblocage(), []);
  const suite = next ?? `/rapport#${ancreDuChapitre(reprise)}`;
  return (
    <Screen
      mise="colonne"
      mainWidth={560}
      desktopTopPad={0}
      footer={
        <div data-popin="" style={delai(0.7)}>
          {/* Vers l’accueil, sans remise en haut : il s’ouvre sur le dernier échange */}
          <ButtonLink href={suite} scroll={cheminDe(suite) !== "/app"} arrow>
            {next ? "Continuer" : "Lire la suite"}
          </ButtonLink>
        </div>
      }
    >
      <div className="isolate flex flex-1 flex-col items-center justify-center pb-4 pt-10 text-center lg:flex-none lg:pb-0 lg:pt-[max(16px,calc(50dvh_-_380px))]">
        <div className="relative flex h-[150px] w-[300px] items-center justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
          />
          <div data-float="">
            <CheckBurst size={96} pop />
          </div>
        </div>
        <h1 data-rise="" style={delai(0.2)} className="m-0 mt-5 text-[32px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] lg:text-[40px]">
          C’est débloqué.
        </h1>
        <p data-rise="" style={delai(0.3)} className="m-0 mt-3 max-w-[380px] text-corps font-extrabold leading-[1.45] text-soft">
          {/* TODO(produit): « pour toujours » : Whop interdit de promettre un accès « à vie » (sa règle des produits), texte gardé par décision du 12 octobre */}
          {`Les ${total} chapitres sont à toi, pour toujours. Et ${CATALOGUE[offer].bulles} bulles pour en parler avec BLUSH.`}
        </p>

        <div data-rise="" style={delai(0.45)} className="mt-8 w-full text-left">
          <InsetGroup>
            {ouvert(offer, restants, reprise).map((it) => (
              <InsetRow key={it.title} leading={<RowIcon icon="check" tone="vrai" />} title={it.title} sub={it.sub} />
            ))}
          </InsetGroup>
        </div>
        <p data-rise="" style={delai(0.55)} className="m-0 mt-4 text-legende font-extrabold text-grey">
          {prixDe(offer)} · Paiement unique, pas d’abonnement
        </p>
      </div>
    </Screen>
  );
}
