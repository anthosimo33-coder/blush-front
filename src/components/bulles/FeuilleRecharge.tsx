"use client";

import { useEffect, useId, useState } from "react";
import { useAuPaiement } from "@/lib/presence";
import { proposerOffreUnique } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { CaseRenonciation } from "@/components/juridique/cases";
import { usePaiement } from "@/components/paiement/usePaiement";
import { lePack, PACK_CONSEILLE, PACKS, RECHARGE, type Pack } from "@/contenu/recharge";
import { Grappe } from "./perles";
import { LigneOfferte, Option } from "./pieces";

/*
 * La recharge (le prototype validé des bulles, 12 octobre) : trois packs, le conseillé choisi d’avance et ouvert, et le
 * bonus de la première recharge (④) quand le serveur le montre (POST /api/paiement/offre : une fois par compte, jamais
 * le même jour qu’une autre offre unique). Puis la case de renonciation, et le paiement : la page de Whop (ou le faux
 * Whop en local), d’où l’on revient où la recharge a été ouverte (`suite`). Payer passe par usePaiement, comme les
 * autres feuilles qui font payer : la case exigée, le bouton occupé (libéré au retour de chez Whop par « Retour »), et
 * ce qu’on dit quand rien ne part (la case périmée, le paiement pas encore branché, le reste).
 */

/** Le bonus ④ : pas encore demandé au serveur, montré par lui, ou pas pour ce compte. */
type Bonus = "inconnu" | "oui" | "non";

/**
 * La feuille de la recharge. `reponsePrete` : ouverte depuis une réponse écrite à 0 bulle (floutée), elle le rappelle
 * (`autre`, le prénom de l’autre personne). `suite` : où revenir une fois payé, d’après les bulles achetées (l’accueil,
 * qui y lit la réponse prête et le dit). Sur ordinateur, son voile couvre tout l’écran, en-tête compris (belowHeader faux).
 */
export function FeuilleRecharge({
  open,
  onClose,
  reponsePrete = false,
  autre,
  suite,
}: {
  open: boolean;
  onClose: () => void;
  reponsePrete?: boolean;
  autre?: string;
  suite: (bulles: number) => string;
}) {
  const titre = useId();
  useAuPaiement(open);
  const [choisi, setChoisi] = useState<Pack>(PACK_CONSEILLE);
  const [bonus, setBonus] = useState<Bonus>("inconnu");

  /* Ouverte : le serveur dit si le bonus de la première recharge vaut pour ce compte (une fois demandé, il reste su) */
  useEffect(() => {
    if (!open || bonus !== "inconnu") return;
    let vivant = true;
    proposerOffreUnique("premiere_recharge").then(
      (o) => vivant && setBonus(o.offre === "premiere_recharge" ? "oui" : "non"),
      () => vivant && setBonus("non"),
    );
    return () => {
      vivant = false;
    };
  }, [open, bonus]);

  const premiere = bonus === "oui";
  const packs = Object.fromEntries(PACKS.map((p) => [p, lePack(p, premiere)])) as Record<Pack, ReturnType<typeof lePack>>;
  /* La suite d’après le pack choisi : ses bulles (le mot « +N bulles » du retour, que le serveur corrige s’il le faut) */
  const paiement = usePaiement({ suite: suite(packs[choisi].total) });

  /** Le tag rose d’un pack qui offre des bulles (« +10 offertes »), à côté de son titre. */
  const tag = (p: Pack) => {
    const t = packs[p].tag;
    return t ? <span className="rounded-lg bg-[#FFE6F2] px-2 py-0.5 text-micro font-black text-elle-ink">{t}</span> : undefined;
  };

  return (
    /* Un écran bas (375 × 667) : la feuille se resserre pour tenir sans défiler, case de renonciation et bonus ④ compris */
    <Sheet open={open} onClose={onClose} labelledBy={titre} belowHeader={false} className="[@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:pb-4">
      <h2 id={titre} className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] [@media(max-height:700px)]:text-[24px]">
        {RECHARGE.titre}
      </h2>
      <p className="m-0 text-note font-bold leading-[1.45] text-soft">{reponsePrete && autre ? RECHARGE.reponsePrete(autre) : RECHARGE.sousTitre}</p>
      {premiere && (
        <div
          data-bonus=""
          className="flex items-center gap-3 rounded-[20px] bg-[linear-gradient(120deg,#FFE6F2_0%,#EFE4FF_55%,#E2F0FF_100%)] px-4 py-3 [@media(max-height:700px)]:py-2"
        >
          <Grappe taille={42} />
          <p className="m-0 flex flex-col gap-0.5">
            <span className="text-detail font-black">{RECHARGE.bonus}</span>
            <span className="text-legende font-extrabold text-soft">{RECHARGE.bonusNote}</span>
          </p>
        </div>
      )}
      <RadioGroup label={RECHARGE.choix} className="flex flex-col gap-3 [@media(max-height:700px)]:gap-2.5">
        {PACKS.map((p) => {
          const pack = packs[p];
          /* Le prix de la bulle en vert quand il baisse (le bonus, le grand pack) ; en gris pour le repère et le conseillé seul */
          const vert = p === "pack200" || (p === PACK_CONSEILLE && premiere);
          return (
            <Option
              key={p}
              on={choisi === p}
              choisir={() => setChoisi(p)}
              titre={pack.titre}
              tag={tag(p)}
              badge={p === PACK_CONSEILLE ? <Tag tone="conseille" /> : undefined}
              note={<span className={vert ? "text-vrai-ink" : "text-grey"}>{pack.note}</span>}
              prix={pack.prix}
            >
              {pack.offertes > 0 && <LigneOfferte bulles={pack.offertes} />}
            </Option>
          );
        })}
      </RadioGroup>
      <div className="flex flex-col gap-3 [@media(max-height:700px)]:gap-2">
        {paiement.refus === "bientot" && (
          <p role="status" className="m-0 text-center text-note font-extrabold leading-[1.45] text-soft">
            {RECHARGE.bientot}
          </p>
        )}
        {paiement.refus === "souci" && <Alert className="text-center leading-[1.45]">{RECHARGE.souci}</Alert>}
        <CaseRenonciation quoi="bulles" etat={paiement.renonciation} />
        <Button arrow loading={paiement.occupe} loadingLabel={RECHARGE.enCours} onClick={() => void paiement.payer(choisi)}>
          {RECHARGE.payer(packs[choisi].prix)}
        </Button>
        <span className="text-center text-micro font-extrabold text-grey">
          <b className="font-black text-ink">{RECHARGE.pied.fort}</b>
          {RECHARGE.pied.reste}
        </span>
      </div>
    </Sheet>
  );
}
