"use client";

import { useEffect, useRef, useState } from "react";
import { NB_CHAPITRES, titreDAttente } from "@/contenu/chapitres";
import { CATALOGUE, enEuros, FORMULE_CHOISIE, prixDe } from "@/contenu/offres";
import { FEUILLE_FORMULE, OFFRE_SUITE, PAYWALL } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { formatCount, jourEnLettres } from "@/lib/format";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { useAuPaiement } from "@/lib/presence";
import { useFeuilleDuPaiement } from "@/lib/requetes";
import { proposerOffreUnique } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { Perle } from "@/components/bulles/perles";
import { Option } from "@/components/bulles/pieces";
import { PetitBillet } from "@/components/paiement/Billet";
import { DebloquerAvecLAvance } from "@/components/paiement/FeuilleFormule";
import { PayerDansLaFeuille } from "@/components/paiement/integre/PayerDansLaFeuille";
import { OffreAvantDePartir } from "@/components/paiement/OffreAvantDePartir";
import { AvatarPair } from "@/components/ui/Avatar";
import { RadioGroup } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { ScoreCard } from "@/components/ui/progress";
import { Toast } from "@/components/ui/surfaces";
import type { Formule, OffreId, ScoreRow, Story } from "@/types";

/*
 * Le paywall, avant toute lecture (décidé le 16 octobre), sur un seul écran (la maquette A, validée le 16 octobre) : la
 * conv est importée, « Qui es-tu ? » rempli, et rien n’est encore parti au modèle. Vos prénoms, le chiffre qui frappe
 * (une trouvaille du code), le rapport fermé en une carte, puis les deux formules et le bouton qui paie, sans feuille.
 * Mobile : tout tient en 375 × 667 (resserré sous 700 px de haut) ; ordinateur : l’accroche à gauche (avec les lignes du code), le paiement à droite.
 * L’offre ① vient d’elle-même, une fois : au retour sur l’onglet après l’avoir quitté, ou après OFFRE_APRES_MS sans
 * payer (il n’y a plus de feuille à fermer). Payé, « C’est débloqué » mène à la vraie lecture (/lecture).
 */

/** Sans payer, l’offre ① arrive au bout de ce temps (ou au retour sur l’onglet, si c’est avant). */
const OFFRE_APRES_MS = 40_000;

/** Une trouvaille du code qui nomme l’autre (« Elle ouvre la conv… » devient « Léa ouvre la conv… »), pour le titre. */
export const nommer = (trouvaille: string, prenom: string) => trouvaille.replace(/^(Elle|Il) /, `${prenom} `);

/** Une trouvaille qui dit un déséquilibre entre vous deux (« Elle ouvre… », « Tu relances… ») : la seule qui fasse un titre. */
const desequilibre = (t: string) => /^(Elle|Il|Tu) /.test(t);

/**
 * Le titre et la ligne dessous : le premier déséquilibre, qui nomme l’autre, puis la trouvaille suivante et la promesse.
 * Sans déséquilibre (une conv équilibrée, ou trop courte), le rapport qui l’attend, et la première trouvaille dessous.
 */
export function accroche(trouvailles: string[], prenom: string): { titre: string; sous: string } {
  const choc = trouvailles.find(desequilibre);
  const autre = trouvailles.find((t) => t !== choc);
  return { titre: choc ? `${nommer(choc, prenom)}.` : PAYWALL.titre(prenom), sous: autre ? `${autre}. ${PAYWALL.promesse}` : PAYWALL.promesse };
}

export function Paywall({ story, scores, trouvailles }: { story: Story; scores: ScoreRow[]; trouvailles: string[] }) {
  const { moi, autre } = moiEtAutre(story);
  const { titre, sous } = accroche(trouvailles, autre.name);
  const [bulle, setBulle] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col gap-3 px-4 pb-4 pt-3 max-lg:[@media(max-height:700px)]:gap-2 max-lg:[@media(max-height:700px)]:pt-2 lg:justify-center lg:gap-8 lg:px-12 lg:py-10">
      <div className="flex items-center justify-center gap-1.5 lg:justify-start">
        <BubbleLogo size={16} />
        <span className="text-note font-black">askblush.com</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 max-lg:[@media(max-height:700px)]:gap-2 lg:grid lg:flex-none lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-14">
        <section className="flex flex-col gap-3 max-lg:[@media(max-height:700px)]:gap-2 lg:gap-5">
          <div className="flex items-center gap-2.5">
            <AvatarPair me={moi.initial} other={autre.initial} size={36} />
            <div className="flex min-w-0 flex-col">
              <span className="text-corps font-black leading-tight tracking-[-0.01em]">{titreDuo(story)}</span>
              <span className="text-legende font-bold text-grey">
                {formatCount(story.totalMessages)} messages · {story.period}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[27px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] max-lg:[@media(max-height:700px)]:text-[24px] lg:text-[46px]">
              {titre}
            </h1>
            <p className="m-0 text-detail font-extrabold leading-[1.4] text-soft lg:text-corps">{sous}</p>
          </div>
          {scores.length > 0 && (
            <div className="hidden lg:block">
              <ScoreCard rows={scores.slice(0, 3)} autre={autre.pronoun} />
            </div>
          )}
          <RapportFerme autre={autre.name} expliquer={() => setBulle(true)} />
        </section>
        <Paiement />
      </div>
      <FeuilleBulle open={bulle} onClose={() => setBulle(false)} />
    </main>
  );
}

/**
 * Le rapport fermé, en une carte : le verdict flouté (il s’écrit au paiement : des lignes vides, jamais un faux texte),
 * deux titres de chapitres sur une ligne et ce qu’il en reste, le vocal, et les bulles offertes (« C’est quoi une bulle ? »).
 */
function RapportFerme({ autre, expliquer }: { autre: string; expliquer: () => void }) {
  const titres = Array.from({ length: NB_CHAPITRES - 1 }, (_, k) => titreDAttente(k + 2, autre));
  /* La bascule et l’autre : courts et parlants, sur une ligne même en 375 px */
  const montres = [titres[0]!, titres[3]!];
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-white px-4 py-3.5 shadow-card max-lg:[@media(max-height:700px)]:gap-2 max-lg:[@media(max-height:700px)]:py-3">
      <div className="flex items-center justify-between">
        <span className="text-legende font-black text-grey">{PAYWALL.chapitres(NB_CHAPITRES)}</span>
        <Icon name="lock" size={16} stroke={2.6} className="text-grey" />
      </div>
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-detail font-black">{PAYWALL.verdict}</span>
        <span aria-hidden="true" className="h-2.5 flex-1 rounded-full bg-[#E9E5DD] blur-[1.5px]" />
      </div>
      <ul className="m-0 flex h-[26px] list-none flex-nowrap gap-1.5 overflow-hidden p-0" aria-label={PAYWALL.chapitres(NB_CHAPITRES)}>
        {montres.map((t) => (
          <li key={t} className="shrink-0 whitespace-nowrap rounded-full bg-plaque px-2.5 py-1 text-micro font-extrabold text-soft">
            {t}
          </li>
        ))}
        <li className="shrink-0 rounded-full bg-plaque px-2.5 py-1 text-micro font-extrabold text-soft">+{titres.length - montres.length}</li>
      </ul>
      <div className="flex items-center gap-3 text-legende font-extrabold">
        <span className="flex items-center gap-1.5">
          <Icon name="check" size={14} stroke={3} className="text-vrai-ink" />
          {PAYWALL.vocal}
        </span>
        <button type="button" onClick={expliquer} aria-haspopup="dialog" className="flex items-center gap-1.5 text-elle-ink underline-offset-2 hover:underline">
          <Perle taille={15} />
          {PAYWALL.bulles}
        </button>
      </div>
    </div>
  );
}

type Choix = Formule | "avance";

/**
 * Le paiement, sur l’écran : les deux formules (Premium choisie d’avance), ou ce que le compte a d’avance (le rapport
 * d’avance, le −50 % gardé), puis le bouton qui paie (Apple Pay, Google Pay ou la carte, dans BLUSH). Payé : « C’est
 * payé », puis « C’est débloqué ». Et l’offre ①, quand elle vient.
 */
function Paiement() {
  useAuPaiement(true);
  const avoirs = useFeuilleDuPaiement().data;
  const [choix, setChoix] = useState<Choix | null>(null);
  const garde = avoirs?.garde ?? null;
  const choisie: Choix = choix ?? (avoirs?.avance ? "avance" : garde ? "rapport" : FORMULE_CHOISIE);
  const offre: OffreId = choisie === "rapport" && garde ? "rapport_garde" : choisie === "avance" ? "rapport" : choisie;
  const [paye, setPaye] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const { suiteMontree, passee, setPassee, fermer } = useOffreSuite({ sans: !!avoirs?.avance || !!garde, enRoute: paye || occupe });
  /* Le rapport déjà débloqué ailleurs (un autre onglet, 409 « deja ») : relu, la vraie lecture reprend ici */
  const relire = () => window.location.reload();

  return (
    <section className="mt-auto flex flex-col gap-2.5 max-lg:[@media(max-height:700px)]:gap-2 lg:mt-0 lg:gap-3 lg:rounded-[28px] lg:bg-white lg:p-6 lg:shadow-card">
      <span className={cn("hidden text-titre-3 font-black lg:block", paye && "lg:hidden")}>{PAYWALL.carte}</span>
      {!paye && (
        <RadioGroup label={FEUILLE_FORMULE.groupe} className="flex flex-col gap-2.5 max-lg:[@media(max-height:700px)]:gap-2">
          {avoirs?.avance && (
            <Option
              on={choisie === "avance"}
              choisir={() => setChoix("avance")}
              titre={
                <span className="flex items-center gap-2">
                  <PetitBillet taille={18} />
                  {FEUILLE_FORMULE.avance.titre}
                </span>
              }
              note={<span className="text-elle-ink">{FEUILLE_FORMULE.avance.note}</span>}
              prix={FEUILLE_FORMULE.avance.prix}
            />
          )}
          <Option
            on={choisie === "rapport"}
            choisir={() => setChoix("rapport")}
            titre={FEUILLE_FORMULE.rapport.titre}
            note={<span className="text-elle-ink">{garde ? FEUILLE_FORMULE.garde(jourEnLettres(garde.fin)) : FEUILLE_FORMULE.rapport.note}</span>}
            prix={prixDe(garde ? "rapport_garde" : "rapport")}
            barre={garde ? prixDe("rapport") : undefined}
          />
          <Option
            on={choisie === "premium"}
            choisir={() => setChoix("premium")}
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
        </RadioGroup>
      )}
      {choisie === "avance" ? (
        <DebloquerAvecLAvance suite="/lecture" deja={relire} />
      ) : (
        <PayerDansLaFeuille
          offre={offre}
          centimes={CATALOGUE[offre].centimes}
          titre={CATALOGUE[offre].titre}
          libelle={FEUILLE_FORMULE.payer(prixDe(offre))}
          quoi="rapport"
          suite="/lecture"
          quand={{ deja: relire }}
          surPaye={setPaye}
          surOccupe={setOccupe}
          fleche
        />
      )}
      {!paye && choisie !== "avance" && (
        <p className="m-0 text-center text-micro font-extrabold text-grey">
          <span className="font-black text-ink">{FEUILLE_FORMULE.pied.gras}</span>
          {FEUILLE_FORMULE.pied.reste}
        </p>
      )}
      {suiteMontree && <OffreAvantDePartir fin={suiteMontree} chapitres={NB_CHAPITRES} suite="/lecture" onRefus={() => {}} onPassee={() => setPassee(true)} onClosed={fermer} />}
      {passee && <Toast className="fixed inset-x-4 top-3 z-[95] lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{OFFRE_SUITE.passee}</Toast>}
    </section>
  );
}

/**
 * L’offre ① du paywall : demandée au serveur une fois (une fois par compte, jamais deux offres le même jour : il peut
 * refuser), au retour sur l’onglet après l’avoir quitté, ou après OFFRE_APRES_MS sans payer. `sans` : le compte a déjà
 * mieux (le rapport d’avance, le −50 % gardé) ; `enRoute` : un paiement est en cours ou fait.
 */
function useOffreSuite({ sans, enRoute }: { sans: boolean; enRoute: boolean }) {
  const [suiteMontree, setSuiteMontree] = useState<number | null>(null);
  const [passee, setPassee] = useState(false);
  const demandee = useRef(false);
  const occupe = useRef(enRoute);
  useEffect(() => {
    occupe.current = enRoute;
  }, [enRoute]);
  useEffect(() => {
    if (sans) return;
    let vivant = true;
    const proposer = () => {
      if (demandee.current || occupe.current) return;
      demandee.current = true;
      proposerOffreUnique("suite").then(
        (o) => {
          if (vivant && o.offre === "suite" && o.reste !== null) setSuiteMontree(Date.now() + o.reste);
        },
        () => {},
      );
    };
    const minuteur = setTimeout(proposer, OFFRE_APRES_MS);
    let partie = false;
    const vu = () => {
      if (document.visibilityState === "hidden") partie = true;
      else if (partie) proposer();
    };
    document.addEventListener("visibilitychange", vu);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
      document.removeEventListener("visibilitychange", vu);
    };
  }, [sans]);
  useEffect(() => {
    if (!passee) return;
    const t = setTimeout(() => setPassee(false), 2600);
    return () => clearTimeout(t);
  }, [passee]);
  return { suiteMontree, passee, setPassee, fermer: () => setSuiteMontree(null) };
}
