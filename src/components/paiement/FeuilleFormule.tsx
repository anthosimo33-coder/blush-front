"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useAuPaiement } from "@/lib/presence";
import { CATALOGUE, enEuros, FORMULE_CHOISIE, prixDe } from "@/contenu/offres";
import { CHAPITRES_A_DEBLOQUER, FEUILLE_FORMULE, OFFRE_SUITE } from "@/contenu/paiement";
import { jourEnLettres } from "@/lib/format";
import { codeDe } from "@/lib/messages-erreur";
import { versDebloque } from "@/lib/paiement";
import { apresDeblocage, useFeuilleDuPaiement } from "@/lib/requetes";
import { proposerOffreUnique, utiliserAvance } from "@/services/api";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { Cadeau, Perle } from "@/components/bulles/perles";
import { CestQuoiUneBulle, Contenu, Option, RondACocher } from "@/components/bulles/pieces";
import { MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Sheet, Toast } from "@/components/ui/surfaces";
import type { Formule, OffreId } from "@/types";
import { PetitBillet } from "./Billet";
import { PayerDansLaFeuille } from "./integre/PayerDansLaFeuille";
import { OffreAvantDePartir } from "./OffreAvantDePartir";

/*
 * Écran 10 — la feuille « Ta formule » (le prototype validé des bulles, 12 octobre) : le rapport seul, ou Premium,
 * choisie d’avance et ouverte (son badge, ce qu’elle contient ligne à ligne, ses bulles offertes sur une bande rose à
 * 0 €), « C’est quoi une bulle ? », puis le paiement dans la feuille (PayerDansLaFeuille : Apple Pay ou Google Pay,
 * la carte de Whop dans sa feuille, sans quitter BLUSH ; la page de Whop en repli). Juste sous lui, la ligne de la
 * renonciation au délai de rétractation, que le geste de payer donne (MentionRenonciation). Payé : « C’est payé » prend
 * toute la feuille, puis « C’est débloqué ». Fermée sans payer, elle demande au serveur l’offre unique ① (OffreAvantDePartir :
 * la suite moins chère, 5 minutes, une fois).
 * Les avoirs du compte (GET /api/paiement/feuille) : un rapport d’avance (le 2e rapport, payé sur « C’est débloqué »)
 * vient en tête, choisi d’avance, et débloque sans rien payer ; le −50 % gardé fait payer le rapport seul à moitié prix
 * (l’offre rapport_garde), jusqu’à sa fin.
 * Les marges du prototype, sauf sur un écran court (375 × 667) : la ligne de la renonciation, que le prototype n’avait
 * pas (comme la case qu’elle remplace), n’y tiendrait pas ; le titre, les marges de Premium et les écarts s’y resserrent
 * (max-height: 700px), pour que la feuille tienne sans défiler, avec de la marge pour les textes plus larges de Chrome
 * sous Linux et Android (tests/e2e/rapport-debloque.spec.ts, tientEnPetitEcran).
 */

/** L’offre ① refusée (« Non merci ») pendant cette visite : la feuille refermée ne la remontre pas (le serveur la garderait 5 minutes). */
let suiteRefusee = false;

/** Ce qu’on choisit dans la feuille : une des deux formules, ou le rapport d’avance du compte. */
type Choix = Formule | "avance";

/** Le temps que la feuille redescende avant que l’offre ① ne monte (le prototype) : elles ne se croisent pas. */
const APRES_LA_FEUILLE_MS = 450;

/** Un prix barré : le trait pour l’œil, « au lieu de » pour un lecteur d’écran. */
function Barre({ children, className }: { children: string; className?: string }) {
  return (
    <s className={className}>
      <span className="sr-only">{FEUILLE_FORMULE.auLieuDe}</span>
      {children}
    </s>
  );
}

/** Une ligne de ce que contient Premium : sa pastille ronde, son texte, et sa coche (ou ce qui la remplace à droite). */
function LigneDuLot({ pastille, children, droite, rose = false }: { pastille: ReactNode; children: ReactNode; droite?: ReactNode; rose?: boolean }) {
  return (
    <span className={cn("flex items-center gap-3 px-3.5 py-2 [@media(max-height:700px)]:py-1", rose && "bg-[#FFE6F2]")}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full bg-white",
          rose ? "shadow-[0_1px_2px_rgba(200,29,107,0.15)]" : "shadow-[0_1px_2px_rgba(17,17,20,0.08)]",
        )}
      >
        {pastille}
      </span>
      <span className="flex-1 text-detail font-black">{children}</span>
      {droite ?? <Icon name="check" size={16} stroke={3} className="shrink-0 text-vrai-ink" />}
    </span>
  );
}

/**
 * La carte Premium, comme un lot sur une fiche produit : son badge sur le bord, « +30 offertes » à côté du titre, et,
 * choisie, ce qu’elle contient ligne à ligne, les bulles offertes sur une bande rose à 0 € (leur prix seules, barré).
 * Une option du groupe (role="radio"), comme Option ; son badge vient après son titre dans le texte lu.
 */
function CartePremium({ on, choisir, chapitres }: { on: boolean; choisir: () => void; chapitres: number }) {
  const p = FEUILLE_FORMULE.premium;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={choisir}
      className={cn("lift relative flex flex-col rounded-[22px] bg-white text-left text-ink", on ? "shadow-selected" : "shadow-soft")}
    >
      <span className="flex w-full items-center gap-3.5 px-4 pb-3 pt-4 [@media(max-height:700px)]:pb-1.5 [@media(max-height:700px)]:pt-3">
        <RondACocher on={on} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-corps font-black leading-[1.25]">{p.titre}</span>
            <span className="inline-flex h-[22px] items-center rounded-[7px] bg-elle-ink px-2 text-micro font-black text-white">{p.offertes}</span>
          </span>
          <span className="text-legende font-extrabold leading-[1.4] text-soft">{p.note}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-[21px] font-black leading-none tracking-[-0.01em]">{prixDe("premium")}</span>
          {CATALOGUE.premium.barre !== null && <Barre className="mt-1 text-micro font-extrabold text-grey">{enEuros(CATALOGUE.premium.barre)}</Barre>}
        </span>
      </span>
      {on && (
        <span className="flex w-full flex-col px-3 pb-2.5 [@media(max-height:700px)]:pb-2">
          {/* Ce qu’elle contient, dans un encart à elle : rien ne touche le contour de la carte */}
          <span className="relative flex flex-col overflow-hidden rounded-[16px] bg-paper">
            {/* Son contour, posé par-dessus : la bande rose ne le cache pas */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] rounded-[16px] shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)]" />
            <LigneDuLot pastille={<Icon name="file" size={14} stroke={2.4} className="text-ink" />}>
              {p.rapport} <span className="font-extrabold text-grey">{p.chapitres(chapitres)}</span>
            </LigneDuLot>
            <span aria-hidden="true" className="ml-[52px] h-px bg-[rgba(17,17,20,0.07)]" />
            <LigneDuLot pastille={<Perle taille={16} />}>{p.bulles}</LigneDuLot>
            <LigneDuLot
              rose
              pastille={<Cadeau taille={15} className="text-elle-ink" />}
              droite={
                <>
                  <Barre className="text-micro font-extrabold text-grey">{p.barreOffertes}</Barre>
                  <span className="rounded-lg bg-elle-ink px-2 py-0.5 text-legende font-black text-white">{p.gratuit}</span>
                </>
              }
            >
              {p.plus} <span className="text-elle-ink">{p.offertesMot}</span>
            </LigneDuLot>
          </span>
          <span className="pt-1.5 text-center text-legende font-black text-vrai-ink [@media(max-height:700px)]:pt-0.5">{p.economie}</span>
        </span>
      )}
      {/* Le badge, posé sur le bord haut de la carte : après le titre dans le texte lu */}
      <span className="absolute -top-[13px] right-4 inline-flex h-[26px] items-center gap-1 rounded-[13px] bg-ink px-2.5 text-micro font-black text-white">
        <Icon name="sparkle" size={12} stroke={2.4} className="text-white" />
        {p.badge}
      </span>
    </button>
  );
}

/**
 * La feuille « Ta formule ». `autre` : le prénom de l’autre (« toi et Léa ») ; `chapitres` : ceux qui restent à lire (le
 * rapport ouvert), sinon ceux d’un rapport entier ; `suite` : où reprendre après « C’est débloqué » (par défaut, la suite
 * du rapport). `proposerLaSuite` : fermée sans payer, proposer l’offre ① (par défaut) ; faux quand la fermer quitte la
 * page (le chat, sa fiche, « Ta question » : on revient au rapport), où l’offre serait montrée, et son compte à rebours
 * lancé, sans que personne la voie. Sur ordinateur, ses feuilles couvrent tout l’écran, en-tête compris (belowHeader
 * faux), et son titre garde sa taille du prototype (26 px).
 */
export function FeuilleFormule({
  open,
  onClose,
  autre,
  chapitres = CHAPITRES_A_DEBLOQUER,
  suite,
  proposerLaSuite = true,
}: {
  open: boolean;
  onClose: () => void;
  autre?: string;
  chapitres?: number;
  suite?: string;
  proposerLaSuite?: boolean;
}) {
  const titre = useId();
  useAuPaiement(open);
  const avoirs = useFeuilleDuPaiement().data;
  /* Le choix fait à la main ; sans lui, le rapport d’avance s’il y en a un, sinon la formule choisie d’avance */
  const [choix, setChoix] = useState<Choix | null>(null);
  const choisie: Choix = choix ?? (avoirs?.avance ? "avance" : FORMULE_CHOISIE);
  const [bulle, setBulle] = useState(false);
  /* Payé : « C’est payé » prend toute la feuille, qui ne se ferme plus, le temps de la livraison */
  const [paye, setPaye] = useState(false);
  /* Le −50 % gardé fait payer le rapport seul à moitié prix (rapport_garde) */
  const garde = avoirs?.garde ?? null;
  const offre: OffreId = choisie === "rapport" && garde ? "rapport_garde" : choisie === "avance" ? "rapport" : choisie;
  /*
   * L’offre ① montrée par le serveur : l’heure de fin de son compte à rebours, à l’horloge du téléphone (le temps qu’il
   * lui reste à l’heure du serveur, compté d’ici : une horloge en avance ne la fait pas passer avant l’heure) ; puis,
   * passée, son toast
   */
  const [suiteMontree, setSuiteMontree] = useState<number | null>(null);
  const [passee, setPassee] = useState(false);
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);
  useEffect(() => {
    if (!passee) return;
    const t = setTimeout(() => setPassee(false), 2600);
    return () => clearTimeout(t);
  }, [passee]);

  /* Fermée sans payer : l’offre ①, si le serveur la montre (une fois par compte, jamais deux offres le même jour), une fois la feuille redescendue */
  const fermer = () => {
    if (paye) return;
    onClose();
    if (!proposerLaSuite || suiteRefusee) return;
    const descendue = new Promise((ok) => setTimeout(ok, APRES_LA_FEUILLE_MS));
    proposerOffreUnique("suite").then(
      async (o) => {
        if (o.offre !== "suite" || o.reste === null) return;
        const fin = Date.now() + o.reste;
        await descendue;
        if (vivant.current) setSuiteMontree(fin);
      },
      () => {},
    );
  };

  return (
    <>
      <Sheet open={open} onClose={fermer} labelledBy={titre} belowHeader={false}>
        <h2
          id={titre}
          className={cn(
            "m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance] [@media(max-height:700px)]:text-[22px]",
            /* Payé : le titre reste pour le lecteur d’écran (le nom de la feuille), « C’est payé » se lit à sa place */
            paye && "sr-only",
          )}
        >
          {FEUILLE_FORMULE.titre(autre)}
        </h2>
        {!paye && (
          <>
            <RadioGroup label={FEUILLE_FORMULE.groupe} className="flex flex-col gap-3 [@media(max-height:700px)]:gap-2">
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
                note={
                  <span className="flex items-center gap-1 text-elle-ink">
                    <Perle taille={12} />
                    {garde ? FEUILLE_FORMULE.garde(jourEnLettres(garde.fin)) : FEUILLE_FORMULE.rapport.note}
                  </span>
                }
                prix={prixDe(garde ? "rapport_garde" : "rapport")}
                barre={garde ? prixDe("rapport") : undefined}
              >
                <Contenu>{FEUILLE_FORMULE.rapport.contenu(chapitres)}</Contenu>
              </Option>
              <CartePremium on={choisie === "premium"} choisir={() => setChoix("premium")} chapitres={chapitres} />
            </RadioGroup>
            <CestQuoiUneBulle ouvrir={() => setBulle(true)} />
          </>
        )}
        <div className="flex flex-col gap-3 lg:w-[400px] lg:self-center [@media(max-height:700px)]:gap-2">
          {choisie === "avance" ? (
            <DebloquerAvecLAvance suite={suite} deja={onClose} />
          ) : (
            <PayerDansLaFeuille
              offre={offre}
              centimes={CATALOGUE[offre].centimes}
              titre={CATALOGUE[offre].titre}
              libelle={FEUILLE_FORMULE.payer(prixDe(offre))}
              quoi="rapport"
              suite={suite}
              /* Le rapport déjà payé dans un autre onglet (409 « deja ») : relu, la feuille se ferme d’elle-même */
              quand={{ deja: onClose }}
              surPaye={setPaye}
              fleche
            />
          )}
          {/* Rien ne se paie avec le rapport d’avance : ni « Paiement unique », ni ses moyens */}
          {!paye && choisie !== "avance" && (
            <span className="text-center text-micro font-extrabold text-grey">
              <b className="font-black text-ink">{FEUILLE_FORMULE.pied.gras}</b>
              {FEUILLE_FORMULE.pied.reste}
            </span>
          )}
        </div>
      </Sheet>
      {/* Par-dessus la feuille : elle reste ouverte dessous, et « Compris » y revient */}
      <FeuilleBulle open={bulle} onClose={() => setBulle(false)} />
      {suiteMontree && (
        <OffreAvantDePartir
          fin={suiteMontree}
          chapitres={chapitres}
          suite={suite}
          onRefus={() => {
            suiteRefusee = true;
          }}
          onPassee={() => setPassee(true)}
          onClosed={() => setSuiteMontree(null)}
        />
      )}
      {passee && <Toast className="fixed inset-x-4 top-3 z-[95] lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{OFFRE_SUITE.passee}</Toast>}
    </>
  );
}

/**
 * Le rapport d’avance choisi : « Débloquer · 0 € » (POST /api/paiement/avance), puis « C’est débloqué ». Le geste donne
 * la renonciation au délai de rétractation, que la ligne dessous dit, comme pour un paiement. Déjà débloqué ailleurs
 * (409 « deja ») : relu, la feuille se ferme (`deja`).
 */
function DebloquerAvecLAvance({ suite, deja }: { suite?: string; deja: () => void }) {
  const router = useRouter();
  const renonciation = useAccord();
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState(false);
  const debloquer = async () => {
    if (!renonciation.exiger()) return;
    setOccupe(true);
    setSouci(false);
    try {
      const { achat } = await utiliserAvance();
      apresDeblocage();
      router.replace(versDebloque(achat, suite ?? null));
    } catch (e) {
      setOccupe(false);
      const code = codeDe(e);
      if (code === "renonciation") renonciation.perimer();
      else if (code === "deja") {
        apresDeblocage();
        router.refresh();
        deja();
      } else setSouci(true);
    }
  };
  return (
    <>
      {souci && <Alert className="text-center leading-[1.45]">{FEUILLE_FORMULE.souci}</Alert>}
      <Button arrow loading={occupe} loadingLabel="Déblocage en cours" onClick={() => void debloquer()}>
        {FEUILLE_FORMULE.avance.debloquer}
      </Button>
      <MentionRenonciation quoi="avance" etat={renonciation} />
    </>
  );
}
