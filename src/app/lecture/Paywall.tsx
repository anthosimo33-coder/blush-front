"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { NB_CHAPITRES } from "@/contenu/chapitres";
import { TEMOIGNAGES, TESTIMONIALS } from "@/contenu/landing";
import { CATALOGUE, enEuros, FORMULE_CHOISIE } from "@/contenu/offres";
import { FEUILLE_FORMULE, MESSAGES_LUS, NOTE_DES_AVIS, OFFRE_SUITE, PAYWALL } from "@/contenu/paiement";
import { hautDuPaywall } from "@/contenu/haut-du-paywall";
import { bullesDuLot, DUREE_DU_CADEAU_MS, GAINS, lotSAppliqueA, prixAvecLot } from "@/contenu/roue";
import { cn } from "@/lib/cn";
import { formatCount, jourEnLettres } from "@/lib/format";
import { moiEtAutre } from "@/lib/participants";
import { useAuPaiement } from "@/lib/presence";
import { setQueryData } from "@/lib/query";
import { useFeuilleDuPaiement } from "@/lib/requetes";
import { proposerOffreUnique } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Perle } from "@/components/bulles/perles";
import { Option, RondACocher } from "@/components/bulles/pieces";
import { PetitBillet } from "@/components/paiement/Billet";
import { DebloquerAvecLAvance } from "@/components/paiement/FeuilleFormule";
import { PayerDansLaFeuille } from "@/components/paiement/integre/PayerDansLaFeuille";
import { OffreAvantDePartir, restant } from "@/components/paiement/OffreAvantDePartir";
import { FeuilleDeLaRoue } from "@/components/roue/FeuilleDeLaRoue";
import { CarteTemoignage } from "@/components/temoignages/CarteTemoignage";
import { AvatarPair } from "@/components/ui/Avatar";
import { RadioGroup } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { Toast } from "@/components/ui/surfaces";
import { BulleDeBlush, CarteDuHaut, PreuveDuHaut, TitreDuHaut } from "./HautDuPaywall";
import type { ApercuDuPaywall, Formule, LotDeLaRoue, OffreId, Story, Testimonial } from "@/types";
import type { RoueDuCompte } from "@/types/api";

/*
 * Le paywall, avant toute lecture (décidé le 16 octobre), en version « prime » (les maquettes G3, G4 et l’ordinateur,
 * validées le 16 octobre) : la conv est importée, « Qui es-tu ? » rempli, et rien n’est encore parti au modèle.
 * D’abord la roue des cadeaux (FeuilleDeLaRoue), une fois par compte ; son lot gagné vaut 15 minutes, dans le bandeau
 * du haut et sur les formules (prixAvecLot, bullesDuLot : le serveur fait payer le même prix). Puis vos prénoms, le
 * haut du paywall (« Le mix », validé le 16 octobre : un titre parmi cinq, tiré de ce que le code a compté, ses chiffres
 * et la bulle de BLUSH, ./HautDuPaywall.tsx), la note des avis (seulement de vrais avis), les deux formules (Premium
 * choisie d’avance, ses cadeaux à 0 €), le bouton qui paie (Apple Pay ou la carte, dans BLUSH), la discrétion. En
 * descendant : les témoignages (de vrais clients seulement), un avant / après (marqué « exemple ») et les questions ; sur
 * téléphone, une barre en bas ramène au bouton qui paie quand il est sorti de l’écran. Ordinateur : le titre, sa carte et
 * l’avant / après à gauche, le paiement à droite, les témoignages dessous.
 * L’offre ① vient d’elle-même, une fois : au retour sur l’onglet, ou après OFFRE_APRES_MS sans payer. Jamais avec un lot
 * de la roue (le serveur la refuse aussi), ni pendant que la roue attend. Payé, « C’est débloqué » mène à la vraie
 * lecture (/lecture).
 */

/** Sans payer, l’offre ① arrive au bout de ce temps (ou au retour sur l’onglet, si c’est avant). */
const OFFRE_APRES_MS = 40_000;

export function Paywall({ story, apercu, temoignages = TESTIMONIALS }: { story: Story; apercu: ApercuDuPaywall; temoignages?: Testimonial[] }) {
  const { moi, autre } = moiEtAutre(story);
  const elle = autre.pronoun !== "il";
  const haut = hautDuPaywall(apercu, { nom: autre.name, il: !elle });
  /* Sur téléphone, les cases (ou la courbe) disent ce que dit la phrase : elle ne reste que s’il n’y en a pas */
  const preuve = haut.cases.length > 0 || !!haut.courbe;
  const feuille = useFeuilleDuPaiement();
  const roue = feuille.data?.roue ?? null;
  /* La roue s’ouvre une fois, à l’arrivée, si elle est à tourner ; ensuite, l’écran seul décide (elle reste ouverte le temps du tour) */
  const [vueRoue, setVueRoue] = useState<"attente" | "ouverte" | "fermee">("attente");
  const roueOuverte = vueRoue === "ouverte" || (vueRoue === "attente" && roue?.etat === "a_tourner");
  /* Le lot passé sous nos yeux (le minuteur à zéro) : les prix redeviennent ceux du catalogue */
  const [passe, setPasse] = useState(false);
  const lot = roue?.etat === "gagnee" && roue.valable && !passe ? roue.lot : null;
  const paiement = useRef<HTMLElement>(null);

  const joue = (r: RoueDuCompte) => {
    setVueRoue((v) => (v === "fermee" ? v : "ouverte"));
    if (feuille.data) setQueryData("feuille", { ...feuille.data, roue: r });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full flex-col">
      {lot && roue?.etat === "gagnee" && <BandeauDuCadeau key={roue.fin} lot={lot} reste={roue.reste} onPasse={() => setPasse(true)} />}
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-3 px-4 pb-6 pt-3 lg:gap-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BubbleLogo size={16} />
            <span className="text-note font-black">askblush.com</span>
          </div>
          <AvatarPair me={moi.initial} other={autre.initial} size={26} />
        </div>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-14">
          <section className="flex flex-col gap-3 lg:gap-6">
            <div className="flex flex-col gap-1.5 pt-1 lg:gap-3">
              <span className="text-legende font-black text-grey lg:text-note">{PAYWALL.conv(formatCount(story.totalMessages))}</span>
              <TitreDuHaut titre={haut.titre} />
              {haut.sous && <p className={cn("m-0 text-detail font-extrabold leading-[1.4] text-soft lg:text-[19px] lg:leading-[1.42]", preuve && "max-lg:hidden")}>{haut.sous}</p>}
              <Preuves />
            </div>
            <PreuveDuHaut haut={haut} className="lg:hidden" />
            <BulleDeBlush question={haut.question} className="lg:hidden" />
            <CarteDuHaut haut={haut} autre={autre.name} className="hidden lg:flex" />
            <AvantApres elle={elle} className="hidden lg:flex" />
          </section>
          <Paiement ref={paiement} lot={lot} sansOffre={roue?.etat === "a_tourner" || roue?.etat === "gagnee"} autre={autre.name} elle={elle} />
        </div>
        <Temoignages items={temoignages} />
        <AvantApres elle={elle} className="lg:hidden" />
        <Questions autre={autre.name} elle={elle} />
      </div>
      <BarreDuBas cible={paiement} lot={lot} />
      <FeuilleDeLaRoue open={roueOuverte} onJoue={joue} onFermer={() => setVueRoue("fermee")} />
    </main>
  );
}

/** Le bandeau du haut : le lot gagné à la roue et son minuteur (sa fin tirée du temps qu’il lui restait à l’heure du serveur). */
function BandeauDuCadeau({ lot, reste, onPasse }: { lot: LotDeLaRoue; reste: number; onPasse: () => void }) {
  const [fin] = useState(() => Date.now() + reste);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const passe = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, fin - maintenant);
  useEffect(() => {
    if (ms > 0 || passe.current) return;
    passe.current = true;
    onPasse();
  }, [ms, onPasse]);
  return (
    <div
      role="status"
      className="flex min-h-[34px] items-center justify-center gap-2 bg-[linear-gradient(90deg,#FF7AB6,#E8358A)] px-4 text-center text-legende font-black text-white lg:min-h-10 lg:text-note"
    >
      <Icon name="sparkle" size={14} stroke={2.4} />
      <span>
        {GAINS[lot].bandeau} · encore{" "}
        <span role="timer" aria-live="off" className="tabular-nums" title={`${Math.round(DUREE_DU_CADEAU_MS / 60_000)} minutes en tout`}>
          {restant(ms)}
        </span>
      </span>
    </div>
  );
}

/** Sous le titre : la note des avis (de vrais avis seulement) et tout ce que BLUSH a lu ; rien tant qu’ils manquent. */
function Preuves() {
  if (!NOTE_DES_AVIS && !MESSAGES_LUS) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-legende font-extrabold text-grey lg:text-note">
      {NOTE_DES_AVIS && (
        <>
          <span aria-hidden="true" className="text-attente">
            ★
          </span>
          <span className="font-black text-ink">{NOTE_DES_AVIS.note}</span>
          {PAYWALL.avis(NOTE_DES_AVIS.nombre)}
        </>
      )}
      {MESSAGES_LUS && PAYWALL.messagesLus(MESSAGES_LUS)}
    </p>
  );
}

type Choix = Formule | "avance";

/**
 * Le paiement (la maquette « La formule · après », 17 octobre) : « Ton rapport sur Léa », les deux formules (Premium
 * choisie d’avance, son écart avec le rapport seul, ses réponses offertes à 0 €, le lot de la roue ; « Le plus choisi »
 * seulement quand c’est vrai), ou ce que le compte a d’avance (le rapport d’avance, le −50 % gardé), puis le bouton qui
 * paie (Apple Pay, Google Pay ou la carte, dans BLUSH), et une ligne : paiement unique, l’autre jamais prévenu. Payé :
 * « C’est payé », puis « C’est débloqué ». Et l’offre ①, quand elle vient (`sansOffre` : la roue attend, ou un lot est
 * gagné).
 */
function Paiement({ ref, lot, sansOffre, autre, elle }: { ref: Ref<HTMLElement>; lot: LotDeLaRoue | null; sansOffre: boolean; autre: string; elle: boolean }) {
  useAuPaiement(true);
  const avoirs = useFeuilleDuPaiement().data;
  const [choix, setChoix] = useState<Choix | null>(null);
  const garde = avoirs?.garde ?? null;
  const choisie: Choix = choix ?? (avoirs?.avance ? "avance" : garde ? "rapport" : FORMULE_CHOISIE);
  const offre: OffreId = choisie === "rapport" && garde ? "rapport_garde" : choisie === "avance" ? "rapport" : choisie;
  const [paye, setPaye] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const { suiteMontree, passee, setPassee, fermer } = useOffreSuite({ sans: !!avoirs?.avance || !!garde || sansOffre, enRoute: paye || occupe });
  /* Le rapport déjà débloqué ailleurs (un autre onglet, 409 « deja ») : relu, la vraie lecture reprend ici */
  const relire = () => window.location.reload();

  const rapport = garde ? { centimes: CATALOGUE.rapport_garde.centimes, barre: CATALOGUE.rapport.centimes } : prixAvecLot("rapport", lot);
  const premium = prixAvecLot("premium", lot);
  /* L’offre payée : Premium, ou le rapport (à son prix, au −50 % gardé, ou avec le lot) */
  const prix = offre === "premium" ? premium : rapport;
  const lotSurRapport = !garde && lot && lotSAppliqueA(lot, "rapport") ? lot : null;
  const lotSurPremium = lot && lotSAppliqueA(lot, "premium") ? lot : null;
  /* Premium : barrée seulement par un vrai ancien prix (celui d’avant le lot de la roue), et ce qu’elle coûte de plus que le rapport seul */
  const barrePremium = lotSurPremium && premium.centimes < CATALOGUE.premium.centimes ? CATALOGUE.premium.centimes : null;
  const ecart = premium.centimes - rapport.centimes;

  return (
    <section ref={ref} className="flex scroll-mt-4 flex-col gap-3 lg:sticky lg:top-6 lg:rounded-[28px] lg:bg-white lg:p-6 lg:shadow-card">
      {!paye && (
        <>
          <span className="pt-1 text-legende font-black text-grey lg:text-titre-3 lg:text-ink">{PAYWALL.formule(autre)}</span>
          <RadioGroup label={FEUILLE_FORMULE.groupe} className="flex flex-col gap-3.5">
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
            <Formule
              on={choisie === "rapport"}
              choisir={() => setChoix("rapport")}
              titre={PAYWALL.rapport.titre}
              note={
                garde ? (
                  <span className="text-elle-ink">{FEUILLE_FORMULE.garde(jourEnLettres(garde.fin))}</span>
                ) : (
                  PAYWALL.rapport.note(CATALOGUE.rapport.bulles + bullesDuLot(lotSurRapport))
                )
              }
              prix={enEuros(rapport.centimes)}
              barre={rapport.barre && rapport.barre > rapport.centimes ? enEuros(rapport.barre) : undefined}
            >
              {lotSurRapport && <LigneCadeau lot={lotSurRapport} valeur={valeurDuLot(lotSurRapport, "rapport")} />}
            </Formule>
            <Formule
              on={choisie === "premium"}
              choisir={() => setChoix("premium")}
              badge={<Tag tone="conseille">{avoirs?.premiumPlusChoisi ? PAYWALL.premium.plusChoisi : undefined}</Tag>}
              titre={PAYWALL.premium.titre}
              note={PAYWALL.premium.note(autre)}
              prix={enEuros(premium.centimes)}
              barre={barrePremium ? enEuros(barrePremium) : undefined}
              ecart={ecart > 0 ? PAYWALL.premium.ecart(ecart) : undefined}
            >
              <LigneCadeau perle titre={PAYWALL.premium.offertes(CATALOGUE.premium.bulles)} barre={PAYWALL.premium.barreOffertes} valeur={PAYWALL.gratuit} />
              {lotSurPremium && <LigneCadeau lot={lotSurPremium} valeur={valeurDuLot(lotSurPremium, "premium")} />}
            </Formule>
          </RadioGroup>
        </>
      )}
      <div className="flex flex-col gap-1">
        {choisie === "avance" ? (
          <DebloquerAvecLAvance suite="/lecture" deja={relire} />
        ) : (
          <PayerDansLaFeuille
            offre={offre}
            centimes={prix.centimes}
            titre={CATALOGUE[offre].titre}
            libelle={FEUILLE_FORMULE.payer(enEuros(prix.centimes))}
            quoi="rapport"
            suite="/lecture"
            quand={{ deja: relire }}
            surPaye={setPaye}
            surOccupe={setOccupe}
            fleche
            sansCarteGardee
          />
        )}
      </div>
      {!paye && choisie !== "avance" && (
        <p className="m-0 flex items-center justify-center gap-1 text-center text-legende font-extrabold text-soft">
          <Icon name="lock" size={13} stroke={2.6} className="shrink-0" />
          <span>
            <span className="font-black text-ink">{PAYWALL.paiementUnique}</span> · {PAYWALL.jamaisPrevenu(autre, elle)}
          </span>
        </p>
      )}
      {suiteMontree && <OffreAvantDePartir fin={suiteMontree} chapitres={NB_CHAPITRES} suite="/lecture" onRefus={() => {}} onPassee={() => setPassee(true)} onClosed={fermer} />}
      {passee && <Toast className="fixed inset-x-4 top-3 z-[95] lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{OFFRE_SUITE.passee}</Toast>}
    </section>
  );
}

/** Ce qu’un lot vaut sur cette formule, à droite de sa ligne : la remise en euros, ou « 0 € » (des bulles, le 2e rapport). */
function valeurDuLot(lot: LotDeLaRoue, offre: Formule): string {
  const avant = CATALOGUE[offre].centimes;
  const apres = prixAvecLot(offre, lot).centimes;
  return apres < avant ? `−${enEuros(avant - apres)}` : PAYWALL.gratuit;
}

/**
 * Une formule (la maquette G3) : son rond, son nom, sa ligne, son prix (barré à côté, et son écart avec l’autre formule)
 * et son badge sur le bord ; dessous, ses cadeaux, une ligne chacun (`children`), seulement quand elle est choisie.
 */
function Formule({
  on,
  choisir,
  badge,
  titre,
  note,
  prix,
  barre,
  ecart,
  children,
}: {
  on: boolean;
  choisir: () => void;
  badge?: ReactNode;
  titre: string;
  note: ReactNode;
  prix: string;
  barre?: string;
  /** Sous le prix, en rose : ce qu’elle coûte de plus que l’autre formule (« 5 € de plus »). */
  ecart?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={choisir}
      className={cn("lift relative flex flex-col gap-2.5 rounded-[20px] bg-white px-4 py-3 text-left text-ink max-[399px]:px-3", on ? "shadow-selected" : "shadow-soft")}
    >
      {badge && <span className="absolute -top-[13px] right-4">{badge}</span>}
      <span className="flex w-full items-center gap-3 max-[399px]:gap-2.5">
        <RondACocher on={on} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-corps font-black leading-[1.25]">{titre}</span>
          <span className="text-legende font-extrabold leading-[1.4] text-grey">{note}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-[20px] font-black leading-none tracking-[-0.01em] max-[399px]:text-[18px]">{prix}</span>
          {barre && (
            <s className="mt-1 text-micro font-extrabold text-grey">
              <span className="sr-only">{FEUILLE_FORMULE.auLieuDe}</span>
              {barre}
            </s>
          )}
          {ecart && <span className="mt-1 whitespace-nowrap text-micro font-black text-elle-ink">{ecart}</span>}
        </span>
      </span>
      {on && children && <span className="flex w-full flex-col gap-1.5">{children}</span>}
    </button>
  );
}

/** Un cadeau de la formule, sur fond rose : les bulles offertes (la perle, leur prix barré, « 0 € »), ou le lot de la roue. */
function LigneCadeau({ lot, perle, titre, barre, valeur }: { lot?: LotDeLaRoue; perle?: boolean; titre?: string; barre?: string; valeur: string }) {
  return (
    <span className="flex items-center gap-2.5 rounded-[11px] bg-[#FFF0F6] px-2.5 py-1.5 text-legende font-black">
      {perle ? <Perle taille={14} /> : <Icon name="sparkle" size={14} stroke={2.4} className="text-elle-ink" />}
      <span className="min-w-0 flex-1">{titre ?? (lot ? GAINS[lot].ligne : "")}</span>
      {barre && (
        <s className="text-micro font-extrabold text-grey">
          <span className="sr-only">{FEUILLE_FORMULE.auLieuDe}</span>
          {barre}
        </s>
      )}
      <span className="text-elle-ink">{valeur}</span>
    </span>
  );
}

/**
 * Les témoignages (la maquette A1) : « Ils se posaient la même question. », la note des avis, puis leurs cartes, qui
 * défilent de côté sur téléphone (de vrais clients seulement : sans eux, rien).
 */
function Temoignages({ items }: { items: Testimonial[] }) {
  const piste = useRef<HTMLDivElement>(null);
  if (!items.length) return null;
  const defiler = (sens: 1 | -1) => piste.current?.scrollBy({ left: sens * (piste.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section aria-labelledby="temoignages" className="flex flex-col gap-5 pt-8 lg:items-center lg:gap-11 lg:pt-14">
      <div className="flex flex-col items-center gap-2 lg:gap-2.5">
        <h2
          id="temoignages"
          className="m-0 text-center text-[30px] font-black leading-[1.06] tracking-[-0.03em] [text-wrap:balance] lg:text-[46px] lg:leading-[1.05] lg:tracking-[-0.035em]"
        >
          {TEMOIGNAGES.titre}
        </h2>
        {NOTE_DES_AVIS && (
          <p className="m-0 flex items-center gap-1.5 text-legende font-extrabold text-grey lg:text-detail">
            <span aria-hidden="true" className="text-attente">
              ★★★★★
            </span>
            <span className="font-black text-ink">{NOTE_DES_AVIS.note}</span>
            {PAYWALL.avis(NOTE_DES_AVIS.nombre)}
          </p>
        )}
      </div>
      <div
        ref={piste}
        className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] lg:mx-0 lg:grid lg:w-full lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {items.map((t) => (
          <CarteTemoignage key={t.name + t.label} t={t} className="w-[312px] shrink-0 snap-start lg:w-auto" />
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-4 lg:hidden">
          <button
            type="button"
            aria-label={PAYWALL.precedent}
            onClick={() => defiler(-1)}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--color-track)]"
          >
            <Icon name="back" size={15} stroke={2.6} />
          </button>
          <button
            type="button"
            aria-label={PAYWALL.suivant}
            onClick={() => defiler(1)}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--color-track)]"
          >
            <Icon name="chevron" size={15} stroke={2.6} />
          </button>
        </div>
      )}
    </section>
  );
}

/** L’avant / après (un message inventé, marqué « exemple ») : la réponse sans BLUSH, puis avec. */
function AvantApres({ elle, className }: { elle: boolean; className?: string }) {
  const t = PAYWALL.avantApres;
  return (
    <div className={cn("flex-col gap-3 rounded-[22px] bg-white p-4 shadow-card lg:p-5", className ?? "flex")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-detail font-black">{t.titre(elle)}</span>
        <span className="text-micro font-extrabold text-muted">{t.exemple}</span>
      </div>
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3.5">
        <div className="flex items-center gap-2.5 lg:flex-col lg:items-stretch lg:rounded-[16px] lg:bg-paper lg:p-3.5">
          <span className="w-[74px] shrink-0 text-micro font-black text-grey lg:w-auto">{t.sans}</span>
          <span className="flex-1 rounded-[16px] rounded-br-[5px] bg-segment px-3 py-2 font-message text-note lg:flex-none lg:self-end">{t.sansReponse}</span>
          <span className="hidden text-legende font-extrabold text-muted lg:block">{t.sansSuite(elle)}</span>
        </div>
        <div className="flex items-center gap-2.5 lg:flex-col lg:items-stretch lg:rounded-[16px] lg:bg-[#FFF0F6] lg:p-3.5 lg:shadow-[inset_0_0_0_1.5px_#FFB3D4]">
          <span className="w-[74px] shrink-0 text-micro font-black text-elle-ink lg:w-auto">{t.avec}</span>
          <span className="flex-1 rounded-[16px] rounded-br-[5px] bg-bubble-me px-3 py-2 font-message text-note text-white lg:flex-none lg:self-end">{t.avecReponse}</span>
          <span className="hidden text-legende font-extrabold text-elle-ink lg:block">{t.avecSuite(elle)}</span>
        </div>
      </div>
    </div>
  );
}

/** Les questions, en bas : la discrétion, l’abonnement, un souci (des volets qui s’ouvrent). */
function Questions({ autre, elle }: { autre: string; elle: boolean }) {
  return (
    <div className="mt-2 flex flex-col rounded-[18px] bg-white px-4 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)] lg:mx-auto lg:w-full lg:max-w-[720px]">
      {PAYWALL.questions(autre, elle).map(({ q, r }, k) => (
        <details key={q} open={k === 0} className="group border-b border-sep py-3.5 last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-note font-black [&::-webkit-details-marker]:hidden">
            {q}
            <Icon name="chevron" size={12} stroke={3} className="shrink-0 rotate-90 transition-transform group-open:-rotate-90" />
          </summary>
          <p className="m-0 mt-1.5 text-legende font-extrabold leading-[1.45] text-grey">{r}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * La barre du bas, sur téléphone : quand le bouton qui paie est sorti de l’écran (plus bas, les témoignages), elle
 * rappelle la formule et son prix, et y ramène. Jamais sur ordinateur (la carte du paiement y reste visible).
 */
function BarreDuBas({ cible, lot }: { cible: RefObject<HTMLElement | null>; lot: LotDeLaRoue | null }) {
  const [montree, setMontree] = useState(false);
  useEffect(() => {
    const el = cible.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => setMontree(!!e && !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    o.observe(el);
    return () => o.disconnect();
  }, [cible]);
  if (!montree) return null;
  const premium = prixAvecLot("premium", lot);
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-[rgba(244,242,237,0.96)] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_24px_-16px_rgba(17,17,20,0.25)] lg:hidden">
      <span className="flex flex-1 flex-col">
        <span className="text-legende font-black">{PAYWALL.premium.titre}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[20px] font-black">{enEuros(premium.centimes)}</span>
          {premium.barre && <s className="text-micro font-extrabold text-grey">{enEuros(premium.barre)}</s>}
        </span>
      </span>
      <button
        type="button"
        aria-label={PAYWALL.barreAller}
        onClick={() => cible.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="lift lift-ink flex h-[50px] items-center gap-2 rounded-full [background:var(--btn-ink-bg)] px-6 text-corps font-black text-white shadow-ink"
      >
        {PAYWALL.barre}
        <Icon name="arrow" size={16} stroke={2.6} />
      </button>
    </div>
  );
}

/**
 * L’offre ① du paywall : demandée au serveur une fois (une fois par compte, jamais deux offres le même jour : il peut
 * refuser), au retour sur l’onglet après l’avoir quitté, ou après OFFRE_APRES_MS sans payer. `sans` : le compte a déjà
 * mieux (le rapport d’avance, le −50 % gardé), ou la roue attend, ou un lot est gagné ; `enRoute` : un paiement est en
 * cours ou fait.
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
