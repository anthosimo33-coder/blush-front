"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { flyBox, prefersReducedMotion, restingBox, visible, type Box, type Spring } from "@/lib/motion";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { InsetRow } from "@/components/ui/inset";
import { Tag } from "@/components/ui/messages";
import { LevelPath } from "@/components/ui/progress";
import { Sheet, sortieDeFeuille } from "@/components/ui/surfaces";
import type { HomeContact } from "../HomeScreen";

/*
 * Les détails du contact (9 · « Ce que BLUSH voit ») : où vous en êtes, le rapport, sa fiche. Un toucher sur BLUSH, en
 * haut de l’accueil, l’ouvre : sa bulle et l’avatar de l’autre volent de l’en-tête vers la feuille, l’écran recule
 * derrière elle, puis tout regagne sa place à la fermeture. La feuille donne son dialogue, son panneau et son voile par
 * des refs (src/components/ui/surfaces.tsx) : rien n’est cherché dans le DOM autour d’elle.
 */

const DESKTOP = "(min-width: 1024px)";

/** La feuille « Ce que BLUSH voit » monte en 0,35 s : le logo et l’avatar y volent au même rythme. */
const SHEET_IN: Spring = { duration: 380, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const SHEET_OUT: Spring = { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" };

/** Le filet entre deux lignes de la carte, comme dans une liste groupée (InsetGroup). */
const FILET = "border-t border-[rgba(17,17,20,0.06)]";

/**
 * Le sous-titre d’une ligne, posé même vide (sa fiche pas encore écrite) : InsetRow saute un sous-titre vide, et le titre
 * descendrait d’une demi-ligne. Dans un fragment, toujours là : la ligne garde sa forme.
 */
const toujours = (texte: string) => <>{texte}</>;

/** La pastille ronde en tête d’une ligne de la feuille : le verdict, l’avatar de l’autre. */
function Pastille({ children }: { children: ReactNode }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4F2ED]">{children}</span>;
}

/**
 * 9 · L’écran recule derrière la feuille, comme sur iPhone (mobile seulement) : il rétrécit un peu, s’arrondit, et le noir apparaît autour.
 * « reset » remet tout en place sans animation (fermeture, départ vers une autre page).
 */
function recede(state: "in" | "out" | "reset", timing?: Spring) {
  const page = document.querySelector<HTMLElement>(".home-page");
  /* Le fond noir vit sur <body> : on l’enlève toujours, même quand l’accueil a déjà disparu
     (depuis la feuille, on part vers le rapport ou sa fiche : l’accueil est retiré avant ce nettoyage) */
  if (state === "reset" || !page || window.matchMedia(DESKTOP).matches) {
    document.body.style.removeProperty("background");
    if (!page) return;
    page.getAnimations().forEach((a) => a.cancel());
    page.parentElement?.style.removeProperty("background");
    page.style.removeProperty("background");
    page.style.removeProperty("background-color");
    page.style.removeProperty("clip-path");
    return;
  }
  page.getAnimations().forEach((a) => a.cancel());
  const y = window.scrollY - page.offsetTop;
  const vh = window.innerHeight;
  const below = Math.max(0, page.offsetHeight - y - vh);
  /* Accroché en haut : la carte touche la barre d’état de Safari (qui garde sa couleur), le noir n’apparaît que sur les côtés.
     La découpe arrondie est posée d’un coup, seule l’échelle s’anime : le compositeur la joue seul, même sur une longue conv */
  page.style.transformOrigin = `50% ${y}px`;
  page.style.background = "var(--paper-light)";
  page.style.backgroundColor = "var(--paper)";
  page.style.clipPath = `inset(${y}px 0 ${below}px 0 round 24px)`;
  const rest: Keyframe = { transform: "none" };
  const back: Keyframe = { transform: "scale(0.94)" };
  page.animate(state === "in" ? [rest, back] : [back, rest], { duration: timing?.duration ?? 300, easing: timing?.easing, fill: state === "in" ? "forwards" : "none" });
  /* Le noir autour : sur la page et sur son cadre (qui a son propre fond pour le glissé vers la fiche) */
  if (state === "in") {
    document.body.style.background = "#000";
    page.parentElement?.style.setProperty("background", "#000");
  }
}

/** Cache ou remontre un élément sans changer la mise en page (pendant qu’un double vole à sa place). */
function shown(el: HTMLElement | SVGElement, on: boolean) {
  el.style.visibility = on ? "" : "hidden";
}

/** 9 · Ce qui vole de l’en-tête vers la feuille du contact (la bulle de BLUSH, l’avatar de l’autre), et d’où. */
type Depart = { src: HTMLElement; from: Box };
export type Departs = { logo: Depart | null; av: Depart | null };

/** 9 · Relève d’où partent la bulle de BLUSH et l’avatar de l’autre (ceux qu’on voit, mobile ou desktop) : au toucher, quand la page est encore à jour. */
export function departs(): Departs {
  const de = (selector: string) => {
    const src = visible<HTMLElement>(selector);
    return src ? { src, from: src.getBoundingClientRect() } : null;
  };
  return { logo: de("[data-blush-logo]"), av: de("[data-sophie-avatar]") };
}

/**
 * Les détails du contact : le verdict, où vous en êtes, le rapport et sa fiche. `departRef` : d’où l’accueil a vu partir
 * la bulle et l’avatar au toucher (departs), lu une fois à l’ouverture ; sans lui, relevé à ce moment-là.
 */
export function ContactSheet({
  contact,
  open,
  onClose,
  departRef,
}: {
  contact: Pick<HomeContact, "report" | "fiche" | "period" | "ficheHref">;
  open: boolean;
  onClose: () => void;
  departRef: RefObject<Departs | null>;
}) {
  const { report, fiche, period, ficheHref = "/app/fiche" } = contact;
  const router = useRouter();
  const logoRef = useRef<HTMLSpanElement>(null);
  const avRef = useRef<HTMLSpanElement>(null);
  /* Le dialogue, le panneau et le voile de la feuille, qu’elle nous donne */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const voileRef = useRef<HTMLDivElement>(null);
  /* 9 · Ce qui a quitté l’en-tête pour la feuille : la bulle et l’avatar de l’autre, et d’où ils venaient (pour y revenir) */
  const moved = useRef<{ src: HTMLElement; from: Box; target: HTMLElement | SVGElement }[]>([]);
  const closing = useRef(false);

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    /* Le départ a été relevé au toucher ; l’arrivée l’est à l’image suivante, la feuille posée : rien n’oblige le clic à remettre la page en page */
    const de = departRef.current ?? departs();
    departRef.current = null;
    const raf = requestAnimationFrame(() => {
      const logoBox = logoRef.current;
      const avBox = avRef.current;
      const panel = panelRef.current;
      const still = panel?.offsetParent as HTMLElement | null | undefined;
      const dialog = dialogRef.current;
      const logo = logoBox?.querySelector("svg");
      const av = avBox?.firstElementChild as HTMLElement | null | undefined;
      if (!logoBox || !avBox || !panel || !still || !dialog || !logo || !av) return;
      const pairs = [
        { de: de.logo, measure: logoBox, target: logo as SVGElement },
        { de: de.av, measure: avBox, target: av },
      ];
      moved.current = [];
      for (const p of pairs) {
        if (!p.de) continue;
        const { src, from } = p.de;
        const to = restingBox(p.measure, still);
        const clone = p.target.cloneNode(true) as HTMLElement | SVGElement;
        shown(src, false);
        shown(p.target, false);
        const target = p.target;
        void flyBox(clone, from, to, { spring: SHEET_IN, host: dialog, settle: 1 }).then(() => {
          if (!closing.current) shown(target, true);
        });
        moved.current.push({ src, from, target: p.target });
      }
      recede("in", SHEET_IN);
    });
    return () => {
      cancelAnimationFrame(raf);
      /* La feuille est fermée (ou on part vers le rapport, sa fiche) : tout reprend sa place */
      for (const m of moved.current) {
        shown(m.src, true);
        shown(m.target, true);
      }
      moved.current = [];
      closing.current = false;
      recede("reset");
    };
  }, [open, departRef]);

  /*
   * La fermeture : la feuille redescend (la sortie de la Sheet, à notre rythme), la bulle et l’avatar regagnent
   * l’en-tête, l’écran revient. La Sheet voit l’animation déjà posée sur son panneau et ferme sans rejouer la sienne.
   */
  const close = () => {
    if (closing.current) return;
    const panel = panelRef.current;
    const dialog = dialogRef.current;
    if (prefersReducedMotion() || !moved.current.length || !panel || !dialog) {
      onClose();
      return;
    }
    closing.current = true;
    const { temps, panneau, voile } = sortieDeFeuille(window.matchMedia(DESKTOP).matches, SHEET_OUT);
    panel.animate(panneau, temps);
    voileRef.current?.animate(voile, temps);
    for (const m of moved.current) {
      const from = m.target.getBoundingClientRect();
      const clone = m.target.cloneNode(true) as HTMLElement | SVGElement;
      shown(m.target, false);
      void flyBox(clone, from, m.from, { spring: SHEET_OUT, host: dialog, settle: 1 });
    }
    recede("out", SHEET_OUT);
    window.setTimeout(onClose, SHEET_OUT.duration);
  };

  /*
   * Vers le rapport : la feuille se ferme d’abord, d’un coup, puis on part. Au geste retour, Safari remontre l’accueil
   * tel qu’on l’a quitté, sans la feuille ni l’écran reculé. Sa fiche, elle, garde le glissé de l’avatar.
   */
  const versRapport = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    /* Le dialogue fermé ici : Sheet saute sa sortie animée (la feuille redescendrait encore au départ, dans la capture de Safari) */
    dialogRef.current?.close();
    onClose();
    /* Une image peinte sans la feuille, puis un temps : Safari ne reprend sa capture qu’après (mesuré sur iPhone : partie à
       +62 ms, elle montrait encore la feuille ; à +140 ms, l’accueil propre) */
    requestAnimationFrame(() => window.setTimeout(() => router.push("/rapport"), 120));
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="contact-titre" dialogRef={dialogRef} panelRef={panelRef} backdropRef={voileRef}>
      <div className="relative flex flex-col items-center gap-2 pt-1 text-center">
        <IconButton icon="close" label="Fermer" onClick={close} className="!absolute right-0 top-0" />
        <span className="flex items-center gap-1.5 text-[13px] font-black text-grey">
          <span ref={logoRef} className="-my-2 block">
            <BubbleLogo size={36} />
          </span>
          Ce que BLUSH voit
        </span>
        <span ref={avRef} className="block">
          <Avatar tone="elle" size={72} fontSize={28}>
            {fiche.person.initial}
          </Avatar>
        </span>
        <h2 id="contact-titre" className="m-0 text-[22px] font-black tracking-[-0.01em]">
          {fiche.person.name} et toi
        </h2>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-black">
            {report.verdict.emoji} {report.verdict.short}
          </span>
          <Tag tone="verite">{report.trend}</Tag>
        </span>
      </div>
      <div className="rounded-[20px] bg-white px-3 pb-3 pt-4 shadow-card">
        <LevelPath current={report.level} variant="compact" />
      </div>
      <div className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-card">
        {/* Préchargé en entier : la feuille se ferme avant le départ, le rapport doit suivre sans attendre le serveur */}
        <InsetRow
          variant="compact"
          href="/rapport"
          prefetch
          onNavigate={versRapport}
          leading={<Pastille><span className="text-[20px] leading-none">{report.verdict.emoji}</span></Pastille>}
          title="Le rapport de votre histoire"
          sub={toujours(period)}
          chevron
        />
        <InsetRow
          variant="compact"
          href={ficheHref}
          leading={
            <Pastille>
              <Avatar tone="elle" size={36} fontSize={15}>
                {fiche.person.initial}
              </Avatar>
            </Pastille>
          }
          title="Sa fiche"
          sub={toujours(fiche.summaryShort)}
          chevron
          className={FILET}
        />
      </div>
    </Sheet>
  );
}
