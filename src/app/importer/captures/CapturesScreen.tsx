"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { useFilePicker } from "@/lib/hooks";
import { uploadScreenshots } from "@/services/api";
import { BACKEND } from "@/services/mode";
import { ErreurApi } from "@/services/reel";
import { Button } from "@/components/ui/Button";
import { FileInput, TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { setJourney, useJourney } from "@/state/journey";
import type { AppKind } from "@/types";


type Shot = { id: string; file: File; url: string | null };

/* Écran 03 — Captures : sélection, puis l’ordre se règle en glissant (BLUSH retrie aussi par date). Ou un enregistrement d’écran. */
export function CapturesScreen({ app, addMode }: { app: AppKind | null; addMode: boolean }) {
  const router = useRouter();
  const [journey] = useJourney();
  const shots = useFilePicker();
  const rec = useFilePicker();
  const [items, setItems] = useState<Shot[]>([]);
  const [result, setResult] = useState<{ count: number; messages: number; video: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const captureApp = app ?? journey.app ?? "instagram";
  const all = useRef<Shot[]>([]);
  useEffect(() => {
    all.current = items;
  }, [items]);

  /* Les aperçus sont créés une fois par fichier (déplacer une capture ne les recharge pas) */
  useEffect(() => () => all.current.forEach((s) => s.url && URL.revokeObjectURL(s.url)), []);

  /* Back-end : une erreur de lecture (rien de lisible, conv trop courte) ouvre l’écran d’erreur prévu (?erreur=) */
  const echec = (code: string) => router.replace(`/importer/captures?app=${captureApp}${addMode ? "&mode=ajout" : ""}&erreur=${code}`, { scroll: false });

  const handle = async (picked: File[], video: boolean) => {
    const added: Shot[] = picked.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }));
    if (video) items.forEach((s) => s.url && URL.revokeObjectURL(s.url));
    const next = video ? added : [...items, ...added];
    /* Back-end v1 : pas encore d’enregistrement d’écran ; et la lecture ne part qu’une fois, au clic sur Continuer */
    if (BACKEND && video) return echec("capture");
    setItems(next);
    if (BACKEND) {
      setResult({ count: next.length, messages: -1, video: false });
      return;
    }
    setBusy(true);
    const r = await uploadScreenshots(
      next.map((s) => s.file),
      { app: captureApp, mode: addMode ? "add" : "first" },
    );
    setBusy(false);
    setResult({ count: next.length, messages: r.messagesRead, video });
    setJourney({ captureNames: next.map((s) => s.file.name), captureApp, ...(addMode ? { capturesAdded: true } : { app: captureApp }) });
  };

  const remove = (id: string) => {
    const gone = items.find((s) => s.id === id);
    if (gone?.url) URL.revokeObjectURL(gone.url);
    const next = items.filter((s) => s.id !== id);
    setItems(next);
    setAnnounce("Capture retirée.");
    if (!next.length) setResult(null);
    else setResult((r) => (r ? { ...r, count: next.length } : r));
  };

  /** Déplace une capture à une autre place ; l’ordre est gardé pour la suite du parcours. */
  const move = (id: string, to: number) => {
    setItems((list) => {
      const from = list.findIndex((s) => s.id === id);
      if (from < 0 || to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      setJourney({ captureNames: next.map((s) => s.file.name) });
      return next;
    });
  };

  /* Back-end : BLUSH lit toutes les captures d’un coup (de 10 à 40 secondes), puis on passe à la suite */
  const continuer = async () => {
    if (!BACKEND) return router.push(next);
    setBusy(true);
    try {
      const r = await uploadScreenshots(
        items.map((s) => s.file),
        { app: captureApp, mode: addMode ? "add" : "first" },
      );
      setJourney({ captureNames: items.map((s) => s.file.name), captureApp, ...(addMode ? { capturesAdded: true } : { app: captureApp }), me: "p0" });
      setResult({ count: items.length, messages: r.messagesRead, video: false });
      router.push(next);
    } catch (e) {
      setBusy(false);
      echec(e instanceof ErreurApi && ["courte", "groupe"].includes(e.code) ? e.code : "capture");
    }
  };

  const back = addMode ? "/importer/ok" : "/commencer";
  const next = addMode ? "/importer/histoire" : "/qui";

  return (
    <Screen
      mobileTop={<MobileTopBar back={back} progress={1} />}
      desktopBack={{ target: back }}
      aside={<FlowSteps step={1} />}
      head={
        <>
          <ScreenTitle>Choisis tes captures.</ScreenTitle>
          <Lead size={14}>Instagram et Hinge ne permettent pas d’exporter : les captures suffisent. On reconnaît les messages, les dates et qui parle.</Lead>
        </>
      }
      footer={
        items.length ? (
          <Button arrow onClick={() => void continuer()} disabled={busy} aria-busy={busy}>
            {busy && BACKEND ? <TypingDots color="#FFFFFF" label="BLUSH lit tes captures" /> : "Continuer"}
          </Button>
        ) : (
          /* ⚠ Libellé avant sélection absent des maquettes */
          <Button onClick={shots.open}>Choisir mes captures</Button>
        )
      }
    >
      {items.length === 0 ? (
        <Dropzone onPick={shots.open} onFiles={(f) => handle(f, false)} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <ReorderGrid items={items} onMove={move} onRemove={remove} onAnnounce={setAnnounce} onAdd={result?.video ? undefined : shots.open} />
          {items.length > 1 && !result?.video && (
            <p id="ordre-aide" className="m-0 text-[13px] font-extrabold leading-[1.45] text-grey">
              Maintiens une capture et glisse-la pour changer l’ordre. BLUSH les remettra aussi dans l’ordre des dates.
            </p>
          )}
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </div>
      )}

      {/* L’autre façon d’ajouter la conv, en ligne discrète comme sur l’écran suivant */}
      <InsetGroup>
        <InsetRow
          leading={
            <RowIcon tone="elle">
              <span className="size-3.5 rounded-[7px] bg-elle" />
            </RowIcon>
          }
          title="Plus rapide : enregistre ton écran"
          sub="Remonte la conv en scrollant, on analyse tout."
          onClick={rec.open}
          chevron
        />
      </InsetGroup>

      <div aria-live="polite" className="min-h-6">
        {busy && <TypingDots label="Analyse des captures" />}
        {!busy && result && (
          <div data-rise="" className="flex items-center gap-2 text-[14px] font-black">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" }}>
              <Icon name="check" size={13} color="#FFFFFF" stroke={3.4} />
            </span>
            {result.video ? "1 enregistrement" : `${result.count} capture${result.count > 1 ? "s" : ""}`}
            {result.messages >= 0 ? ` · ${result.messages} messages analysés` : " prêtes"}
          </div>
        )}
      </div>

      <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={(f) => handle(f, false)} label="Captures d’écran de la conversation" />
      <FileInput inputRef={rec.ref} accept="video/*" onFiles={(f) => handle(f, true)} label="Enregistrement d’écran de la conversation" />
    </Screen>
  );
}

/* Pendant un glisser au doigt, la page ne doit pas défiler */
function blockScroll(e: TouchEvent) {
  e.preventDefault();
}

/**
 * La grille des captures, à réordonner : on maintient une capture puis on la glisse (doigt ou souris),
 * ou on la déplace au clavier avec les flèches. Les autres captures se décalent en douceur.
 */
function ReorderGrid({
  items,
  onMove,
  onRemove,
  onAnnounce,
  onAdd,
}: {
  items: Shot[];
  onMove: (id: string, to: number) => void;
  onRemove: (id: string) => void;
  onAnnounce: (t: string) => void;
  onAdd?: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean; timer: number; el: HTMLElement } | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const spots = useRef(new Map<string, { x: number; y: number }>());
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);
  const order = items.map((s) => s.id).join("|");

  /* Les captures qui changent de place glissent de l’ancienne à la nouvelle (positions dans la grille, pas dans l’écran) */
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
      const at = latest.current.findIndex((s) => s.id === d.id);
      onAnnounce(`Capture déplacée en position ${at + 1}.`);
    }
    drag.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
      const to = latest.current.findIndex((s) => s.id === target);
      if (to >= 0) onMove(d.id, to);
    }
  };

  const onKey = (e: React.KeyboardEvent, id: string, i: number) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (step) {
      e.preventDefault();
      const to = Math.min(items.length - 1, Math.max(0, i + step));
      if (to === i) return;
      onMove(id, to);
      onAnnounce(`Capture déplacée en position ${to + 1}.`);
      requestAnimationFrame(() => nodes.current.get(id)?.querySelector<HTMLButtonElement>("button[data-handle]")?.focus());
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(id);
    }
  };

  return (
    <ol className="relative m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label="Tes captures, dans l’ordre">
      {items.map((s, i) => {
        const lifted = dragId === s.id;
        return (
          <li
            key={s.id}
            data-thumb={s.id}
            ref={(el) => {
              if (el) nodes.current.set(s.id, el);
              else nodes.current.delete(s.id);
            }}
            className={cn("relative", lifted && "z-10")}
          >
            <button
              type="button"
              data-handle=""
              aria-label={`Capture ${i + 1} sur ${items.length}`}
              aria-describedby={items.length > 1 ? "ordre-aide" : undefined}
              onPointerDown={(e) => onPointerDown(e, s.id)}
              onPointerMove={onPointerMove}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => onKey(e, s.id, i)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                "block w-full select-none rounded-2xl transition-[transform,box-shadow] duration-200 [-webkit-touch-callout:none]",
                lifted ? "-rotate-2 scale-[1.06] cursor-grabbing shadow-[0_18px_36px_-12px_rgba(17,17,20,0.45)]" : "cursor-grab",
              )}
              style={lifted ? { touchAction: "none" } : undefined}
            >
              <Thumb selected number={i + 1} image={s.url}>
                {!s.url && (
                  <>
                    <Bar side="l" width={70} />
                    <Bar side="r" width={45} />
                  </>
                )}
              </Thumb>
            </button>
            {/* Retirer : une petite croix, comme sur les photos d’un message */}
            <button
              type="button"
              aria-label={`Retirer la capture ${i + 1}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemove(s.id)}
              className={cn("absolute left-1.5 top-1.5 z-[1] flex size-7 items-center justify-center rounded-full bg-[rgba(17,17,20,0.72)] transition-opacity", lifted && "opacity-0")}
            >
              <Icon name="close" size={12} color="#FFFFFF" stroke={3} />
            </button>
          </li>
        );
      })}
      {onAdd && (
        <li>
          <button type="button" onClick={onAdd} aria-label="Ajouter des captures" className="lift block w-full rounded-2xl">
            <Thumb>
              <span className="absolute inset-0 flex items-center justify-center">
                <Icon name="plus" size={26} color="#8A8780" stroke={2.6} />
              </span>
            </Thumb>
          </button>
        </li>
      )}
    </ol>
  );
}

function Thumb({ children, selected, number, dark, image }: { children?: React.ReactNode; selected?: boolean; number?: number; dark?: boolean; image?: string | null }) {
  return (
    <div
      className={cn(
        "relative flex h-[108px] flex-col justify-end gap-[5px] overflow-hidden rounded-2xl px-2 pb-2 pt-[18px]",
        dark ? "bg-[#111114]" : "bg-white",
        selected ? "shadow-selected" : "shadow-thin",
      )}
      style={image ? ({ backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center top" } as CSSProperties) : undefined}
    >
      {number !== undefined && (
        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-xl bg-ink text-[12px] font-black text-white">{number}</span>
      )}
      {children}
    </div>
  );
}

function Bar({ side, width, dark }: { side: "l" | "r"; width: number; dark?: boolean }) {
  return <span className={cn("h-[11px] rounded-md", side === "l" ? "self-start" : "self-end", side === "r" ? "bg-toi" : dark ? "bg-[#2A2A30]" : "bg-skeleton")} style={{ width: `${width}%` }} />;
}

/** Zone d’ajout (avant sélection) : un vrai appel à déposer, pas de fausses captures. Accepte aussi le glisser-déposer. */
function Dropzone({ onPick, onFiles }: { onPick: () => void; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (images.length) onFiles(images);
      }}
      className={cn(
        "lift group flex flex-col items-center justify-center gap-5 rounded-card bg-white px-6 pb-7 pt-9 text-center text-ink",
        over ? "shadow-selected" : "shadow-soft",
      )}
    >
      <ScreensArt />
      <span className="flex flex-col gap-1">
        <span className="text-[17px] font-black">Ajoute tes captures</span>
        <span className="text-[13px] font-extrabold text-grey">Dans l’ordre, de la plus ancienne à la plus récente</span>
      </span>
    </button>
  );
}

/** Trois écrans de conv en éventail ; ils s’écartent au survol. */
function ScreensArt() {
  const shots = [
    { x: -38, y: 10, r: -11, rows: [["l", 64], ["r", 46], ["l", 74], ["r", 38]] },
    { x: 38, y: 10, r: 11, rows: [["r", 52], ["l", 70], ["r", 40], ["l", 56]] },
    { x: 0, y: 0, r: 0, rows: [["l", 60], ["r", 48], ["l", 72], ["r", 36], ["l", 50]] },
  ] as const;
  return (
    <span aria-hidden="true" className="relative block h-[108px] w-[170px]">
      {shots.map((s, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-0 -ml-[29px] flex h-[100px] w-[58px] flex-col gap-1 rounded-[12px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(17,17,20,0.07),0_10px_22px_-10px_rgba(17,17,20,0.35)] transition-transform duration-500 ease-out [transform:translate(var(--x),var(--y))_rotate(var(--r))] group-hover:[transform:translate(calc(var(--x)*1.25),calc(var(--y)-2px))_rotate(calc(var(--r)*1.4))]"
          style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--r": `${s.r}deg` } as CSSProperties}
        >
          <span className="mx-auto mb-1 h-[3px] w-4 rounded-full bg-skeleton" />
          {s.rows.map(([side, w], k) => (
            <span key={k} className={cn("h-[7px] rounded-full", side === "l" ? "self-start bg-bubble-her" : "self-end bg-toi")} style={{ width: `${w}%` }} />
          ))}
          {i === 2 && (
            <span className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink shadow-[0_4px_10px_-4px_rgba(17,17,20,0.5)]">
              <Icon name="plus" size={14} color="#FFFFFF" stroke={3} />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
