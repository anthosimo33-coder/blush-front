"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { Sheet } from "@/components/ui/surfaces";
import { COUTS, FEUILLE_BULLE } from "@/contenu/bulles";
import { Perle } from "./perles";

/*
 * La feuille « C’est quoi une bulle ? » (le prototype validé des bulles, 12 octobre) : une bulle, c’est une réponse de
 * BLUSH, quoi que tu lui dises (on lui parle comme à un pote, pas seulement quand elle a écrit). Elle s’ouvre de « C’est
 * quoi une bulle ? » (CestQuoiUneBulle), du bas de l’aperçu gratuit et du compteur du chat. Les coûts sont lus dans le
 * catalogue (COUT_EN_BULLES, par src/contenu/bulles.ts), jamais recopiés.
 */

/** Ouverte depuis le chat, elle propose la recharge : le solde et ce qui l’ouvre vont ensemble, ou ni l’un ni l’autre. */
type Recharge = { solde: number; recharger: () => void } | { solde?: undefined; recharger?: undefined };

/**
 * La feuille qui explique les bulles : la règle, trois exemples, ce que coûte chaque réponse, et ce qui est offert. Avec
 * `solde` et `recharger` (ouverte depuis le chat), son bouton est « Recharger · il t’en reste N » ; sans, « Compris », qui
 * la ferme. `belowHeader` : comme pour Sheet (faux sur un écran sans en-tête).
 */
export function FeuilleBulle({
  open,
  onClose,
  solde,
  recharger,
  belowHeader,
}: {
  open: boolean;
  onClose: () => void;
  belowHeader?: boolean;
} & Recharge) {
  const titre = useId();
  const exemples = useId();
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titre} belowHeader={belowHeader}>
      <h2 id={titre} className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em]">
        {FEUILLE_BULLE.titre}
      </h2>
      <div className="flex items-center gap-3 rounded-[20px] bg-[#FFE6F2] px-4 py-2.5 shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]">
        <Perle taille={36} />
        <p className="m-0 flex flex-col gap-0.5">
          <span className="text-[17px] font-black leading-tight">{FEUILLE_BULLE.regle}</span>
          <span className="text-legende font-extrabold text-soft">{FEUILLE_BULLE.sousRegle}</span>
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-[20px] bg-white p-3.5 shadow-card">
        <span id={exemples} className="text-legende font-black text-grey">
          {FEUILLE_BULLE.exemplesTitre}
        </span>
        <ul aria-labelledby={exemples} className="m-0 flex list-none flex-col gap-2 p-0">
          {FEUILLE_BULLE.exemples.map((e) => (
            <li key={e.toi} className="flex items-center gap-1.5">
              <span className="truncate rounded-[14px] rounded-br-[5px] bg-toi-ink px-2.5 py-1 font-message text-legende font-bold text-white">
                <span className="sr-only">{FEUILLE_BULLE.toi}</span>
                {e.toi}
              </span>
              <Icon name="arrow" size={12} stroke={2.6} className="shrink-0 text-grey" />
              <span className="shrink-0 rounded-[14px] rounded-bl-[5px] bg-plaque px-2.5 py-1 font-message text-legende font-bold text-ink">
                <span className="sr-only">{FEUILLE_BULLE.blush}</span>
                {e.blush}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <InsetGroup>
        {COUTS.map((c) => (
          <InsetRow
            key={c.cle}
            variant="compact"
            title={c.quoi}
            trailing={
              <span className="flex items-center gap-1 text-detail font-black">
                <Perle taille={14} />
                {c.bulles}
                <span className="sr-only">{FEUILLE_BULLE.unite(c.bulles)}</span>
              </span>
            }
          />
        ))}
        <InsetRow variant="compact" title={FEUILLE_BULLE.offert.quoi} trailing={<span className="text-detail font-black text-vrai-ink">{FEUILLE_BULLE.offert.prix}</span>} />
      </InsetGroup>
      {solde !== undefined && recharger ? (
        <Button arrow onClick={recharger}>
          {FEUILLE_BULLE.recharger(solde)}
        </Button>
      ) : (
        <Button onClick={onClose}>{FEUILLE_BULLE.compris}</Button>
      )}
    </Sheet>
  );
}
