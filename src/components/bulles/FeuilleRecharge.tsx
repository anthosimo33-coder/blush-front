"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { codeDe } from "@/lib/messages-erreur";
import { partirPayer, useLibererAuRetour } from "@/lib/paiement";
import { proposerOffreUnique } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { CaseRenonciation, useCase } from "@/components/juridique/cases";
import { lePack, PACK_CONSEILLE, PACKS, RECHARGE, type Pack } from "@/contenu/recharge";
import { Grappe } from "./perles";
import { LigneOfferte, Option } from "./pieces";

/*
 * La recharge (le prototype validé des bulles, 12 octobre) : trois packs, le conseillé choisi d’avance et ouvert, et le
 * bonus de la première recharge (④) quand le serveur le montre (POST /api/paiement/offre : une fois par compte, jamais
 * le même jour qu’une autre offre unique). Puis la case de renonciation, et le paiement : la page de Whop (ou le faux
 * Whop en local), d’où l’on revient où la recharge a été ouverte (`suite`).
 */

/** Le bonus ④ : pas encore demandé au serveur, montré par lui, ou pas pour ce compte. */
type Bonus = "inconnu" | "oui" | "non";

/**
 * La feuille de la recharge. `reponsePrete` : ouverte depuis une réponse écrite à 0 bulle (floutée), elle le rappelle
 * (`autre`, le prénom de l’autre personne). `suite` : où revenir une fois payé, d’après les bulles achetées (l’accueil,
 * qui y lit la réponse prête et le dit).
 */
export function FeuilleRecharge({
  open,
  onClose,
  reponsePrete = false,
  autre,
  suite,
  belowHeader,
}: {
  open: boolean;
  onClose: () => void;
  reponsePrete?: boolean;
  autre?: string;
  suite: (bulles: number) => string;
  belowHeader?: boolean;
}) {
  const router = useRouter();
  const titre = useId();
  const [choisi, setChoisi] = useState<Pack>(PACK_CONSEILLE);
  const [bonus, setBonus] = useState<Bonus>("inconnu");
  const renonciation = useCase();
  const [busy, setBusy] = useState(false);
  /* Revenu de chez Whop par « Retour » sans payer : le bouton se libère */
  useLibererAuRetour(useCallback(() => setBusy(false), []));
  /* Le faux Whop (une page de l’appli) : le bouton reste occupé jusqu’à son arrivée */
  const [navigue, demarrer] = useTransition();
  const occupe = busy || navigue;
  const [bientot, setBientot] = useState(false);
  const [souci, setSouci] = useState(false);

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

  const payer = async () => {
    if (!renonciation.exiger()) return;
    setBusy(true);
    setSouci(false);
    try {
      await partirPayer(choisi, { renonciation: true, suite: suite(packs[choisi].total), aller: (adresse) => demarrer(() => router.push(adresse as Route)) });
    } catch (e) {
      /* Sans paiement branché (ni Whop, ni le faux Whop) : rien ne s’achète encore */
      setBusy(false);
      if (codeDe(e) === "bientot") setBientot(true);
      else setSouci(true);
    }
    /* Parti : le bouton reste occupé jusqu’à ce que la page s’en aille (celle de Whop, ou le faux Whop par le routeur) */
  };

  /** Le tag rose d’un pack qui offre des bulles (« +10 offertes »), à côté de son titre. */
  const tag = (p: Pack) => {
    const t = packs[p].tag;
    return t ? <span className="rounded-lg bg-[#FFE6F2] px-2 py-0.5 text-micro font-black text-elle-ink">{t}</span> : undefined;
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titre} belowHeader={belowHeader}>
      <h2 id={titre} className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em]">
        {RECHARGE.titre}
      </h2>
      <p className="m-0 text-note font-bold leading-[1.45] text-soft">{reponsePrete && autre ? RECHARGE.reponsePrete(autre) : RECHARGE.sousTitre}</p>
      {premiere && (
        <div data-bonus="" className="flex items-center gap-3 rounded-[20px] bg-[linear-gradient(120deg,#FFE6F2_0%,#EFE4FF_55%,#E2F0FF_100%)] px-4 py-3">
          <Grappe taille={42} />
          <p className="m-0 flex flex-col gap-0.5">
            <span className="text-detail font-black">{RECHARGE.bonus}</span>
            <span className="text-legende font-extrabold text-soft">{RECHARGE.bonusNote}</span>
          </p>
        </div>
      )}
      <RadioGroup label={RECHARGE.choix} className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-3">
        {bientot && (
          <p role="status" className="m-0 text-center text-note font-extrabold leading-[1.45] text-soft">
            {RECHARGE.bientot}
          </p>
        )}
        {souci && <Alert className="text-center leading-[1.45]">{RECHARGE.souci}</Alert>}
        <CaseRenonciation quoi="bulles" etat={renonciation} />
        <Button arrow loading={occupe} loadingLabel="Paiement en cours" onClick={() => void payer()}>
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
