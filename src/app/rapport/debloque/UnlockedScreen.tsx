"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { prixDe } from "@/contenu/offres";
import { OFFRE_PREMIUM_AJOUT } from "@/contenu/paiement";
import { delai } from "@/lib/motion";
import { cheminDe } from "@/lib/navigation";
import { partirPayer } from "@/lib/paiement";
import { apresDeblocage } from "@/lib/requetes";
import { useSoundOnce } from "@/lib/sound";
import { proposerOffreUnique } from "@/services/api";
import { CheckBurst } from "@/components/brand/objects3d";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { CaseRenonciation } from "@/components/screens/CaseRenonciation";
import { Screen } from "@/components/shell/Screen";
import type { OffreId } from "@/types";
import { ancreDuChapitre } from "../ancres";

/* Ce que l’achat vient d’ouvrir, dit simplement (le prototype des bulles) : les chapitres qui restent, d’où la lecture reprend, les bulles reçues. */
const ouvert = (bulles: number, restants: number, reprise: number) => [
  { title: `Les ${restants} chapitres qui restent`, sub: `Ta lecture reprend au chapitre ${reprise}` },
  { title: `${bulles} bulles pour parler à BLUSH`, sub: "1 bulle = 1 réponse · elles n’expirent jamais" },
];

/**
 * L’offre unique ③ (le prototype des bulles) : Premium pour 5 € de plus, juste après le rapport seul, une seule fois. Le
 * serveur décide de la montrer (POST /api/paiement/offre) ; « Ta carte est enregistrée » quand elle se paie en un geste.
 * Payée, on revient ici (`ici`), les 80 bulles en plus. La vague 2 la met au dessin du prototype.
 */
function OffrePremiumAjout({ enUnGeste, ici, fermer }: { enUnGeste: boolean; ici: string; fermer: () => void }) {
  const router = useRouter();
  const [renonce, setRenonce] = useState(false);
  const [manque, setManque] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState(false);
  const prendre = async () => {
    if (!renonce) return setManque(true);
    setOccupe(true);
    setSouci(false);
    try {
      await partirPayer("premium_ajout", { renonciation: true, suite: ici, aller: (adresse) => router.push(adresse as Route) });
    } catch {
      setOccupe(false);
      setSouci(true);
    }
  };
  return (
    <section
      aria-label={OFFRE_PREMIUM_AJOUT.titre}
      className="mt-6 flex w-full flex-col gap-2.5 rounded-[24px] bg-white p-[18px] text-left shadow-[inset_0_0_0_2px_#E8358A,0_22px_40px_-20px_rgba(200,29,107,0.5)]"
    >
      <span className="self-start rounded-full bg-[#FFE6F2] px-3 py-1 text-micro font-black uppercase tracking-[0.08em] text-elle-ink">{OFFRE_PREMIUM_AJOUT.badge}</span>
      <span className="text-[22px] font-black leading-[1.1] tracking-[-0.02em]">{OFFRE_PREMIUM_AJOUT.titre}</span>
      <span className="text-note font-extrabold leading-[1.45] text-grey">{OFFRE_PREMIUM_AJOUT.texte}</span>
      {enUnGeste && <span className="text-legende font-extrabold text-soft">{OFFRE_PREMIUM_AJOUT.carte}</span>}
      <CaseRenonciation quoi="bulles" cochee={renonce} onChange={(v) => (setRenonce(v), setManque(false))} manque={manque} />
      {souci && <Alert className="text-center leading-[1.45]">Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.</Alert>}
      <Button loading={occupe} loadingLabel="Paiement en cours" onClick={() => void prendre()}>
        {OFFRE_PREMIUM_AJOUT.prendre}
      </Button>
      <Button variant="link" onClick={fermer}>
        {OFFRE_PREMIUM_AJOUT.non}
      </Button>
    </section>
  );
}

/*
 * Paiement réussi : un moment, pas une facture. La gerbe (« une réussite » dans le design system),
 * le titre, ce qui vient de s’ouvrir, puis un seul bouton pour reprendre. Après le rapport seul, l’offre ③.
 */
export function UnlockedScreen({
  achat,
  offre,
  bulles,
  next,
  restants,
  total,
  reprise,
}: {
  /** L’achat payé (`?achat=`), son offre, et les bulles reçues avec lui. */
  achat: string;
  offre: OffreId;
  bulles: number;
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
  /* L’offre ③ : seulement après le rapport seul (ou la suite), si le serveur la montre */
  const [ajout, setAjout] = useState<{ enUnGeste: boolean } | null>(null);
  useEffect(() => {
    if (offre !== "rapport" && offre !== "suite") return;
    let vivant = true;
    proposerOffreUnique("premium_ajout").then(
      (o) => vivant && o.offre === "premium_ajout" && setAjout({ enUnGeste: o.enUnGeste }),
      () => {},
    );
    return () => {
      vivant = false;
    };
  }, [offre]);
  const suite = next ?? `/rapport#${ancreDuChapitre(reprise)}`;
  const ici = `/rapport/debloque?achat=${achat}${next ? `&suite=${encodeURIComponent(next)}` : ""}`;
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
          {`Les ${total} chapitres sont à toi, pour toujours. Et ${bulles} bulles pour en parler avec BLUSH.`}
        </p>

        {ajout ? (
          <OffrePremiumAjout enUnGeste={ajout.enUnGeste} ici={ici} fermer={() => setAjout(null)} />
        ) : (
          <div data-rise="" style={delai(0.45)} className="mt-8 w-full text-left">
            <InsetGroup>
              {ouvert(bulles, restants, reprise).map((it) => (
                <InsetRow key={it.title} leading={<RowIcon icon="check" tone="vrai" />} title={it.title} sub={it.sub} />
              ))}
            </InsetGroup>
          </div>
        )}
        <p data-rise="" style={delai(0.55)} className="m-0 mt-4 text-legende font-extrabold text-grey">
          {prixDe(offre)} · Paiement unique, pas d’abonnement
        </p>
      </div>
    </Screen>
  );
}
