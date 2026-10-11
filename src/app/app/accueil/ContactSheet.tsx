"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { estDesktop, flyBox, prefersReducedMotion, restingBox, visible, type Box, type Spring } from "@/lib/motion";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { Tag } from "@/components/ui/messages";
import { LevelPath } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/surfaces";
import type { HomeContact } from "./contact";

/*
 * Les détails du contact (9 · « Ce que BLUSH voit ») : où vous en êtes, le rapport, sa fiche. Un toucher sur BLUSH, en
 * haut de l’accueil, l’ouvre : sa bulle et l’avatar de l’autre volent de l’en-tête vers la feuille, l’écran recule
 * derrière elle, puis tout regagne sa place à la fermeture. La feuille donne son dialogue et son panneau par des refs
 * (src/components/ui/surfaces.tsx), joue sa sortie au rythme qu’on lui donne et prévient de sa fin (onClosed). Ce qui
 * vit hors d’elle est encore cherché dans la page : l’écran qui recule (recede) et ce qui s’envole de l’en-tête (departs),
 * jusqu’à 5c (src/app/app/accueil/mouvement/).
 */

/** La feuille « Ce que BLUSH voit » monte en 0,35 s : le logo et l’avatar y volent au même rythme. */
const SHEET_IN: Spring = { duration: 380, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const SHEET_OUT: Spring = { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" };

/** La pastille ronde en tête d’une ligne de la feuille : le verdict, l’avatar de l’autre. */
function Pastille({ children }: { children: ReactNode }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper">{children}</span>;
}

/**
 * 9 · L’écran recule derrière la feuille, comme sur iPhone (mobile seulement) : il rétrécit un peu, s’arrondit, et le noir apparaît autour.
 * « reset » remet tout en place sans animation (fermeture, départ vers une autre page).
 */
function recede(state: "in" | "out" | "reset", timing?: Spring) {
  /* TODO(5c): l’accueil par une ref (mouvement/), plus par sa classe */
  const page = document.querySelector<HTMLElement>(".home-page");
  /* Le fond noir vit sur <body> : on l’enlève toujours, même quand l’accueil a déjà disparu
     (depuis la feuille, on part vers le rapport ou sa fiche : l’accueil est retiré avant ce nettoyage) */
  if (state === "reset" || !page || estDesktop()) {
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
  /* TODO(5c): le registre du logo et de l’avatar de l’en-tête, au lieu de leurs attributs cherchés dans toute la page */
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
  /* Le dialogue et le panneau de la feuille, qu’elle nous donne */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* 9 · Ce qui a quitté l’en-tête pour la feuille : la bulle et l’avatar de l’autre, et d’où ils venaient (pour y revenir) */
  const moved = useRef<{ src: HTMLElement; from: Box; target: HTMLElement | SVGElement }[]>([]);
  /* La feuille joue sa sortie (close) : tout reprend sa place à sa fin (onClosed) */
  const closing = useRef(false);

  /* Tout reprend sa place : la bulle et l’avatar dans l’en-tête, l’écran derrière la feuille */
  const remettre = useCallback(() => {
    for (const m of moved.current) {
      shown(m.src, true);
      shown(m.target, true);
    }
    moved.current = [];
    closing.current = false;
    recede("reset");
  }, []);
  /* L’accueil quitté pendant la sortie : rien ne reste caché, ni l’écran reculé */
  useEffect(
    () => () => {
      if (closing.current) remettre();
    },
    [remettre],
  );

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    /* Rouverte pendant sa sortie : la précédente finit d’abord de tout remettre en place */
    if (closing.current) remettre();
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
      /* Fermée sans sortie (on part vers le rapport) : tout reprend sa place tout de suite. Fermée par close(), la
         feuille redescend encore : à la fin de sa sortie (onClosed) */
      if (!closing.current) remettre();
    };
  }, [open, departRef, remettre]);

  /*
   * La fermeture : la feuille redescend (sa sortie, à notre rythme : SHEET_OUT), la bulle et l’avatar regagnent
   * l’en-tête au même rythme, l’écran revient. À la fin de la sortie (onClosed), tout reprend sa place.
   */
  const close = () => {
    if (closing.current) return;
    const dialog = dialogRef.current;
    if (prefersReducedMotion() || !moved.current.length || !dialog) {
      onClose();
      return;
    }
    closing.current = true;
    for (const m of moved.current) {
      const from = m.target.getBoundingClientRect();
      const clone = m.target.cloneNode(true) as HTMLElement | SVGElement;
      shown(m.target, false);
      void flyBox(clone, from, m.from, { spring: SHEET_OUT, host: dialog, settle: 1 });
    }
    recede("out", SHEET_OUT);
    onClose();
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
    <Sheet open={open} onClose={close} onClosed={remettre} sortie={SHEET_OUT} labelledBy="contact-titre" dialogRef={dialogRef} panelRef={panelRef}>
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
      <InsetGroup>
        {/* Préchargé en entier : la feuille se ferme avant le départ, le rapport doit suivre sans attendre le serveur */}
        <InsetRow
          variant="compact"
          href="/rapport"
          prefetch
          onNavigate={versRapport}
          leading={<Pastille><span className="text-[20px] leading-none">{report.verdict.emoji}</span></Pastille>}
          title="Le rapport de votre histoire"
          sub={period}
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
          sub={fiche.summaryShort}
          chevron
        />
      </InsetGroup>
    </Sheet>
  );
}
