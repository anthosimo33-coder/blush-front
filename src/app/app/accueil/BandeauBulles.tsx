"use client";

import { IlOuElle } from "@/lib/pronom";
import { Icon } from "@/components/ui/icons";
import { Grappe, Perle, PerleVide, Rangee } from "@/components/bulles/perles";
import { Carte, PetitBouton } from "@/components/bulles/pieces";
import { CARTES, PERLES_DE_LA_CARTE, SEUIL_PEU_DE_BULLES } from "@/contenu/bulles-du-chat";
import type { Pronom } from "@/types";

/*
 * Ce qui se pose au-dessus du champ du chat, selon les bulles (le prototype validé des bulles, 12 octobre) : la première
 * apparition du compteur expliquée (« Tes 10 bulles offertes sont là »), bientôt finies (« Plus que N bulles »), une
 * réponse prête qui attend la recharge, ou plus de bulles. Une carte à la fois : l’accueil choisit laquelle (etatDuBandeau).
 */

/** La carte au-dessus du champ, ou aucune. */
export type EtatBandeau = "offertes" | "peu" | "prete" | "finies" | null;

/**
 * La carte à montrer : rien pour l’équipe (`solde` null) ; une réponse prête d’abord (elle attend la recharge) ; puis plus
 * de bulles ; la première apparition du compteur, tant qu’elle n’est pas expliquée ; et plus que SEUIL_PEU_DE_BULLES.
 */
export function etatDuBandeau({ solde, prete, expliquees }: { solde: number | null; prete: boolean; expliquees: boolean }): EtatBandeau {
  if (solde === null) return null;
  if (prete) return "prete";
  if (solde <= 0) return "finies";
  if (!expliquees) return "offertes";
  return solde <= SEUIL_PEU_DE_BULLES ? "peu" : null;
}

/**
 * La carte au-dessus du champ. `bulles` : le solde ; `autre`, `pronom` : l’autre personne. `recharger` : la recharge ;
 * `lire` : une réponse prête que le solde couvre déjà (sinon, la recharge) ; `expliquer` : « C’est quoi une bulle ? » ;
 * `fermer` : la première apparition, expliquée.
 */
export function BandeauBulles({
  etat,
  bulles,
  autre,
  pronom,
  recharger,
  lire,
  expliquer,
  fermer,
}: {
  etat: EtatBandeau;
  bulles: number;
  autre: string;
  pronom?: Pronom;
  recharger: () => void;
  lire: () => void;
  expliquer: () => void;
  fermer: () => void;
}) {
  if (etat === "offertes")
    return (
      <Carte>
        <Grappe taille={34} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-note font-black">{CARTES.offertes(bulles)}</span>
          <button type="button" onClick={expliquer} aria-haspopup="dialog" className="self-start text-left text-legende font-extrabold text-toi-ink">
            {CARTES.commentCaMarche}
          </button>
        </span>
        <button type="button" aria-label={CARTES.fermer} onClick={fermer} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-plaque">
          <Icon name="close" size={13} stroke={2.8} className="text-grey" />
        </button>
      </Carte>
    );
  if (etat === "peu")
    return (
      <Carte rose>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="text-note font-black">{CARTES.peu(bulles)}</span>
            <Rangee pleines={bulles} vides={Math.max(0, PERLES_DE_LA_CARTE - bulles)} taille={11} />
          </span>
          <span className="text-legende font-extrabold leading-[1.35] text-soft">{CARTES.peuNote(IlOuElle(pronom))}</span>
        </span>
        <PetitBouton onClick={recharger}>
          <Perle taille={14} />
          {CARTES.recharger}
        </PetitBouton>
      </Carte>
    );
  if (etat === "prete")
    return (
      <Carte rose>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-note font-black">{CARTES.prete(autre)}</span>
          <span className="text-legende font-extrabold leading-[1.35] text-soft">{CARTES.preteNote}</span>
        </span>
        <PetitBouton onClick={lire}>
          <Perle taille={14} />
          {CARTES.lire}
        </PetitBouton>
      </Carte>
    );
  if (etat === "finies")
    return (
      <Carte>
        <PerleVide taille={22} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-note font-black">{CARTES.finies}</span>
          <span className="text-legende font-extrabold leading-[1.35] text-soft">{CARTES.finiesNote}</span>
        </span>
        <PetitBouton onClick={recharger}>{CARTES.recharger}</PetitBouton>
      </Carte>
    );
  return null;
}
