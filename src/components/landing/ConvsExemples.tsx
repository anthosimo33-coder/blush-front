"use client";

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { LANDING_CONVS } from "@/contenu/landing";
import { BubbleLogo } from "@/components/brand/objects3d";
import { AppBadge, Avatar } from "@/components/ui/Avatar";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { PlayCard } from "@/components/ui/cards";
import { Icon } from "@/components/ui/icons";
import { Bubble, ConfidenceLine } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { APPLIS, type LandingConv } from "@/types";
import { ctaDe, type Retour } from "./cta";

/* Trois rangées de six convs (dont un couple), chacune à son rythme ; la deuxième part dans l’autre sens */
/* Même vitesse qu’à cinq convs par rangée : la durée suit la longueur */
const ROWS = [
  { seconds: 77, offset: 0 },
  { seconds: 91, offset: 150 },
  { seconds: 84, offset: 70 },
].map(({ seconds, offset }, i) => ({
  convs: LANDING_CONVS.slice(i * 6, i * 6 + 6),
  reverse: i === 1,
  seconds,
  offset,
}));

/** Les convs qui défilent : on en choisit une, BLUSH montre son verdict. `retour` : qui revient (cta.ts). */
export function ConvsExemples({ retour }: { retour: Retour }) {
  const [picked, setPicked] = useState<LandingConv | null>(null);
  const titre = useId();
  return (
    <div className="mt-14 lg:mt-20">
      <h2 className="sr-only">Des exemples de convs{NBSP}: choisis-en une pour voir le verdict de BLUSH</h2>
      <div className="flex flex-col">
        {ROWS.map((r, i) => (
          <ConvRow key={i} {...r} onPick={setPicked} />
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center gap-3 text-center lg:mt-10">
        <BubbleLogo size={52} animated />
        <p className="m-0 inline-flex items-center gap-1.5 text-detail font-black text-grey">
          <Icon name="arrow" size={15} stroke={2.6} className="-rotate-90" />
          Choisis une conv, je te donne mon verdict.
        </p>
      </div>
      <Sheet open={picked !== null} onClose={() => setPicked(null)} labelledBy={titre} belowHeader={false}>
        {picked && <ExampleReport conv={picked} retour={retour} titreId={titre} onClose={() => setPicked(null)} />}
      </Sheet>
    </div>
  );
}

function ConvRow({ convs, reverse, seconds, offset, onPick }: (typeof ROWS)[number] & { onPick: (c: LandingConv) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  /* Mouvement réduit : rien ne défile, la rangée glisse au doigt (et part décalée, pour ne pas faire grille) */
  useEffect(() => {
    if (ref.current && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current.scrollLeft = offset;
  }, [offset]);
  return (
    <div
      ref={ref}
      className="marquee mx-auto w-full max-w-[1280px] overflow-x-auto py-1.5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [scrollbar-width:none] motion-safe:overflow-hidden [&::-webkit-scrollbar]:hidden"
    >
      <div data-marquee="" data-reverse={reverse ? "" : undefined} className="flex w-max" style={{ "--marquee-s": `${seconds}s` }}>
        <ConvList convs={convs} onPick={onPick} />
        <ConvList convs={convs} onPick={onPick} copy />
      </div>
    </div>
  );
}

function ConvList({ convs, onPick, copy = false }: { convs: LandingConv[]; onPick: (c: LandingConv) => void; copy?: boolean }) {
  return (
    /*
     * La copie sert seulement à boucler sans à-coup : ni lecteur d’écran, ni clavier, et rien en mouvement réduit. Pas
     * `inert` : il couperait aussi la souris et le doigt, et la copie est à l’écran une bonne part du tour
     */
    <ul aria-hidden={copy || undefined} className={cn("m-0 flex list-none gap-3 p-0 pr-3", copy && "motion-reduce:hidden")}>
      {convs.map((c) => (
        <li key={c.id} className="shrink-0">
          <button
            type="button"
            tabIndex={copy ? -1 : undefined}
            onClick={() => onPick(c)}
            onFocus={keepInView}
            className="lift lift-card my-1.5 flex h-[66px] w-[226px] items-center gap-3 rounded-[20px] bg-white pl-3 pr-4 text-left shadow-card lg:h-[74px] lg:w-[258px] lg:pl-3.5"
          >
            <ConvAvatar conv={c} size={44} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-corps font-black leading-tight">{c.name}</span>
              <span className="truncate text-legende font-extrabold leading-tight text-grey">{c.label}</span>
            </span>
            <span className="sr-only">{NBSP}: voir le verdict de BLUSH</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Au clavier, la rangée s’arrête et revient à sa place (globals.css) : la conv qui a le focus vient au centre, hors des fondus. */
function keepInView(e: FocusEvent<HTMLButtonElement>) {
  const el = e.currentTarget;
  if (el.matches(":focus-visible")) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", inline: "center" }));
}

/** L’icône de l’appli, ou sa photo (sinon l’initiale, en rose : le rose, c’est l’autre personne). */
function ConvAvatar({ conv, size }: { conv: LandingConv; size: number }) {
  if (conv.avatar === "app") return <AppBadge app={conv.app} size={size} radius={size / 2} />;
  return (
    <Avatar tone="elle" size={size} photo={conv.photo}>
      {conv.name.charAt(0)}
    </Avatar>
  );
}

/**
 * Le verdict d’une conv d’exemple, comme le début d’un vrai rapport.
 * Mobile : tout tient dans la feuille, sans défiler (légende d’une ligne, confiance sur la ligne de la preuve).
 * Grand écran : « 1 Le verdict », comme le chapitre 1 du rapport.
 */
function ExampleReport({ conv, retour, titreId, onClose }: { conv: LandingConv; retour: Retour; titreId: string; onClose: () => void }) {
  const cta = ctaDe(retour);
  return (
    /* Écrans très courts (iPhone SE 2016) : espacements, carte et bouton se resserrent encore pour tout faire tenir */
    <div className="flex flex-col gap-2.5 lg:gap-4 [@media(max-height:600px)]:gap-1.5">
      <div className="flex items-center gap-3">
        <ConvAvatar conv={conv} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={titreId} className="m-0 truncate text-accent font-black leading-tight lg:text-[19px]">
            {conv.name}
          </h2>
          <span className="truncate text-legende font-extrabold text-grey">
            {conv.label} · {APPLIS[conv.app]}
          </span>
        </div>
        <IconButton icon="close" label="Fermer" onClick={onClose} iconSize={18} />
      </div>
      <span className="text-legende font-black text-grey lg:hidden">Le verdict de BLUSH · exemple fictif</span>
      <div className="hidden items-center justify-between gap-3 lg:flex">
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[38px] items-center justify-center rounded-full bg-ink text-corps font-black text-white shadow-ink">
            1
          </span>
          <span className="text-titre-3 font-black tracking-[-0.01em]">Le verdict</span>
        </span>
        <span className="shrink-0 rounded-full bg-plaque px-2.5 py-1 text-micro font-black text-soft">Exemple</span>
      </div>
      <div className="-mt-1 flex items-start gap-2 lg:mt-0 lg:gap-2.5">
        <span className="text-[28px] leading-none lg:text-[40px]" aria-hidden="true">
          {conv.verdict.emoji}
        </span>
        <span className="text-[22px] font-black leading-[1.1] tracking-[-0.02em] min-[380px]:text-titre-3 lg:text-[32px] lg:leading-[1.05]">{conv.verdict.title}</span>
      </div>
      <p className="m-0 text-detail font-extrabold leading-[1.4] text-soft lg:text-accent lg:leading-[1.45] [@media(max-height:600px)]:text-note [@media(max-height:600px)]:leading-[1.3]">
        {conv.verdict.subtitle}
      </p>
      <div className="flex flex-col gap-2 rounded-card bg-white p-3 shadow-card lg:p-3.5 [@media(max-height:600px)]:p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-legende font-black text-grey">La preuve</span>
          <ConfidenceLine level={conv.confidence}>{conv.proofs} preuves</ConfidenceLine>
        </div>
        <Bubble from="elle" caption={conv.proof.caption}>
          {conv.proof.text}
        </Bubble>
      </div>
      <PlayCard title="Ton prochain pas" className="[@media(max-height:600px)]:py-2.5">
        {conv.next}
      </PlayCard>
      <ButtonLink href={cta.href} scroll={cta.scroll} arrow className="mt-0.5 [@media(max-height:600px)]:h-[52px]">
        {cta.label}
      </ButtonLink>
      <p className="m-0 hidden text-center text-legende font-extrabold text-grey lg:block">Exemple fictif. Ton rapport, lui, part de vos vrais messages.</p>
    </div>
  );
}
