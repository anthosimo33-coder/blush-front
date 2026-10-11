"use client";

/*
 * Les en-têtes de l’accueil (mobile, et la barre de la fenêtre de conv sur desktop) : BLUSH en grand au centre, l’autre
 * à droite comme un contact, et à gauche le retour à la liste des convs. Ce qui en part ou s’y anime (la bulle de BLUSH,
 * l’anneau et l’avatar de l’autre) s’inscrit au registre de l’en-tête (./mouvement/registre.ts) : la feuille du contact
 * et la fête d’un niveau le prennent là, sans le chercher dans la page. Et l’avatar de BLUSH sous chaque réponse de la
 * conv (LogoDuFil), dessiné une fois par conv.
 */
import Link from "next/link";
import { createContext, use, useId, ViewTransition, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { ContactRing } from "@/components/ui/contact";
import { Icon } from "@/components/ui/icons";
import { scaleOf } from "@/contenu/niveaux";
import type { ConvSummary } from "@/types";
import type { HomeContact } from "./contact";
import { useHomeMotion } from "./mouvement/contexte";

/*
 * ———— En-tête : BLUSH en grand, comme le personnage de la conv (sa bulle, son nom en pastille) ————
 * `logoRef` : sa bulle, au registre de l’en-tête (elle vole vers la feuille du contact, saute de joie à un niveau).
 */
export function BlushTitle({ busy, onClick, big = false, logoRef }: { busy: boolean; onClick: () => void; big?: boolean; logoRef?: Ref<HTMLSpanElement> }) {
  const { arriving } = useHomeMotion();
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label="BLUSH, ce qu’il voit de vous deux" className="group pointer-events-auto relative flex flex-col items-center px-1 text-ink">
      {/* 1 · À l’arrivée, un halo rose s’allume derrière lui puis s’efface */}
      {arriving && (
        <span
          aria-hidden="true"
          data-a="aura"
          className={cn(
            "pointer-events-none absolute left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,125,186,0.5),rgba(255,125,186,0)_64%)] opacity-0",
            big ? "top-[44px]" : "top-[32px]",
          )}
        />
      )}
      <span data-c="logo" className="relative block">
        <span data-float="" className="block" style={{ "--r": "-3deg" }}>
          {/* data-blush-logo : son style (globals.css, la bulle qui se penche et l’origine de ses perles) et le repère du banc de fluidité ; le code le prend par logoRef */}
          <span ref={logoRef} data-a="logo" data-blush-logo="" className="block drop-shadow-[0_16px_18px_rgba(232,53,138,0.26)] group-hover:scale-105 group-active:scale-95">
            <BubbleLogo size={big ? 88 : 64} animated={busy} layered />
          </span>
        </span>
      </span>
      <span data-c="pill" className="relative -mt-1 block">
        <span
          data-a="pill"
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-white font-black leading-none tracking-[-0.02em] shadow-[0_0_0_1px_rgba(17,17,20,0.08),0_6px_14px_-6px_rgba(17,17,20,0.3)]",
            big ? "h-[30px] pl-3.5 pr-2 text-detail" : "h-[26px] pl-2.5 pr-1.5 text-note",
          )}
        >
          {/* L’adresse du site : toujours en haut de la conv, elle est sur chaque capture du chat */}
          askblush.com
          <Icon name="chevron" size={big ? 13 : 12} stroke={3} className="text-muted" />
        </span>
      </span>
    </button>
  );
}

/**
 * Plusieurs convs : le retour à la liste, avec les autres personnes en petit (deux au plus, puis « +n »),
 * pour qu’on voie d’un coup d’œil qu’il y a d’autres convs. `flat` : dans la barre de la fenêtre (desktop), sans ombre.
 */
export function ConvsButton({ others, flat = false }: { others: ConvSummary[]; flat?: boolean }) {
  const shown = others.slice(0, 2);
  const more = others.length - shown.length;
  return (
    <Link
      href="/app/convs"
      /* Préchargée en entier (son rendu ne lit que tes convs) : le glissé emporte la vraie liste, pas son écran d’attente */
      prefetch
      transitionTypes={["nav-back", "accueil-vers-convs"]}
      aria-label={`Tes convs (${others.map((o) => o.person.name).join(", ")})`}
      className={cn(
        "back-nudge pointer-events-auto flex h-10 items-center gap-1 rounded-full pl-2 pr-1.5 no-underline",
        flat ? "transition-colors hover:bg-[rgba(17,17,20,0.05)]" : "lift lift-sm lift-card bg-white shadow-soft",
      )}
    >
      <Icon name="back" size={17} stroke={2.6} className="text-ink" />
      <span aria-hidden="true" className="flex">
        {shown.map((o, i) => (
          <span key={o.storyId} className={cn("rounded-full shadow-[0_0_0_2px_white]", i > 0 && "-ml-2")}>
            <Avatar tone="elle" size={26} fontSize={11}>
              {o.person.initial}
            </Avatar>
          </span>
        ))}
        {more > 0 && <span className="-ml-2 flex size-[26px] items-center justify-center rounded-full bg-plaque text-[11px] font-black text-soft shadow-[0_0_0_2px_white]">+{more}</span>}
      </span>
    </Link>
  );
}

/**
 * Sophie, comme un contact : son avatar dans l’anneau de votre niveau, le verdict en badge, son prénom dessous. Un toucher ouvre sa fiche.
 * `contact` : où vous en êtes maintenant (un niveau peut tomber pendant la visite). `anneauRef` et `avatarRef` : au
 * registre de l’en-tête (11 · la fête d’un niveau, 9 · l’avatar qui vole vers la feuille du contact).
 * `shared` : 10 · c’est cet avatar (celui qu’on voit, mobile ou desktop) qui passe sur la fiche pendant le glissé.
 */
export function SophieButton({
  contact,
  anneauRef,
  avatarRef,
  shared = false,
}: {
  contact: Pick<HomeContact, "report" | "fiche" | "ficheHref">;
  anneauRef?: Ref<HTMLSpanElement>;
  avatarRef?: Ref<HTMLSpanElement>;
  shared?: boolean;
}) {
  const { report, fiche, ficheHref = "/app/fiche" } = contact;
  const { levels, index: idx, temperature } = scaleOf(report.level);
  const where = temperature ? (levels[idx]?.label ?? "") : `niveau ${idx + 1} sur ${levels.length}`;
  return (
    <Link
      href={ficheHref}
      prefetch
      transitionTypes={["nav-forward", "accueil-vers-fiche"]}
      aria-label={`${fiche.person.name}, voir sa fiche (${report.verdict.short}, ${where})`}
      className="group pointer-events-auto flex flex-col items-center gap-1 text-ink no-underline"
    >
      {/* L’anneau d’un contact (src/components/ui/contact.tsx), avec les ancres de ses animations */}
      <ContactRing
        ref={anneauRef}
        initial={fiche.person.initial}
        level={report.level}
        emoji={report.verdict.emoji}
        size={48}
        fontSize={15}
        data-c="so"
        className="transition-[scale] duration-300 [transition-timing-function:var(--ease-pop)] group-active:scale-95"
        ringProps={{ "data-a": "ring", "data-ring-fill": "" }}
        badgeProps={{ "data-badge": "", "data-a": "badge" }}
        enveloppe={(avatar) => {
          const vu = (
            <span ref={avatarRef} data-a="av" className="block rounded-full">
              {avatar}
            </span>
          );
          return shared ? (
            <ViewTransition name="sophie-avatar" share={{ "nav-forward": "avatar-morph", default: "none" }} default="none">
              {vu}
            </ViewTransition>
          ) : (
            vu
          );
        }}
      >
        {/* 11 · Le halo vert quand un niveau tombe (un calque à part : il s’anime sur le compositeur) */}
        <span aria-hidden="true" data-glow-ring="" className="pointer-events-none absolute -inset-1 rounded-full opacity-0 shadow-[0_0_14px_3px_rgba(18,192,138,0.7)]" />
      </ContactRing>
      <span data-c="nm" data-a="nm" className="text-micro font-black leading-none">
        {fiche.person.name}
      </span>
    </Link>
  );
}

/*
 * L’avatar de BLUSH sous chaque réponse : dessiné une fois par conv (ses dégradés, ses flous), puis repris par <use>.
 * Une conv longue portait autant de copies du logo que de réponses, chacune avec ses filtres, dans le HTML comme à la
 * peinture. Le dessin a l’identifiant que lui donne sa conv (useId), transmis à ses copies, et non un identifiant
 * global : si deux convs se trouvent un jour dans le même document (une page gardée cachée par Next pendant qu’une
 * autre s’affiche, par exemple), aucune ne prend le dessin de l’autre.
 */
const LogoDuFilContext = createContext<string | null>(null);

/** Une copie de l’avatar de BLUSH, dans une conv qui a son dessin (AvecLogoDuFil). */
export function LogoDuFil() {
  const id = use(LogoDuFilContext);
  return (
    <svg aria-hidden="true" width={34} height={34} viewBox="0 0 34 34" style={{ overflow: "visible", flexShrink: 0 }}>
      {id !== null && <use href={`#${id}`} />}
    </svg>
  );
}

/** Une conv et le dessin de l’avatar de BLUSH, une fois, en dernier (hors du flux : rien ne bouge, et la première ligne reste la première). */
export function AvecLogoDuFil({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <LogoDuFilContext value={id}>
      {children}
      <svg aria-hidden="true" width={0} height={0} className="pointer-events-none absolute">
        <defs>
          <g id={id}>
            <BubbleLogo size={34} />
          </g>
        </defs>
      </svg>
    </LogoDuFilContext>
  );
}
