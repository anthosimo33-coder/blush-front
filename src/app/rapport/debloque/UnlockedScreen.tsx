"use client";

import type { CSSProperties } from "react";
import { OFFERS } from "@/mocks/daily";
import { useSoundOnce } from "@/lib/sound";
import { CheckBurst } from "@/components/brand/objects3d";
import { ButtonLink } from "@/components/ui/Button";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Screen } from "@/components/shell/Screen";

/* Ce que l’offre vient d’ouvrir, dit simplement : combien de chapitres restent, d’où la lecture reprend. */
const ouvert = (offre: "blushplus" | "rapport", restants: number, reprise: number, autre?: "il" | "elle") =>
  offre === "rapport"
    ? [
        { title: `Les ${restants} chapitres qui restent`, sub: `Ta lecture reprend au chapitre ${reprise}` },
        { title: "Ta question à BLUSH", sub: "Une question incluse avec ton rapport" },
      ]
    : [
        { title: "Le rapport complet", sub: `Les ${restants} chapitres qui restent` },
        { title: "Le chat avec BLUSH", sub: "Envoie sa réponse : BLUSH t’aide à répondre" },
        { title: "Sa fiche", sub: `Ce qu’${autre === "il" ? "il" : "elle"} t’a dit, toujours sous la main` },
      ];

/*
 * Paiement réussi : un moment, pas une facture. La gerbe (« une réussite » dans le design system),
 * le titre, ce qui vient de s’ouvrir, puis un seul bouton pour reprendre.
 */
export function UnlockedScreen({
  offer,
  next,
  restants = 6,
  reprise = 3,
  autre,
}: {
  offer: "blushplus" | "rapport";
  next: string | null;
  /** Les chapitres qui restaient à lire, et le premier d’entre eux (où la lecture reprend). */
  restants?: number;
  reprise?: number;
  autre?: "il" | "elle";
}) {
  const o = OFFERS.find((x) => x.id === offer) ?? OFFERS[0];
  const plus = offer === "blushplus";
  /* Le seul son qui suit un achat : la serrure, puis la signature sur un accord ouvert */
  useSoundOnce("debloque");
  return (
    <Screen
      centered
      mainWidth={560}
      frameWidth={560}
      desktopTopPad={0}
      footer={
        <div data-popin="" style={{ "--d": "0.7s" } as CSSProperties}>
          <ButtonLink href={next ?? `/rapport#chapitre-${reprise}`} arrow>
            {next ? "Continuer" : "Lire la suite"}
          </ButtonLink>
        </div>
      }
    >
      <div className="isolate flex flex-1 flex-col items-center justify-center pb-4 pt-10 text-center lg:flex-none lg:pb-0 lg:pt-[max(16px,calc(50dvh_-_380px))]">
        <div className="relative flex h-[150px] w-[300px] items-center justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#FFFFFF,rgba(255,255,255,0))]"
          />
          <div data-float="">
            <CheckBurst size={96} pop />
          </div>
        </div>
        <h1 data-rise="" style={{ "--d": "0.2s" } as CSSProperties} className="m-0 mt-5 text-[32px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] lg:text-[40px]">
          {plus ? "Bienvenue dans BLUSH+." : "C’est débloqué."}
        </h1>
        <p data-rise="" style={{ "--d": "0.3s" } as CSSProperties} className="m-0 mt-3 max-w-[380px] text-[16px] font-extrabold leading-[1.45] text-soft">
          {plus ? "Ton rapport complet, et BLUSH à tes côtés à chaque message." : "Les 8 chapitres sont à toi, pour toujours."}
        </p>

        <div data-rise="" style={{ "--d": "0.45s" } as CSSProperties} className="mt-8 w-full text-left">
          <InsetGroup>
            {ouvert(offer, restants, reprise, autre).map((it) => (
              <InsetRow key={it.title} leading={<RowIcon icon="check" tone="vrai" />} title={it.title} sub={it.sub} />
            ))}
          </InsetGroup>
        </div>
        <p data-rise="" style={{ "--d": "0.55s" } as CSSProperties} className="m-0 mt-4 text-[13px] font-extrabold text-grey">
          {o.price} · {o.noteDesktop}
        </p>
      </div>
    </Screen>
  );
}
