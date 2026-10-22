import type { CSSProperties, ReactNode } from "react";
import { CHAPITRE_DE_L_AUTRE, CHAPITRE_DE_LA_BASCULE, titreDAttente } from "@/contenu/chapitres";
import { NOTE_DES_AVIS, PAYWALL } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icons";

/*
 * Les aperçus du rapport, sur le paywall (une proposition du 22 octobre 2026) : la « photo produit » des boutiques. Quatre
 * écrans du rapport en miniature, à son nom, qu’on fait glisser avant de choisir sa formule : le vocal (comme sa tuile,
 * src/app/rapport/Vocal.tsx), le chapitre où tout a basculé, le chapitre à son prénom, et le chat (« je lui réponds
 * quoi ? »). Rien n’est lu avant de payer : leur texte est flouté (des barres, jamais de faux texte) ; seuls les titres
 * d’attente et la question qu’on pose à BLUSH se lisent. Les miniatures sont décoratives : un lecteur d’écran entend
 * PAYWALL.apercus.resume.
 */

/** Le fond de la tuile du vocal dans le rapport (src/app/rapport/Vocal.tsx) : son aperçu lui ressemble. */
const FOND_DU_VOCAL = "radial-gradient(70% 120% at 18% 110%, rgba(232,53,138,0.55) 0%, rgba(232,53,138,0) 60%), linear-gradient(160deg, #2A2A30, var(--ink))";

/** L’onde du vocal : la hauteur de chaque trait, en pixels. */
const ONDE = [6, 12, 18, 10, 22, 14, 8, 16, 20, 9, 13, 6, 11, 17, 7];

export function ApercusDuRapport({ autre, messages, className }: { autre: string; messages: string; className?: string }) {
  const t = PAYWALL.apercus;
  return (
    <div className={cn("-mx-4 flex flex-col gap-3 lg:mx-0", className)}>
      {/* L’en-tête, comme le nom et la fiche d’un produit ; la note des avis à côté sur téléphone (sur ordinateur, elle est sous le titre) */}
      <div className="flex items-start justify-between gap-3 px-4 lg:px-0">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-titre-3 font-black leading-[1.15]">
            <span className="lg:hidden">{t.titre(autre)}</span>
            <span className="max-lg:hidden">{t.titreOrdinateur}</span>
          </h2>
          <p className="m-0 text-legende font-extrabold text-grey [text-wrap:balance]">
            <span className="lg:hidden">{t.fiche.messages(messages)}</span>
            {t.fiche.contenu}
          </p>
        </div>
        {NOTE_DES_AVIS && (
          <span className="flex shrink-0 flex-col items-end gap-0.5 lg:hidden">
            <span className="flex items-center gap-1 rounded-[10px] bg-ink px-2 py-1 text-legende font-black text-white">
              {NOTE_DES_AVIS.note}
              <span aria-hidden="true" className="text-attente">
                ★
              </span>
              <span className="sr-only">sur 5</span>
            </span>
            <span className="text-micro font-extrabold text-grey">{t.avis(NOTE_DES_AVIS.nombre)}</span>
          </span>
        )}
      </div>
      <p className="sr-only">{t.resume(autre)}</p>
      <ul
        aria-hidden="true"
        className="m-0 -mb-3 flex list-none snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-4 pt-1 [scrollbar-width:none] lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <Ecran className="justify-between text-white" style={{ background: FOND_DU_VOCAL }}>
          <span className="text-micro font-black text-white/70">{t.duree}</span>
          <span className="flex h-6 items-center gap-[3px]">
            {ONDE.map((h, i) => (
              <span key={i} className="w-[3px] rounded-full bg-white/85" style={{ height: h }} />
            ))}
          </span>
          <span className="flex items-end justify-between gap-2">
            <span className="text-note font-black leading-[1.2]">{t.vocal}</span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
              <Icon name="play" size={14} fill="currentColor" stroke={0} className="translate-x-px text-ink" />
            </span>
          </span>
        </Ecran>
        <Ecran className="gap-1.5 bg-white shadow-card">
          <span className="text-micro font-black text-grey">{t.chapitre(CHAPITRE_DE_LA_BASCULE)}</span>
          <span className="pr-6 text-legende font-black leading-[1.2] text-ink">{titreDAttente(CHAPITRE_DE_LA_BASCULE, autre)}</span>
          <span className="mt-auto flex flex-col gap-1.5">
            <span className="flex w-[80%] flex-col gap-1 self-start rounded-[12px_12px_12px_4px] bg-bubble-her px-2 py-1.5">
              <Ligne largeur="100%" />
              <Ligne largeur="60%" />
            </span>
            <span className="flex w-[66%] flex-col self-end rounded-[12px_12px_4px_12px] bg-bubble-me px-2 py-1.5">
              <Ligne largeur="100%" clair />
            </span>
            <Ligne largeur="92%" />
            <Ligne largeur="64%" />
          </span>
        </Ecran>
        <Ecran className="gap-2.5 bg-white shadow-card">
          <span className="flex min-w-0 items-center gap-2 pr-6">
            <Avatar tone="elle" size={28} fontSize={13}>
              {autre.charAt(0).toUpperCase()}
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="text-micro font-black text-grey">{t.chapitre(CHAPITRE_DE_L_AUTRE)}</span>
              <span className="truncate text-legende font-black leading-[1.2] text-ink">{titreDAttente(CHAPITRE_DE_L_AUTRE, autre)}</span>
            </span>
          </span>
          <span className="flex flex-col gap-1.5">
            <Ligne largeur="100%" />
            <Ligne largeur="90%" />
            <Ligne largeur="72%" />
          </span>
          {/* Deux barres « toi / elle », floutées : on voit qu’il y a des scores, pas lesquels */}
          <span className="mt-auto flex flex-col gap-2 blur-[1px]">
            <span className="flex h-2 overflow-hidden rounded-full">
              <span className="w-[62%] bg-toi" />
              <span className="flex-1 bg-elle" />
            </span>
            <span className="flex h-2 overflow-hidden rounded-full">
              <span className="w-[34%] bg-toi" />
              <span className="flex-1 bg-elle" />
            </span>
          </span>
        </Ecran>
        <Ecran className="gap-2 bg-white shadow-card">
          <span className="flex items-center gap-1.5 pr-6">
            <BubbleLogo size={18} />
            <span className="text-micro font-black text-ink">BLUSH</span>
          </span>
          <span className="self-end rounded-[12px_12px_4px_12px] bg-bubble-me px-2.5 py-1.5 font-message text-legende font-bold leading-tight text-white">{t.question}</span>
          <span className="mt-auto flex w-[88%] flex-col gap-1 rounded-[12px_12px_12px_4px] bg-bubble-her px-2 py-2">
            <Ligne largeur="100%" />
            <Ligne largeur="86%" />
            <Ligne largeur="52%" />
          </span>
        </Ecran>
      </ul>
    </div>
  );
}

/** Un écran en miniature, un cadenas dans son coin. */
function Ecran({ className, style, children }: { className: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <li className={cn("relative flex h-[178px] w-[150px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] p-3 lg:h-[196px] lg:w-[168px]", className)} style={style}>
      {children}
      <span className="absolute right-2.5 top-2.5 flex size-[22px] items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(17,17,20,0.06)]">
        <Icon name="lock" size={11} stroke={2.6} className="text-grey" />
      </span>
    </li>
  );
}

/** Une ligne de texte floutée : on devine qu’elle est écrite, sans la lire (`clair` : sur une bulle bleue). */
function Ligne({ largeur, clair }: { largeur: string; clair?: boolean }) {
  return <span className={cn("block h-[7px] shrink-0 rounded-full blur-[1.5px]", clair ? "bg-white/60" : "bg-[rgba(17,17,20,0.14)]")} style={{ width: largeur }} />;
}
