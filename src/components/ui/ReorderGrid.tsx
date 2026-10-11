"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

/*
 * Une grille à réordonner (les captures d’un import, dans l’ordre où BLUSH les lit) : on maintient une case puis on la
 * glisse (doigt ou souris), ou on la déplace au clavier avec les flèches. Les autres cases se décalent en douceur.
 * Le moteur (useReordonnable) ne connaît que des identifiants ; ce que montre une case, et ce qui se dit d’elle, vient
 * de l’écran.
 */

/** Trois cases par ligne : la grille (grid-cols-3), et les flèches haut et bas, qui sautent d’une ligne. */
const COLONNES = 3;

/** Ce qui se dit des cases, aux lecteurs d’écran : la liste, une case (sa position, sur combien), et ce qu’on en fait. */
type TextesGrille = {
  liste: string;
  element: (position: number, total: number) => string;
  retirer: (position: number) => string;
  deplacee: (position: number) => string;
  ajouter: string;
};

/** Les réglages du moteur : ce qu’il rapporte à l’écran (un déplacement, un retrait, ce qu’il faut annoncer), s’il est figé, et ce qui se dit des cases. */
type Reglages = { onMove: (id: string, to: number) => void; onRemove: (id: string) => void; onAnnounce: (t: string) => void; fige?: boolean; textes: TextesGrille };

/* Pendant un glisser au doigt, la page ne doit pas défiler */
function blockScroll(e: TouchEvent) {
  e.preventDefault();
}

/**
 * Le moteur du réordonnancement : l’appui maintenu (au doigt) ou le glisser (à la souris), la case visée sous le
 * pointeur, les flèches du clavier, et le glissement des cases qui changent de place. `fige` : rien ne bouge.
 */
function useReordonnable(ids: string[], { onMove, onRemove, onAnnounce, fige, textes }: Reglages) {
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean; timer: number; el: HTMLElement } | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const spots = useRef(new Map<string, { x: number; y: number }>());
  const latest = useRef(ids);
  useEffect(() => {
    latest.current = ids;
  }, [ids]);
  const order = ids.join("|");

  /* Les cases qui changent de place glissent de l’ancienne à la nouvelle (positions dans la grille, pas dans l’écran) */
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, id) => {
      const now = { x: el.offsetLeft, y: el.offsetTop };
      const before = spots.current.get(id);
      if (before && !reduce && (before.x !== now.x || before.y !== now.y)) {
        el.animate([{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      spots.current.set(id, now);
    });
  }, [order]);

  const start = () => {
    const d = drag.current;
    if (!d || d.active) return;
    d.active = true;
    setDragId(d.id);
    try {
      d.el.setPointerCapture(d.pointerId);
    } catch {
      /* le pointeur est déjà relâché */
    }
    window.addEventListener("touchmove", blockScroll, { passive: false });
    navigator.vibrate?.(10);
  };

  const end = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    window.removeEventListener("touchmove", blockScroll);
    if (d.active) {
      setDragId(null);
      const at = latest.current.indexOf(d.id);
      onAnnounce(textes.deplacee(at + 1));
    }
    drag.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (fige || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, timer: 0, el: e.currentTarget };
    /* Au doigt, un appui maintenu lance le glisser (un simple balayage fait défiler la page) */
    if (e.pointerType !== "mouse") drag.current.timer = window.setTimeout(start, 230);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (e.pointerType === "mouse") {
        if (moved > 6) start();
      } else if (moved > 10) {
        clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-thumb]");
    const target = hit?.dataset.thumb;
    if (target && target !== d.id) {
      const to = latest.current.indexOf(target);
      if (to >= 0) onMove(d.id, to);
    }
  };

  const onKey = (e: KeyboardEvent, id: string, i: number) => {
    if (fige) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLONNES, ArrowDown: COLONNES }[e.key];
    if (step) {
      e.preventDefault();
      const to = Math.min(ids.length - 1, Math.max(0, i + step));
      if (to === i) return;
      onMove(id, to);
      onAnnounce(textes.deplacee(to + 1));
      requestAnimationFrame(() => nodes.current.get(id)?.querySelector<HTMLButtonElement>("button[data-handle]")?.focus());
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(id);
    }
  };

  /** La case `id` : son nœud, suivi pour le glissement des cases. */
  const caseDe = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
  /** La poignée de la case `id`, à la position `i` : le glisser et le clavier. */
  const poignee = (id: string, i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, id),
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e: KeyboardEvent) => onKey(e, id, i),
  });

  return { dragId, caseDe, poignee };
}

/**
 * La grille à réordonner : chaque case (`rendu`) se glisse ou se déplace au clavier, et se retire d’une petite croix,
 * comme les photos d’un message. `ajout` : une dernière case (son `rendu`) pour en ajouter (`onAdd`). `sous` : ce qui se
 * dit juste sous la grille. `aide` : le texte qui explique le geste, montré ensuite et lu avec chaque case dès qu’il y
 * en a deux. `fige` (pendant l’envoi) : ni glisser, ni déplacer, ni retirer.
 */
export function ReorderGrid<T extends { id: string }>({
  items,
  onMove,
  onRemove,
  onAnnounce,
  fige,
  rendu,
  ajout,
  textes,
  sous,
  aide,
}: Reglages & {
  items: T[];
  rendu: (item: T, position: number) => ReactNode;
  ajout?: { onAdd: () => void; rendu: ReactNode };
  sous?: ReactNode;
  aide?: ReactNode;
}) {
  /* Les identifiants ne changent qu’avec les cases : le moteur ne les relit pas à chaque rendu */
  const ids = useMemo(() => items.map((s) => s.id), [items]);
  const { dragId, caseDe, poignee } = useReordonnable(ids, { onMove, onRemove, onAnnounce, fige, textes });
  const aideId = useId();
  const avecAide = aide != null && items.length > 1;

  return (
    <>
      <ol className="relative m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label={textes.liste}>
        {items.map((s, i) => {
          const lifted = dragId === s.id;
          return (
            <li key={s.id} data-thumb={s.id} ref={caseDe(s.id)} className={cn("relative", lifted && "z-10")}>
              <button
                type="button"
                data-handle=""
                aria-label={textes.element(i + 1, items.length)}
                aria-describedby={avecAide ? aideId : undefined}
                {...poignee(s.id, i)}
                onContextMenu={(e) => e.preventDefault()}
                className={cn(
                  "block w-full select-none rounded-2xl transition-[transform,box-shadow] duration-200 [-webkit-touch-callout:none]",
                  lifted ? "-rotate-2 scale-[1.06] cursor-grabbing shadow-[0_18px_36px_-12px_rgba(17,17,20,0.45)]" : "cursor-grab",
                )}
                style={lifted ? { touchAction: "none" } : undefined}
              >
                {rendu(s, i + 1)}
              </button>
              {/* Retirer : une petite croix, comme sur les photos d’un message */}
              <button
                type="button"
                hidden={fige}
                aria-label={textes.retirer(i + 1)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(s.id)}
                className={cn(
                  "absolute left-1.5 top-1.5 z-[1] flex size-7 items-center justify-center rounded-full bg-[rgba(17,17,20,0.72)] transition-opacity",
                  lifted && "opacity-0",
                )}
              >
                <Icon name="close" size={12} stroke={3} className="text-white" />
              </button>
            </li>
          );
        })}
        {ajout && (
          <li>
            <button type="button" onClick={ajout.onAdd} aria-label={textes.ajouter} className="lift block w-full rounded-2xl">
              {ajout.rendu}
            </button>
          </li>
        )}
      </ol>
      {sous}
      {avecAide && (
        <p id={aideId} className="m-0 text-legende font-extrabold leading-[1.45] text-grey">
          {aide}
        </p>
      )}
    </>
  );
}
