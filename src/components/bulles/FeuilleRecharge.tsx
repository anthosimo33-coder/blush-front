"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { apresLaLivraison } from "@/lib/paiement";
import { useAuPaiement } from "@/lib/presence";
import { proposerOffreUnique } from "@/services/api";
import { RadioGroup } from "@/components/ui/controls";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { PayerDansLaFeuille } from "@/components/paiement/integre/PayerDansLaFeuille";
import { CATALOGUE } from "@/contenu/offres";
import { lePack, PACK_CONSEILLE, PACKS, RECHARGE, type Pack } from "@/contenu/recharge";
import { Grappe } from "./perles";
import { LigneOfferte, Option } from "./pieces";

/*
 * La recharge (le prototype validé des bulles, 12 octobre) : trois packs, le conseillé choisi d’avance et ouvert, et le
 * bonus de la première recharge (④) quand le serveur le montre (POST /api/paiement/offre : une fois par compte, jamais
 * le même jour qu’une autre offre unique). Puis le paiement dans la feuille (PayerDansLaFeuille, comme les autres
 * feuilles qui font payer : Apple Pay, Google Pay ou la carte de Whop, sans quitter BLUSH ; la page de Whop en repli),
 * la renonciation (une ligne sous le bouton, que le geste de payer donne), et ce qu’on dit quand rien ne part. Payé : les
 * packs s’effacent derrière « C’est payé », puis on revient où la recharge a été ouverte (`suite`). Sans la case de
 * renonciation (retirée le 13 octobre), la feuille a les marges du prototype, sauf ses écarts sur un écran bas.
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
  const router = useRouter();
  /* Payé : « C’est payé » prend la place des packs, le temps de la livraison ; la feuille ne se ferme plus */
  const [paye, setPaye] = useState(false);
  /* Un paiement en route (dès le geste) : la feuille ne se ferme pas, elle arrêterait son suivi */
  const [occupe, setOccupe] = useState(false);

  /** Le tag rose d’un pack qui offre des bulles (« +10 offertes »), à côté de son titre. */
  const tag = (p: Pack) => {
    const t = packs[p].tag;
    return t ? <span className="rounded-lg bg-[#FFE6F2] px-2 py-0.5 text-micro font-black text-elle-ink">{t}</span> : undefined;
  };

  return (
    /* Un écran bas (375 × 667) : le titre, le bonus et les écarts se resserrent pour tenir sans défiler, bonus ④, réponse prête et ligne de la renonciation compris, avec la marge des textes plus larges de Chrome sous Linux et Android */
    <Sheet
      open={open}
      onClose={paye || occupe ? () => {} : onClose}
      labelledBy={titre}
      belowHeader={false}
      className="[@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:pb-4"
    >
      <h2 id={titre} className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] [@media(max-height:700px)]:text-[22px]">
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
      <RadioGroup label={RECHARGE.choix} className={paye ? "hidden" : "flex flex-col gap-3 [@media(max-height:700px)]:gap-2"}>
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
        <PayerDansLaFeuille
          offre={choisi}
          centimes={CATALOGUE[choisi].centimes}
          titre={packs[choisi].titre}
          libelle={RECHARGE.payer(packs[choisi].prix)}
          quoi="bulles"
          /* La suite d’après le pack choisi : ses bulles (le mot « +N bulles » de l’arrivée, que le serveur corrige s’il le faut) */
          suite={suite(packs[choisi].total)}
          surPaye={setPaye}
          surOccupe={setOccupe}
          /*
           * Livré : la feuille se ferme d’abord, puis on va à la suite. Souvent la page même où elle est ouverte (l’accueil,
           * « Mon compte ») : Next la garde montée, son état compris, et la feuille resterait sinon sur « C’est payé ».
           */
          livre={(e) => {
            setPaye(false);
            /* Une recharge payée : le bonus de la première ne vaut plus, il se redemande à la prochaine ouverture (la feuille reste montée) */
            setBonus("inconnu");
            onClose();
            router.replace(apresLaLivraison(e));
          }}
          fleche
        />
        <span className="text-center text-micro font-extrabold text-grey">
          <b className="font-black text-ink">{RECHARGE.pied.fort}</b>
          {RECHARGE.pied.reste}
        </span>
      </div>
    </Sheet>
  );
}
