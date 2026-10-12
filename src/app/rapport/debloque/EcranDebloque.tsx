"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { DEBLOQUE, OFFRE_PREMIUM_AJOUT } from "@/contenu/paiement";
import { delai } from "@/lib/motion";
import { cheminDe } from "@/lib/navigation";
import { apresDeblocage } from "@/lib/requetes";
import { useSoundOnce } from "@/lib/sound";
import { proposerOffreUnique } from "@/services/api";
import { CheckBurst } from "@/components/brand/objects3d";
import { Grappe, Perle, Rangee } from "@/components/bulles/perles";
import { CaseRenonciation } from "@/components/juridique/cases";
import { usePaiement } from "@/components/paiement/usePaiement";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Screen } from "@/components/shell/Screen";
import type { OffreId } from "@/types";
import { ancreDuChapitre } from "../ancres";

/** Les perles posées devant les bulles reçues, dans l’offre ③ : une rangée, pas leur nombre. */
const PERLES_RECUES = 5;

/**
 * L’offre unique ③ (le prototype des bulles) : Premium pour 5 € de plus, juste après le rapport seul, une seule fois. Le
 * serveur décide de la montrer (POST /api/paiement/offre) ; « Ta carte est enregistrée » quand elle se paie en un geste
 * (le serveur paie alors sans page de paiement), sinon par la page de paiement de Whop. Payée, on revient ici (`ici`), les
 * 80 bulles en plus. « Non merci, je lis la suite » : la lecture reprend (`lire`). Le serveur qui ne la vend plus (prise
 * dans un autre onglet : 422 « offre ») : elle s’efface (`passee`), sans parler d’un souci de connexion.
 */
function OffrePremiumAjout({ bulles, enUnGeste, ici, lire, passee }: { bulles: number; enUnGeste: boolean; ici: string; lire: () => void; passee: () => void }) {
  const titre = useId();
  const paiement = usePaiement({ suite: ici, quand: { offre: passee } });
  return (
    <section
      aria-labelledby={titre}
      data-rise=""
      style={delai(0.45)}
      className="mt-5 flex w-full flex-col gap-2.5 rounded-[24px] bg-white p-[18px] text-left [@media(max-height:700px)]:mt-4 [@media(max-height:700px)]:gap-2 shadow-[inset_0_0_0_2px_#E8358A,0_22px_40px_-20px_rgba(200,29,107,0.5)]"
    >
      <span className="self-start rounded-full bg-[#FFE6F2] px-3 py-1 text-micro font-black uppercase tracking-[0.08em] text-elle-ink">{OFFRE_PREMIUM_AJOUT.badge}</span>
      <h2 id={titre} className="m-0 text-[22px] font-black leading-[1.1] tracking-[-0.02em]">
        {OFFRE_PREMIUM_AJOUT.titre}
      </h2>
      <p className="m-0 text-note font-extrabold leading-[1.45] text-grey">{OFFRE_PREMIUM_AJOUT.texte}</p>
      {/* Les bulles reçues, et les 80 de plus, pour l’œil : le texte au-dessus les dit */}
      <span aria-hidden="true" className="flex items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#FFF2F8,#F6EFFF)] py-3">
        <Rangee pleines={PERLES_RECUES} taille={13} />
        <span className="text-detail font-black text-soft">{bulles}</span>
        <span className="text-[22px] font-black text-elle-ink">+</span>
        <Grappe taille={40} />
        <span className="text-detail font-black text-elle-ink">{OFFRE_PREMIUM_AJOUT.plus}</span>
      </span>
      {enUnGeste && (
        <span className="flex items-center gap-2 text-legende font-extrabold text-soft">
          <Icon name="lock" size={15} stroke={2.4} className="shrink-0 text-soft" />
          {OFFRE_PREMIUM_AJOUT.carte}
        </span>
      )}
      <CaseRenonciation quoi="bulles" etat={paiement.renonciation} className="[@media(max-height:700px)]:[&_label]:text-micro" />
      {paiement.refus && <Alert className="text-center leading-[1.45]">{OFFRE_PREMIUM_AJOUT.souci}</Alert>}
      <Button loading={paiement.occupe} loadingLabel="Paiement en cours" onClick={() => void paiement.payer("premium_ajout")}>
        {OFFRE_PREMIUM_AJOUT.prendre}
      </Button>
      <Button variant="link" onClick={lire}>
        {OFFRE_PREMIUM_AJOUT.non}
      </Button>
    </section>
  );
}

/**
 * « C’est débloqué » (le prototype des bulles) : un moment, pas une facture. La gerbe, le titre, ce que l’achat vient
 * d’ouvrir (les chapitres qui restent, les bulles reçues, dans l’anneau rose de leur perle), puis un seul bouton pour
 * reprendre. Après le rapport seul (ou la suite), si le serveur la montre, l’offre ③ prend la place de la liste : elle
 * est alors le bouton principal, et « Non merci, je lis la suite » continue la lecture. Sur un écran court (375 × 667),
 * l’offre se resserre (sa case, que le prototype n’avait pas, s’écrit plus petit) pour tenir sans défiler.
 */
export function EcranDebloque({
  achat,
  offre,
  bulles,
  next,
  restants,
  total,
  reprise,
}: {
  /** L’achat payé (`?achat=`), son offre, et les bulles reçues avec lui (celles de l’offre ③ prise juste après comprises). */
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
  const router = useRouter();
  /* Le seul son qui suit un achat : la serrure, puis la signature sur un accord ouvert */
  useSoundOnce("debloque");
  /* Ce qui vient de s’ouvrir : relu ici, une fois le paiement parti (pas sous la feuille, où le rapport sautait) */
  useEffect(() => apresDeblocage(), []);
  /*
   * L’offre ③ : seulement après le rapport seul (ou la suite), si le serveur la montre. `undefined` : la réponse est
   * attendue (rien ne se pose, pour ne pas montrer la liste puis la remplacer) ; null : pas d’offre.
   */
  const proposable = offre === "rapport" || offre === "suite";
  const [ajout, setAjout] = useState<{ enUnGeste: boolean } | null | undefined>(proposable ? undefined : null);
  useEffect(() => {
    if (!proposable) return;
    let vivant = true;
    proposerOffreUnique("premium_ajout").then(
      (o) => vivant && setAjout(o.offre === "premium_ajout" ? { enUnGeste: o.enUnGeste } : null),
      () => vivant && setAjout(null),
    );
    return () => {
      vivant = false;
    };
  }, [proposable]);
  const suite = next ?? `/rapport#${ancreDuChapitre(reprise)}`;
  const ici = `/rapport/debloque?achat=${achat}${next ? `&suite=${encodeURIComponent(next)}` : ""}`;
  /* Vers l’accueil, sans remise en haut : il s’ouvre sur le dernier échange */
  const scroll = cheminDe(suite) !== "/app";
  const vue = !!ajout;
  return (
    <Screen
      mise="colonne"
      mainWidth={560}
      desktopTopPad={0}
      footer={
        ajout === null ? (
          <div data-popin="" style={delai(0.7)}>
            <ButtonLink href={suite} scroll={scroll} arrow>
              {next ? DEBLOQUE.continuer : DEBLOQUE.lire}
            </ButtonLink>
          </div>
        ) : undefined
      }
    >
      <div
        className={cn(
          "isolate flex flex-1 flex-col items-center text-center lg:flex-none",
          vue ? "pt-2 lg:pt-[max(16px,calc(50dvh_-_420px))]" : "justify-center pb-4 pt-6 lg:pb-0 lg:pt-[max(16px,calc(50dvh_-_380px))]",
        )}
      >
        <div className={cn("relative flex w-[300px] items-center justify-center", vue ? "h-[84px] [@media(max-height:700px)]:h-[64px]" : "h-[120px]")}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
          />
          <div data-float="">
            <CheckBurst size={vue ? 64 : 88} pop />
          </div>
        </div>
        <h1
          data-rise=""
          style={delai(0.2)}
          className={cn("m-0 font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance]", vue ? "mt-2 text-[28px]" : "mt-4 text-[32px] lg:text-[40px]")}
        >
          {DEBLOQUE.titre}
        </h1>
        <p data-rise="" style={delai(0.3)} className="m-0 mt-2 max-w-[380px] text-corps font-extrabold leading-[1.45] text-soft">
          {DEBLOQUE.phrase(total, bulles)}
        </p>
        {ajout === null && (
          <div data-rise="" style={delai(0.45)} className="mt-6 w-full text-left">
            <InsetGroup>
              <InsetRow leading={<RowIcon icon="check" tone="vrai" />} title={DEBLOQUE.restants(restants)} sub={DEBLOQUE.reprise(reprise)} />
              <InsetRow
                leading={
                  <RowIcon tone="elle">
                    <Perle taille={20} />
                  </RowIcon>
                }
                title={DEBLOQUE.bulles(bulles)}
                sub={DEBLOQUE.bullesSous}
              />
            </InsetGroup>
          </div>
        )}
        {ajout && <OffrePremiumAjout bulles={bulles} enUnGeste={ajout.enUnGeste} ici={ici} lire={() => router.push(suite as Route, { scroll })} passee={() => setAjout(null)} />}
      </div>
    </Screen>
  );
}
