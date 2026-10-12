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
 * Un glisser en cours : la case, son pointeur, d’où il est parti, s’il a soulevé la case, le minuteur de l’appui
 * maintenu, la poignée, et si c’est un doigt (ou un stylet) plutôt qu’une souris.
 */
type Glisser = { id: string; pointerId: number; x: number; y: number; active: boolean; timer: number; el: HTMLElement; doigt: boolean };

/**
 * Le moteur du réordonnancement : l’appui maintenu (au doigt) ou le glisser (à la souris), la case visée sous le
 * pointeur, les flèches du clavier, et le glissement des cases qui changent de place. `fige` : rien ne bouge.
 *
 * Le glisser s’écoute sur la fenêtre, de l’appui jusqu’au lâcher (pointermove, pointerup, pointercancel) : dès que la
 * case change de place, React déplace son élément dans la liste, et le navigateur lui retire le pointeur
 * (lostpointercapture, dans Chromium comme dans WebKit). Lâchée hors d’une case (au-dessus de la grille, entre deux
 * cases), elle se pose quand même. Le pointeur perdu est rendu à la case tant qu’il est appuyé.
 */
function useReordonnable(ids: string[], { onMove, onRemove, onAnnounce, fige, textes }: Reglages) {
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<Glisser | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const spots = useRef(new Map<string, { x: number; y: number }>());
  /* La grille elle-même : le focus y revient quand la dernière case est retirée au clavier */
  const grille = useRef<HTMLOListElement>(null);
  const latest = useRef(ids);
  useEffect(() => {
    latest.current = ids;
  }, [ids]);
  /* Ce que le glisser rapporte à l’écran, à jour : les écouteurs de la fenêtre, posés une fois, le lisent quand ils servent */
  const rapport = useRef({ onMove, onAnnounce, textes });
  useEffect(() => {
    rapport.current = { onMove, onAnnounce, textes };
  });
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

  /* Le glisser, de l’appui au lâcher : des fonctions faites une fois, que la fenêtre écoute et qu’on lui retire à l’identique */
  const glisser = useMemo(() => {
    const capturer = (d: Glisser) => {
      try {
        d.el.setPointerCapture(d.pointerId);
        return true;
      } catch {
        /* le pointeur est déjà relâché */
        return false;
      }
    };
    /** Retire tout ce que le glisser a posé (le minuteur, les écouteurs de la fenêtre), sans rien annoncer. */
    const nettoyer = () => {
      const d = drag.current;
      if (d) clearTimeout(d.timer);
      window.removeEventListener("touchmove", blockScroll);
      window.removeEventListener("pointermove", deplacer);
      window.removeEventListener("pointerup", lacher);
      window.removeEventListener("pointercancel", lacher);
      window.removeEventListener("lostpointercapture", perdu);
      drag.current = null;
    };
    const finir = () => {
      const d = drag.current;
      if (!d) return;
      nettoyer();
      if (d.active) {
        setDragId(null);
        const at = latest.current.indexOf(d.id);
        rapport.current.onAnnounce(rapport.current.textes.deplacee(at + 1));
      }
    };
    const soulever = () => {
      const d = drag.current;
      if (!d || d.active) return;
      d.active = true;
      setDragId(d.id);
      capturer(d);
      window.addEventListener("touchmove", blockScroll, { passive: false });
      navigator.vibrate?.(10);
    };
    function deplacer(e: PointerEvent) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
        if (!d.doigt) {
          if (moved > 6) soulever();
        } else if (moved > 10) nettoyer();
        return;
      }
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-thumb]");
      const target = hit?.dataset.thumb;
      if (target && target !== d.id) {
        const to = latest.current.indexOf(target);
        if (to >= 0) rapport.current.onMove(d.id, to);
      }
    }
    function lacher(e: PointerEvent) {
      if (drag.current && e.pointerId === drag.current.pointerId) finir();
    }
    /* La case déplacée a perdu le pointeur : on le lui rend s’il est encore appuyé, sinon le glisser est fini */
    function perdu(e: PointerEvent) {
      const d = drag.current;
      if (!d?.active || e.pointerId !== d.pointerId) return;
      if (!d.el.isConnected || !capturer(d)) finir();
    }
    const commencer = (d: Glisser) => {
      nettoyer();
      drag.current = d;
      window.addEventListener("pointermove", deplacer);
      window.addEventListener("pointerup", lacher);
      window.addEventListener("pointercancel", lacher);
      window.addEventListener("lostpointercapture", perdu);
      /* Au doigt, un appui maintenu lance le glisser (un simple balayage fait défiler la page) */
      if (d.doigt) d.timer = window.setTimeout(soulever, 230);
    };
    return { commencer, nettoyer };
  }, []);

  /* L’écran parti en plein glisser : ni écouteur ni minuteur ne lui survivent */
  useEffect(() => glisser.nettoyer, [glisser]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (fige || (e.pointerType === "mouse" && e.button !== 0)) return;
    glisser.commencer({ id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, timer: 0, el: e.currentTarget, doigt: e.pointerType !== "mouse" });
  };

  /*
   * Retire la case `id` (à la position `i`) ; au clavier comme à la croix, le focus ne retombe pas sur la page : il va à
   * la case qui prend sa place, ou à la précédente si c’était la dernière. Quand il n’en reste aucune, il va à la case
   * d’ajout, ou à la grille, si elles restent là ; un écran qui démonte la grille vide (CapturesScreen) donne lui-même
   * le focus à ce qui la remplace.
   */
  const retirer = (id: string, i: number) => {
    const reste = ids.filter((x) => x !== id);
    const voisine = reste[Math.min(i, reste.length - 1)];
    onRemove(id);
    requestAnimationFrame(() => {
      const poigneeVoisine = voisine ? nodes.current.get(voisine)?.querySelector<HTMLButtonElement>("button[data-handle]") : null;
      (poigneeVoisine ?? grille.current?.querySelector<HTMLButtonElement>("button[data-ajout]") ?? grille.current)?.focus();
    });
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
      retirer(id, i);
    }
  };

  /** La case `id` : son nœud, suivi pour le glissement des cases. */
  const caseDe = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
  /** La poignée de la case `id`, à la position `i` : l’appui qui commence le glisser (la suite s’écoute sur la fenêtre), et le clavier. */
  const poignee = (id: string, i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, id),
    onKeyDown: (e: KeyboardEvent) => onKey(e, id, i),
  });

  return { dragId, caseDe, poignee, retirer, grille };
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
  const { dragId, caseDe, poignee, retirer, grille } = useReordonnable(ids, { onMove, onRemove, onAnnounce, fige, textes });
  const aideId = useId();
  const avecAide = aide != null && items.length > 1;

  return (
    <>
      {/* tabIndex -1 : le focus y revient quand la dernière case est retirée au clavier (retirer), sans être une étape de la tabulation */}
      <ol ref={grille} tabIndex={-1} className="relative m-0 grid list-none grid-cols-3 gap-2 rounded-2xl p-0" aria-label={textes.liste}>
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
                onClick={() => retirer(s.id, i)}
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
            <button type="button" data-ajout="" onClick={ajout.onAdd} aria-label={textes.ajouter} className="lift block w-full rounded-2xl">
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
