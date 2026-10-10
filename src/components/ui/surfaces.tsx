"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";
import { bloquerDefilement } from "@/lib/defilement";

/**
 * Sheet : panneau du bas sur mobile, fenêtre centrée sur desktop.
 * <dialog> natif : focus piégé, Échap pour fermer, fond inerte.
 * Elle monte en douceur et redescend de même : son contenu reste là le temps de la sortie, puis le dialogue se ferme.
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
  className,
  belowHeader = true,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  /** Desktop : le voile commence sous l’en-tête de 84 px (faux pour les écrans sans en-tête, comme le mode sobre). */
  belowHeader?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const voile = useRef<HTMLDivElement>(null);
  /* Le défilement bloqué par cette feuille (src/lib/defilement.ts) : libéré à sa fermeture, quelle qu’elle soit */
  const liberer = useRef<(() => void) | null>(null);
  /* Le contenu reste monté pendant la sortie : `montee` ne repasse à faux qu’une fois la feuille redescendue */
  const [montee, setMontee] = useState(open);
  if (open && !montee) setMontee(true);
  /* Pendant la sortie, elle garde ce qu’elle montrait : l’écran a souvent déjà effacé sa sélection (la conv, l’image choisie) */
  const [montre, setMontre] = useState(children);
  if (open && montre !== children) setMontre(children);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) {
        d.showModal();
        /* Le focus va sur le panneau (annoncé par son titre), pas sur la première option.
           preventScroll : sinon Safari (iPhone) fait défiler la feuille pendant qu’elle monte, et elle reste coincée en haut */
        requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
      }
      liberer.current = bloquerDefilement();
      return () => {
        liberer.current?.();
        liberer.current = null;
      };
    }
    if (!d.open) return;
    /* La sortie : la page défile de nouveau tout de suite (le défilement a été libéré), la feuille redescend, puis se ferme.
       Sans animation si l’appareil en demande moins, ou si l’écran anime déjà la sienne (la feuille du contact) */
    const p = panel.current;
    const fermer = () => {
      d.close();
      setMontee(false);
    };
    const geree = p?.getAnimations().some((a) => !(a instanceof CSSAnimation));
    if (!p || geree || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fermer();
      return;
    }
    const desk = window.matchMedia("(min-width: 1024px)").matches;
    const sortie = { duration: desk ? 200 : 280, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" as const };
    p.style.pointerEvents = "none";
    const anims = [
      p.animate(desk ? [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(16px) scale(0.98)" }] : [{ transform: "none" }, { transform: "translateY(100%)" }], sortie),
      ...(voile.current ? [voile.current.animate([{ opacity: 1 }, { opacity: 0 }], sortie)] : []),
    ];
    anims[0].finished.then(fermer, () => {});
    /* Rouverte pendant sa sortie : elle reprend sa place */
    return () => {
      anims.forEach((a) => a.cancel());
      p.style.pointerEvents = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        liberer.current?.();
        liberer.current = null;
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      {(open || montee) && (
        <>
          {/* Le voile : pas de flou sur téléphone (presque invisible sous le noir, mais recalculé sur tout l’écran à chaque image) */}
          <div
            ref={voile}
            aria-hidden="true"
            onClick={onClose}
            className={cn("absolute inset-0 bg-[rgba(17,17,20,0.4)] lg:bg-[rgba(17,17,20,0.35)] lg:backdrop-blur-[1.5px]", belowHeader && "lg:top-[84px]")}
            style={{ animation: "fadeIn 0.25s ease-out both" }}
          />
          <div className={cn("pointer-events-none absolute inset-0 flex items-end justify-center lg:items-start", belowHeader ? "lg:pt-[134px]" : "lg:pt-[120px]")}>
            <div
              ref={panel}
              tabIndex={-1}
              className={cn(
                /* [&>*]:shrink-0 : quand le contenu dépasse l’écran, le panneau défile ; rien ne s’écrase (bouton aplati, carte rognée) */
                "pointer-events-auto relative flex outline-none max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto bg-white px-[22px] pb-6 pt-2.5 md:max-w-[560px] [&>*]:shrink-0",
                "rounded-t-[30px] shadow-[0_-20px_50px_rgba(17,17,20,0.18)] [animation:sheetUp_0.35s_cubic-bezier(0.2,0.8,0.2,1)_both]",
                "lg:w-[640px] lg:max-w-[640px] lg:gap-4 lg:rounded-[32px] lg:p-[30px] lg:shadow-[0_30px_80px_rgba(17,17,20,0.25)] lg:[animation:sheetIn_0.3s_cubic-bezier(0.2,0.8,0.2,1)_both]",
                className,
              )}
            >
              <span aria-hidden="true" className="h-[5px] w-11 shrink-0 self-center rounded-[3px] bg-track lg:hidden" />
              {open ? children : montre}
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

/** Toast : bandeau encre avec coche verte et une action. */
export function Toast({
  children,
  action,
  onAction,
  className,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-popin=""
      className={cn(
        "z-40 flex items-center gap-2.5 rounded-[20px] bg-ink px-3.5 py-3 text-white shadow-[0_16px_34px_-12px_rgba(17,17,20,0.6)]",
        className,
      )}
    >
      <span
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" }}
      >
        <Icon name="check" size={14} color="#FFFFFF" stroke={3.4} />
      </span>
      <span className="flex-1 text-[14px] font-extrabold">{children}</span>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="relative inline-flex h-8 items-center rounded-2xl bg-white px-3 text-[13px] font-black text-ink after:absolute after:-inset-1.5 after:content-['']"
        >
          {action}
        </button>
      )}
    </div>
  );
}
