"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";
import { DoneCheck } from "./feedback";
import { Icon } from "./icons";
import { bloquerDefilement } from "@/lib/defilement";
import { estDesktop } from "@/lib/motion";

/** Donne l’élément à une ref de l’écran, objet ou fonction. */
function assigner<T>(ref: Ref<T> | undefined, el: T | null) {
  if (typeof ref === "function") ref(el);
  else if (ref) ref.current = el;
}

/** La sortie d’une feuille : sa durée (ms) et sa courbe. */
export type SortieFeuille = { duration: number; easing: string };

/**
 * La sortie de la feuille sur cet appareil : le panneau redescend (téléphone, 280 ms) ou s’efface en reculant
 * (ordinateur, 200 ms), le voile s’éteint au même rythme. `sortie` : une autre durée, une autre courbe (la prop `sortie`
 * de Sheet : un écran qui anime d’autres éléments avec elle lui donne son rythme, comme la feuille du contact de l’accueil).
 */
export function sortieDeFeuille(desk: boolean, sortie?: SortieFeuille) {
  const temps = { duration: sortie?.duration ?? (desk ? 200 : 280), easing: sortie?.easing ?? "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" as const };
  const panneau: Keyframe[] = desk
    ? [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(16px) scale(0.98)" },
      ]
    : [{ transform: "none" }, { transform: "translateY(100%)" }];
  const voile: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
  return { temps, panneau, voile };
}

/** Un titre qui se voit : ni vide (null, undefined), ni un booléen (`cond && "…"`), que React ne rendrait pas. */
type TitreVisible = Exclude<ReactNode, null | undefined | boolean>;

/**
 * Le titre d’une feuille : `labelledBy`, l’id d’un titre que l’écran pose dans la feuille ; ou `title`, que la feuille
 * pose elle-même en tête (TitreFeuille, son id tiré de useId), `titleSize` sa taille, `titleClose` le bouton Fermer à côté.
 * Pendant la sortie, la feuille garde le titre qu’elle montrait, comme son contenu.
 */
type TitreDeLaFeuille =
  | { labelledBy: string; title?: undefined; titleSize?: undefined; titleClose?: undefined }
  | { title: TitreVisible; titleSize?: TailleTitreFeuille; titleClose?: boolean; labelledBy?: undefined };

/**
 * Sheet : panneau du bas sur mobile, fenêtre centrée sur desktop.
 * <dialog> natif : focus piégé, Échap pour fermer, fond inerte.
 * Elle monte en douceur et redescend de même : son contenu reste là le temps de la sortie, puis le dialogue se ferme.
 *
 * Les refs (`dialogRef`, `panelRef`, `backdropRef`) donnent à l’écran le dialogue, le panneau et le voile, pour animer
 * avec eux sans les chercher dans le DOM. `sortie` : la durée et la courbe de la sortie animée. `onClosed` : la feuille
 * est fermée, sa sortie finie, quelle qu’ait été la fermeture (Échap, le voile, l’écran).
 */
export function Sheet({
  open,
  onClose,
  onClosed,
  children,
  className,
  belowHeader = true,
  dialogRef,
  panelRef,
  backdropRef,
  sortie,
  ...titre
}: {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  children: ReactNode;
  className?: string;
  /** Desktop : le voile commence sous l’en-tête de 84 px (faux pour les écrans sans en-tête, comme le mode sobre). */
  belowHeader?: boolean;
  dialogRef?: Ref<HTMLDialogElement>;
  panelRef?: Ref<HTMLDivElement>;
  backdropRef?: Ref<HTMLDivElement>;
  sortie?: SortieFeuille;
} & TitreDeLaFeuille) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const voile = useRef<HTMLDivElement>(null);
  /* Chaque élément tenu par la feuille, et par l’écran s’il le demande */
  const refDialogue = useCallback(
    (el: HTMLDialogElement | null) => {
      ref.current = el;
      assigner(dialogRef, el);
    },
    [dialogRef],
  );
  const refPanneau = useCallback(
    (el: HTMLDivElement | null) => {
      panel.current = el;
      assigner(panelRef, el);
    },
    [panelRef],
  );
  const refVoile = useCallback(
    (el: HTMLDivElement | null) => {
      voile.current = el;
      assigner(backdropRef, el);
    },
    [backdropRef],
  );
  /* Le titre posé par la feuille : un id à elle, unique sur la page */
  const idTitre = useId();
  const labelledBy = titre.labelledBy ?? idTitre;
  /* Le défilement bloqué par cette feuille (src/lib/defilement.ts) : libéré à sa fermeture, quelle qu’elle soit */
  const liberer = useRef<(() => void) | null>(null);
  /* Le contenu reste monté pendant la sortie : `montee` ne repasse à faux qu’une fois la feuille redescendue */
  const [montee, setMontee] = useState(open);
  if (open && !montee) setMontee(true);
  /* Pendant la sortie, elle garde ce qu’elle montrait : l’écran a souvent déjà effacé sa sélection (la conv, l’image choisie) */
  const [montre, setMontre] = useState(children);
  if (open && montre !== children) setMontre(children);
  /* De même pour le titre qu’elle pose : l’écran le tire souvent de cette sélection (« Supprimer … ? ») */
  const [titreMontre, setTitreMontre] = useState(titre.title);
  if (open && titreMontre !== titre.title) setTitreMontre(titre.title);
  /* La sortie demandée par l’écran, en valeurs simples : l’effet ne repart pas à chaque rendu */
  const dureeSortie = sortie?.duration;
  const courbeSortie = sortie?.easing;

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
       Sans animation si l’appareil en demande moins */
    const p = panel.current;
    const fermer = () => {
      d.close();
      setMontee(false);
    };
    if (!p || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fermer();
      return;
    }
    const {
      temps,
      panneau,
      voile: eteint,
    } = sortieDeFeuille(estDesktop(), dureeSortie !== undefined && courbeSortie !== undefined ? { duration: dureeSortie, easing: courbeSortie } : undefined);
    p.style.pointerEvents = "none";
    const sortiePanneau = p.animate(panneau, temps);
    const anims = [sortiePanneau, ...(voile.current ? [voile.current.animate(eteint, temps)] : [])];
    /* Annulée (la feuille rouverte pendant sa sortie) : elle reste ouverte, rien à fermer */
    sortiePanneau.finished.then(fermer, () => {});
    /* Rouverte pendant sa sortie : elle reprend sa place */
    return () => {
      anims.forEach((a) => a.cancel());
      p.style.pointerEvents = "";
    };
  }, [open, dureeSortie, courbeSortie]);

  return (
    <dialog
      ref={refDialogue}
      aria-labelledby={labelledBy}
      /*
       * Seulement les siens : React fait remonter « cancel » et « close » d’une feuille posée dans celle-ci (la carte dans
       * l’offre ①) jusqu’à elle, qui se croirait fermée (Échap, ou la feuille du dessus refermée)
       */
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClose={(e) => {
        if (e.target !== e.currentTarget) return;
        liberer.current?.();
        liberer.current = null;
        onClosed?.();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      {(open || montee) && (
        <>
          {/* Le voile : pas de flou sur téléphone (presque invisible sous le noir, mais recalculé sur tout l’écran à chaque image) */}
          <div
            ref={refVoile}
            aria-hidden="true"
            onClick={onClose}
            className={cn("absolute inset-0 bg-[rgba(17,17,20,0.4)] lg:bg-[rgba(17,17,20,0.35)] lg:backdrop-blur-[1.5px]", belowHeader && "lg:top-[84px]")}
            style={{ animation: "fadeIn 0.25s ease-out both" }}
          />
          <div className={cn("pointer-events-none absolute inset-0 flex items-end justify-center lg:items-start", belowHeader ? "lg:pt-[134px]" : "lg:pt-[120px]")}>
            <div
              ref={refPanneau}
              tabIndex={-1}
              className={cn(
                /* [&>*]:shrink-0 : quand le contenu dépasse l’écran, le panneau défile ; rien ne s’écrase (bouton aplati, carte rognée).
                   Sur un écran court (375 × 667), il monte un peu plus haut : la feuille du paiement y tient sans défiler */
                "pointer-events-auto relative flex outline-none max-h-[92dvh] [@media(max-height:700px)]:max-h-[96dvh] w-full flex-col gap-3 overflow-y-auto bg-white px-[22px] pb-6 pt-2.5 md:max-w-[560px] [&>*]:shrink-0",
                "rounded-t-[30px] shadow-[0_-20px_50px_rgba(17,17,20,0.18)] [animation:sheetUp_0.35s_cubic-bezier(0.2,0.8,0.2,1)_both]",
                "lg:w-[640px] lg:max-w-[640px] lg:gap-4 lg:rounded-[32px] lg:p-[30px] lg:shadow-[0_30px_80px_rgba(17,17,20,0.25)] lg:[animation:sheetIn_0.3s_cubic-bezier(0.2,0.8,0.2,1)_both]",
                className,
              )}
            >
              <span aria-hidden="true" className="h-[5px] w-11 shrink-0 self-center rounded-[3px] bg-track lg:hidden" />
              {titre.labelledBy === undefined && (
                <TitreFeuille id={labelledBy} taille={titre.titleSize} fermer={titre.titleClose ? onClose : undefined}>
                  {open ? titre.title : titreMontre}
                </TitreFeuille>
              )}
              {open ? children : montre}
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

/* ———— Le titre d’une feuille ———— */
/** Les tailles de titre des feuilles, telles qu’elles s’écrivaient : 22 (la vidéo), 24 (la plupart), 26 (le paiement, le choix d’une conv). */
const TAILLES_TITRE = {
  22: "text-[22px] leading-[1.1]",
  24: "text-titre-3 leading-[1.1]",
  26: "text-[26px] leading-[1.05]",
} as const;

type TailleTitreFeuille = keyof typeof TAILLES_TITRE;

/**
 * Le titre d’une feuille, que son dialogue lit (aria-labelledby = `id`). `fermer` : le bouton Fermer à sa droite (le
 * partage). `className` : ce que l’écran ajoute (la taille sur ordinateur, l’équilibre des lignes), jamais une autre
 * taille de base.
 */
export function TitreFeuille({
  id,
  children,
  taille = 24,
  fermer,
  className,
}: {
  id: string;
  children: ReactNode;
  taille?: TailleTitreFeuille;
  fermer?: () => void;
  className?: string;
}) {
  const h2 = (
    <h2 id={id} className={cn("m-0 font-black tracking-[-0.02em]", TAILLES_TITRE[taille], className)}>
      {children}
    </h2>
  );
  if (!fermer) return h2;
  return (
    <div className="flex items-center justify-between gap-3">
      {h2}
      <button type="button" aria-label="Fermer" onClick={fermer} className="lift lift-sm flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
        <Icon name="close" size={16} stroke={2.8} className="text-ink" />
      </button>
    </div>
  );
}

/** Toast : bandeau encre avec coche verte et une action. */
export function Toast({ children, action, onAction, className }: { children: ReactNode; action?: string; onAction?: () => void; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-popin=""
      className={cn("z-40 flex items-center gap-2.5 rounded-[20px] bg-ink px-3.5 py-3 text-white shadow-[0_16px_34px_-12px_rgba(17,17,20,0.6)]", className)}
    >
      <DoneCheck size={26} />
      <span className="flex-1 text-note font-extrabold">{children}</span>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="relative inline-flex h-8 items-center rounded-2xl bg-white px-3 text-legende font-black text-ink after:absolute after:-inset-1.5 after:content-['']"
        >
          {action}
        </button>
      )}
    </div>
  );
}
