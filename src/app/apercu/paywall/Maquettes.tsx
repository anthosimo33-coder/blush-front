"use client";

import { useState } from "react";
import { NB_CHAPITRES, titreDAttente } from "@/contenu/chapitres";
import { CATALOGUE, enEuros, prixDe } from "@/contenu/offres";
import { FEUILLE_FORMULE, PIED_GRATUIT } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { BubbleLogo } from "@/components/brand/objects3d";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { Grappe, Perle } from "@/components/bulles/perles";
import { Option } from "@/components/bulles/pieces";
import { FeuilleFormule } from "@/components/paiement/FeuilleFormule";
import { OffreAvantDePartir } from "@/components/paiement/OffreAvantDePartir";
import { AvatarPair } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { ScoreCard } from "@/components/ui/progress";
import type { ScoreRow, Story } from "@/types";

/*
 * Les maquettes du paywall sur un seul écran (16 octobre), sur les vraies pièces de l’appli : A, « Ta formule » posée
 * sur l’écran (on paie sans feuille) ; B, le teaser seul, « Ta formule » à la demande ; et l’offre ① avec un texte qui
 * dit enfin ce qu’elle est. Des propositions : le paywall en ligne (src/app/lecture/Paywall.tsx) ne change pas.
 */

type Donnees = { story: Story; scores: ScoreRow[]; trouvailles: string[] };

/** L’en-tête : vos initiales, vos prénoms, et ce que le code a compté de la conv. */
function Identite({ story, grand = false }: { story: Story; grand?: boolean }) {
  const { moi, autre } = moiEtAutre(story);
  return (
    <div className="flex items-center gap-2.5">
      <AvatarPair me={moi.initial} other={autre.initial} size={grand ? 44 : 36} />
      <div className="flex min-w-0 flex-col">
        <span className={cn("font-black leading-tight tracking-[-0.01em]", grand ? "text-titre-3" : "text-corps")}>{titreDuo(story)}</span>
        <span className="text-legende font-bold text-grey">
          {formatCount(story.totalMessages)} messages · {story.period}
        </span>
      </div>
    </div>
  );
}

/** Le logo et l’adresse du site, en haut. */
function Marque() {
  return (
    <div className="flex items-center justify-center gap-1.5 lg:justify-start">
      <BubbleLogo size={16} />
      <span className="text-note font-black">askblush.com</span>
    </div>
  );
}

/**
 * Le rapport fermé, en une carte : le verdict flouté (il s’écrit au paiement), quelques titres de chapitres sur une ligne,
 * et ce qui vient avec (le vocal, les bulles offertes). `tous` : tous les titres, rangés (l’ordinateur a la place).
 */
function RapportFerme({ story, tous = false }: { story: Story; tous?: boolean }) {
  const { autre } = moiEtAutre(story);
  const titres = Array.from({ length: NB_CHAPITRES - 1 }, (_, k) => titreDAttente(k + 2, autre.name));
  const montres = tous ? titres : [titres[0]!, titres[3]!];
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-white px-4 py-3.5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-legende font-black text-grey">Ton rapport · {NB_CHAPITRES} chapitres</span>
        <Icon name="lock" size={16} stroke={2.6} className="text-grey" />
      </div>
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-detail font-black">Le verdict</span>
        <span aria-hidden="true" className="h-2.5 flex-1 rounded-full bg-[#E9E5DD] blur-[1.5px]" />
      </div>
      <ul className={cn("m-0 flex list-none gap-1.5 p-0", tous ? "flex-wrap" : "h-[26px] flex-nowrap overflow-hidden")}>
        {montres.map((t) => (
          <li key={t} className="shrink-0 whitespace-nowrap rounded-full bg-plaque px-2.5 py-1 text-micro font-extrabold text-soft">
            {t}
          </li>
        ))}
        {!tous && <li className="shrink-0 rounded-full bg-plaque px-2.5 py-1 text-micro font-extrabold text-soft">+{titres.length - montres.length}</li>}
      </ul>
      <div className="flex items-center gap-3 text-legende font-extrabold">
        <span className="flex items-center gap-1.5">
          <Icon name="check" size={14} stroke={3} className="text-vrai-ink" />
          Ton vocal
        </span>
        <span className="flex items-center gap-1.5 text-elle-ink">
          <Perle taille={15} />
          {CATALOGUE.rapport.bulles} bulles offertes
        </span>
      </div>
    </div>
  );
}

/** Les deux formules, posées sur l’écran (A) : le rapport seul, ou Premium choisie d’avance. */
function Formules({ choix, choisir }: { choix: "rapport" | "premium"; choisir: (f: "rapport" | "premium") => void }) {
  return (
    <div role="radiogroup" aria-label="Ta formule" className="flex flex-col gap-2.5">
      <Option
        on={choix === "rapport"}
        choisir={() => choisir("rapport")}
        titre={FEUILLE_FORMULE.rapport.titre}
        note={<span className="text-elle-ink">{FEUILLE_FORMULE.rapport.note}</span>}
        prix={prixDe("rapport")}
      />
      <Option
        on={choix === "premium"}
        choisir={() => choisir("premium")}
        badge={<Tag tone="conseille" />}
        titre={FEUILLE_FORMULE.premium.titre}
        note={
          <span className="text-grey">
            <span className="text-elle-ink">{FEUILLE_FORMULE.premium.offertes}</span> · {FEUILLE_FORMULE.premium.note.replace(/^Soit /, "")}
          </span>
        }
        prix={prixDe("premium")}
        barre={enEuros(CATALOGUE.premium.barre!)}
      />
    </div>
  );
}

/** La ligne sous le bouton : paiement unique, Apple Pay ou carte. */
function Pied() {
  return (
    <p className="m-0 text-center text-micro font-extrabold text-grey">
      <span className="text-ink">{FEUILLE_FORMULE.pied.gras}</span>
      {FEUILLE_FORMULE.pied.reste}
    </p>
  );
}

/**
 * A · « Ta formule » sur l’écran : l’accroche (vos prénoms, le chiffre qui frappe), le rapport fermé en une carte, les
 * deux formules et le bouton qui paie, sans feuille. Mobile : tout tient en 375 × 667. Ordinateur : l’accroche à
 * gauche, la carte du paiement à droite.
 */
export function PaywallA({ story, scores }: Donnees) {
  const [choix, setChoix] = useState<"rapport" | "premium">("premium");
  const { autre } = moiEtAutre(story);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col gap-3 px-4 pb-4 pt-3 lg:justify-center lg:gap-8 lg:px-12 lg:py-10">
      <Marque />
      <div className="flex flex-1 flex-col gap-3 lg:grid lg:flex-none lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-14">
        <section className="flex flex-col gap-3 lg:gap-5">
          <Identite story={story} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[27px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] lg:text-[46px]">{autre.name} ouvre la conv 7 jours sur 10.</h1>
            <p className="m-0 text-detail font-extrabold leading-[1.4] text-soft lg:text-corps">Mais c’est toi qui relances. BLUSH te dit ce que ça veut dire.</p>
          </div>
          <div className="hidden lg:block">
            <ScoreCard rows={scores.slice(0, 3)} autre={autre.pronoun} />
          </div>
          <RapportFerme story={story} />
        </section>
        <section className="mt-auto flex flex-col gap-2.5 lg:mt-0 lg:gap-3 lg:rounded-[28px] lg:bg-white lg:p-6 lg:shadow-card">
          <span className="hidden text-titre-3 font-black lg:block">Débloque ton rapport</span>
          <Formules choix={choix} choisir={setChoix} />
          <Button arrow>{FEUILLE_FORMULE.payer(prixDe(choix))}</Button>
          <Pied />
        </section>
      </div>
    </div>
  );
}

/**
 * B · Le teaser seul : l’accroche, les trouvailles, le rapport fermé, et en bas « Débloquer » et les bulles offertes ;
 * « Ta formule » s’ouvre au toucher (plus d’ouverture d’office). Tout tient en 375 × 667.
 */
export function PaywallB({ story, trouvailles }: Donnees) {
  const [formule, setFormule] = useState(false);
  const [bulle, setBulle] = useState(false);
  const { autre } = moiEtAutre(story);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-3 px-4 pb-4 pt-3 lg:justify-center lg:gap-5">
      <Marque />
      <Identite story={story} grand />
      <h1 className="m-0 text-[27px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] lg:text-[40px]">Ton rapport sur toi et {autre.name} est prêt à s’écrire.</h1>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {trouvailles.slice(0, 3).map((t, k) => (
          <li
            key={t}
            className="inline-flex items-center gap-[7px] rounded-[17px] bg-white px-3 py-[7px] text-legende font-black shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_8px_18px_-8px_rgba(17,17,20,0.22)]"
          >
            <span aria-hidden="true" className={cn("size-2 rounded-full", ["bg-elle", "bg-toi", "bg-vrai"][k])} />
            {t}
          </li>
        ))}
      </ul>
      <RapportFerme story={story} />
      <div className="mt-auto flex flex-col gap-2.5 lg:mt-1">
        <Button arrow onClick={() => setFormule(true)} aria-haspopup="dialog">
          {`Lire mon rapport · ${prixDe("rapport")}`}
        </Button>
        <button
          type="button"
          onClick={() => setBulle(true)}
          className="row-hover flex items-center gap-2.5 rounded-2xl bg-[#FFE6F2] px-3.5 py-2 text-left shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]"
        >
          <Grappe taille={26} />
          <span className="flex-1 text-note font-black text-ink">{PIED_GRATUIT.offertes}</span>
          <Icon name="chevron" size={15} stroke={2.8} className="shrink-0 text-elle-ink" />
        </button>
      </div>
      <FeuilleFormule open={formule} onClose={() => setFormule(false)} autre={autre.name} chapitres={NB_CHAPITRES} suite="/lecture" proposerLaSuite={false} />
      <FeuilleBulle open={bulle} onClose={() => setBulle(false)} />
    </div>
  );
}

/** Le texte proposé pour l’offre ① : ce qu’elle vend (ton rapport), son prix, et qu’elle ne revient pas. */
const TEXTES_OFFRE_PROPOSES = {
  avant: "",
  remise: "Offre unique",
  apres: " sur ton rapport",
  sousTitre: `3\u00a0€ de moins, rien que pour toi. Dans 5 minutes, il repasse à ${prixDe("rapport")}.`,
  fin: "Elle disparaît dans",
  prendre: `Je le prends · ${prixDe("suite")}`,
};

/** L’offre ①, telle qu’en ligne, avec le texte proposé (sur un fond de paywall, comme après « Non merci » à la feuille). */
export function OffreProposee(d: Donnees) {
  const [fin] = useState(() => Date.now() + 5 * 60 * 1000 - 10_000);
  return (
    <>
      <PaywallB {...d} />
      <OffreAvantDePartir fin={fin} chapitres={NB_CHAPITRES} onRefus={() => {}} onPassee={() => {}} onClosed={() => {}} textes={TEXTES_OFFRE_PROPOSES} />
    </>
  );
}
