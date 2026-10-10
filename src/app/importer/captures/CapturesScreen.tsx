"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { useFilePicker } from "@/lib/hooks";
import { connexionPuis } from "@/lib/suite";
import { ErreurApi, prechargerVideo, uploadRecording, uploadScreenshots, type AvanceVideo } from "@/services/api";
import { prereduire, vignette } from "@/services/preparer-captures";
import { Button } from "@/components/ui/Button";
import { FileInput, TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { setJourney, useJourney } from "@/state/journey";
import type { AppKind } from "@/types";


type Shot = { id: string; file: File; url: string | null };

/* Au plus 20 captures dans un envoi (le serveur n’en lit pas plus : src/server/captures.ts) */
const CAPTURES_MAX = 20;

/* Les applis lues par captures côté serveur (les autres passent par « autre ») */
const APPLIS_CAPTURES: AppKind[] = ["instagram", "hinge", "imessage"];

/** Où en est un enregistrement, dit simplement : la vidéo regardée dans le téléphone, puis lue par BLUSH. */
const texteAvance = (a: AvanceVideo) =>
  a.etape === "reprise"
    ? "La connexion a coupé, je reprends…"
    : a.etape === "video"
      ? `Je regarde ton enregistrement · ${Math.round(a.p * 100)}\u00a0%`
      : a.total > 1
        ? `BLUSH lit ta conv · ${a.faits} sur ${a.total}`
        : "BLUSH lit ta conv";

/** Pendant la lecture des captures (sans avancée à dire) : ce que BLUSH fait, en clair dans le bouton. */
const texteLecture = (n: number) => (n > 1 ? `BLUSH lit tes ${n} captures…` : "BLUSH lit ta capture…");

/*
 * Écran 03 — Captures : sélection, puis l’ordre se règle en glissant (BLUSH retrie aussi par date). Ou un enregistrement
 * d’écran : le téléphone en tire les écrans de la conv (la vidéo ne part pas), puis BLUSH les lit. Pour iMessage (pas
 * d’export possible), l’enregistrement est le chemin principal.
 * `addMode` (?mode=ajout, des captures ajoutées à un export, puis /importer/histoire) est en sommeil : aucun écran n’y
 * mène plus, sauf /importer/histoire, qu’on n’atteint que par lui, et le serveur refuse ces captures (api/captures).
 * Il reste pour la fusion d’un export et de captures, décidée pour plus tard.
 */
export function CapturesScreen({ app, addMode }: { app: AppKind | null; addMode: boolean }) {
  const router = useRouter();
  const [journey] = useJourney();
  const shots = useFilePicker();
  const rec = useFilePicker();
  const [items, setItems] = useState<Shot[]>([]);
  const [result, setResult] = useState<{ count: number; messages: number; video: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [avance, setAvance] = useState<AvanceVideo | null>(null);
  const [announce, setAnnounce] = useState("");
  /* Plus de 20 captures choisies : on garde les 20 premières, et on le dit */
  const [trop, setTrop] = useState(false);
  /* Une limite atteinte (« trop »), ou le réseau qui a lâché deux fois : les captures restent là, le message le dit */
  const [souci, setSouci] = useState<"trop" | "reseau" | null>(null);
  /* L’écran est-il toujours là ? Après une lecture de 10 à 40 s, on n’envoie pas vers la suite quelqu’un qui est parti */
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  const captureApp = app ?? journey.app ?? "instagram";
  const enregistrement = captureApp === "imessage";
  const all = useRef<Shot[]>([]);
  useEffect(() => {
    all.current = items;
  }, [items]);

  /* Les aperçus sont créés une fois par fichier (déplacer une capture ne les recharge pas) */
  useEffect(() => () => all.current.forEach((s) => s.url && URL.revokeObjectURL(s.url)), []);

  /*
   * L’aperçu d’une capture : une vignette (le Worker la tire du fichier), pas l’originale, qui pèse une douzaine de Mo
   * une fois décodée (vingt captures font grimper la mémoire jusqu’au rechargement de Safari). Sans Worker, l’originale.
   */
  const apercus = (shots: Shot[]) =>
    shots.forEach((s) =>
      void vignette(s.file).then((b) => {
        /* Retirée entre-temps, ou l’écran est parti : l’aperçu ne sert plus */
        if (!monte.current || !all.current.some((x) => x.id === s.id)) return;
        const url = URL.createObjectURL(b ?? s.file);
        setItems((list) => list.map((x) => (x.id === s.id ? { ...x, url } : x)));
      }),
    );

  /* Une erreur de lecture (rien de lisible, conv trop courte) ouvre l’écran d’erreur prévu (?erreur=, ErreurDeParcours) */
  const echec = (code: string) => router.replace(`/importer/captures?app=${captureApp}${addMode ? "&mode=ajout" : ""}&erreur=${code}`, { scroll: false });

  const handle = (picked: File[], video: boolean) => {
    /* Un enregistrement garde son fichier en aperçu (la balise vidéo le lit) ; une capture attend sa vignette */
    const added: Shot[] = picked.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, url: video ? URL.createObjectURL(file) : null }));
    /* Un enregistrement remplace tout ; des captures après un enregistrement le remplacent aussi */
    const replace = video || !!result?.video;
    if (replace) items.forEach((s) => s.url && URL.revokeObjectURL(s.url));
    const toutes = replace ? added : [...items, ...added];
    const next = video ? toutes : toutes.slice(0, CAPTURES_MAX);
    toutes.slice(next.length).forEach((s) => s.url && URL.revokeObjectURL(s.url));
    setTrop(!video && toutes.length > CAPTURES_MAX);
    setSouci(null);
    /* L’enregistrement sert à la première importation (pas encore pour compléter une conv) */
    if (video && addMode) return echec("capture");
    setItems(next);
    if (!video) {
      const gardees = added.filter((s) => next.includes(s));
      /* all.current suit items après le rendu : à jour dès maintenant pour les vignettes qui arrivent */
      all.current = next;
      apercus(gardees);
      /* Le Worker les réduit déjà pour l’envoi, pendant qu’on règle l’ordre */
      prereduire(gardees.map((s) => s.file));
    }
    /* La lecture ne part qu’une fois, au clic sur Continuer */
    setResult({ count: next.length, messages: -1, video });
  };

  const remove = (id: string) => {
    const gone = items.find((s) => s.id === id);
    if (gone?.url) URL.revokeObjectURL(gone.url);
    const next = items.filter((s) => s.id !== id);
    setItems(next);
    setAnnounce("Capture retirée.");
    setTrop(false);
    if (!next.length) setResult(null);
    else setResult((r) => (r ? { ...r, count: next.length } : r));
  };

  /** Déplace une capture à une autre place : BLUSH les lit dans cet ordre. */
  const move = (id: string, to: number) => {
    setItems((list) => {
      const from = list.findIndex((s) => s.id === id);
      if (from < 0 || to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };

  /* BLUSH lit toutes les captures d’un coup (de 10 à 40 secondes), puis on passe à la suite */
  const continuer = async () => {
    setBusy(true);
    setSouci(null);
    setAvance(null);
    const video = !!result?.video;
    try {
      const r = video
        ? await uploadRecording(items[0].file, APPLIS_CAPTURES.includes(captureApp) ? captureApp : "autre", setAvance)
        : await uploadScreenshots(
            items.map((s) => s.file),
            { app: captureApp, mode: addMode ? "add" : "first", onAvance: setAvance },
          );
      if (!monte.current) return;
      setJourney({ ...(addMode ? { capturesAdded: true } : { app: captureApp }), me: "p0" });
      setResult({ count: items.length, messages: r.messagesRead, video });
      router.push(next);
    } catch (e) {
      if (!monte.current) return;
      /* Bêta fermée : BLUSH ne lit des captures que pour un compte (la session a pu expirer sur cet écran). La connexion, puis retour ici */
      if (e instanceof ErreurApi && e.status === 401) return router.push(connexionPuis(`/importer/captures?app=${captureApp}${addMode ? "&mode=ajout" : ""}`));
      setBusy(false);
      setAvance(null);
      if (e instanceof ErreurApi && e.code === "trop") return setSouci("trop");
      /* Le réseau, encore après la reprise : les captures ne sont pas en cause, elles restent là */
      if (!(e instanceof ErreurApi)) return setSouci("reseau");
      echec(["courte", "groupe", "video", "longue"].includes(e.code) ? e.code : "capture");
    }
  };

  const back = addMode ? "/importer/ok" : "/commencer";
  const next = addMode ? "/importer/histoire" : "/qui";
  /* L’extraction d’un enregistrement est chargée à la demande : on la charge dès qu’on ouvre le choix de la vidéo */
  const choisirEnregistrement = () => {
    prechargerVideo();
    rec.open();
  };
  /* Pendant la lecture, ce qui se dit dans le bouton (et aux lecteurs d’écran) */
  const enCours = avance ? texteAvance(avance) : texteLecture(items.length);

  return (
    <Screen
      mobileTop={<MobileTopBar back={back} progress={1} />}
      desktopBack={{ target: back }}
      aside={<FlowSteps step={1} />}
      head={
        <>
          <ScreenTitle>{enregistrement ? "Filme ta conv." : "Choisis tes captures."}</ScreenTitle>
          <Lead size={14}>
            {enregistrement
              ? "iMessage ne permet pas d’exporter. Enregistre ton écran en remontant la conv\u00a0: BLUSH lit tout, message par message."
              : "Instagram et Hinge ne permettent pas d’exporter\u00a0: les captures suffisent. On reconnaît les messages, les dates et qui parle."}
          </Lead>
        </>
      }
      footer={
        items.length ? (
          <>
            <Button arrow={!busy} onClick={() => void continuer()} disabled={busy} aria-busy={busy}>
              {busy ? (
                <span className="flex min-w-0 items-center gap-2.5">
                  <TypingDots color="#FFFFFF" label={enCours} />
                  <span className="text-[16px] leading-[1.2] tabular-nums">{enCours}</span>
                </span>
              ) : (
                "Continuer"
              )}
            </Button>
            {/* Des captures : rien ne dit où en est la lecture, une barre avance d’après sa durée habituelle */}
            {busy && !result?.video && <BarreLecture captures={items.length} />}
          </>
        ) : enregistrement ? (
          <Button onClick={choisirEnregistrement}>Choisir mon enregistrement</Button>
        ) : (
          /* TODO(produit): libellé avant sélection absent des maquettes, à valider */
          <Button onClick={shots.open}>Choisir mes captures</Button>
        )
      }
    >
      {items.length === 0 ? (
        enregistrement ? (
          <CommentFilmer onPick={rec.open} />
        ) : (
          <Dropzone onPick={shots.open} onFiles={(f) => handle(f, false)} />
        )
      ) : result?.video ? (
        <CarteEnregistrement shot={items[0]} onChange={busy ? undefined : choisirEnregistrement} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Pendant la lecture, l’ordre et la sélection sont figés : ce qui part est déjà parti */}
          <ReorderGrid items={items} onMove={move} onRemove={remove} onAnnounce={setAnnounce} onAdd={result?.video || busy ? undefined : shots.open} fige={busy} />
          {trop && (
            <p role="status" className="m-0 text-[14px] font-extrabold leading-[1.45] text-ink">
              {CAPTURES_MAX} captures au plus{NBSP}: on a gardé les {CAPTURES_MAX} premières. Retires-en pour en ajouter d’autres.
            </p>
          )}
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
        {enregistrement ? (
          <InsetRow
            leading={<RowIcon icon="photo" tone="toi" />}
            title="Ou choisis des captures d’écran"
            sub="Pour une conv courte, quelques captures suffisent."
            onClick={busy ? undefined : shots.open}
            chevron={!busy}
            className={cn(busy && "opacity-50")}
          />
        ) : (
          <InsetRow
            leading={
              <RowIcon tone="elle">
                <span className="size-3.5 rounded-[7px] bg-elle" />
              </RowIcon>
            }
            title={"Plus rapide\u00a0: enregistre ton écran"}
            sub={"Remonte la conv doucement en filmant ton écran\u00a0: BLUSH lit tout."}
            onClick={busy ? undefined : choisirEnregistrement}
            chevron={!busy}
            className={cn(busy && "opacity-50")}
          />
        )}
      </InsetGroup>

      <div aria-live="polite" className="min-h-6">
        {/* L’avancée s’affiche dans le bouton ; ici, elle est seulement annoncée aux lecteurs d’écran */}
        {busy && <span className="sr-only">{enCours}</span>}
        {!busy && souci === "reseau" && (
          <p className="m-0 mb-2.5 text-[14px] font-extrabold leading-[1.45] text-ink">Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.</p>
        )}
        {!busy && souci === "trop" && (
          <p className="m-0 mb-2.5 text-[14px] font-extrabold leading-[1.45] text-ink">
            BLUSH a lu beaucoup de captures d’un coup{NBSP}: réessaie un peu plus tard. Tes captures restent là.
          </p>
        )}
        {!busy && result && !result.video && (
          <div data-rise="" className="flex items-center gap-2 text-[14px] font-black">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" }}>
              <Icon name="check" size={13} color="#FFFFFF" stroke={3.4} />
            </span>
            {result.video ? "1 enregistrement" : `${result.count} capture${result.count > 1 ? "s" : ""}`}
            {result.messages >= 0 ? ` · ${result.messages} messages analysés` : result.video ? " prêt" : result.count > 1 ? " prêtes" : " prête"}
          </div>
        )}
      </div>

      <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={(f) => handle(f, false)} label="Captures d’écran de la conversation" />
      <FileInput inputRef={rec.ref} accept="video/*" onFiles={(f) => handle(f, true)} label="Enregistrement d’écran de la conversation" />
    </Screen>
  );
}

/**
 * Pendant la lecture des captures : une barre qui avance d’après une durée prudente (13 s, plus 3 s par capture),
 * ralentit vers 90 % et n’arrive au bout qu’avec la réponse (l’écran suivant). En transform : le compositeur la fait
 * avancer, sans rien recalculer ni repeindre.
 */
function BarreLecture({ captures }: { captures: number }) {
  const barre = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const a = barre.current?.animate([{ transform: "scaleX(0.04)" }, { transform: "scaleX(0.9)" }], {
      duration: (13 + 3 * captures) * 1000,
      easing: "cubic-bezier(0.3, 0.55, 0.45, 1)",
      fill: "forwards",
    });
    return () => a?.cancel();
  }, [captures]);
  return (
    <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-[calc(100%_-_48px)] overflow-hidden rounded-full bg-[rgba(17,17,20,0.08)]">
      <span ref={barre} className="block h-full origin-left bg-ink" style={{ transform: "scaleX(0.04)" }} />
    </span>
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
  fige,
}: {
  items: Shot[];
  onMove: (id: string, to: number) => void;
  onRemove: (id: string) => void;
  onAnnounce: (t: string) => void;
  onAdd?: () => void;
  /** Pendant la lecture : ni glisser, ni déplacer, ni retirer */
  fige?: boolean;
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
      const to = latest.current.findIndex((s) => s.id === target);
      if (to >= 0) onMove(d.id, to);
    }
  };

  const onKey = (e: KeyboardEvent, id: string, i: number) => {
    if (fige) return;
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
              <Thumb selected number={i + 1} image={s.url} video={s.file.type.startsWith("video/")}>
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
              hidden={fige}
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

function Thumb({ children, selected, number, image, video }: { children?: ReactNode; selected?: boolean; number?: number; image?: string | null; video?: boolean }) {
  /* Un enregistrement : sa première image (l’ancre #t pour que Safari en affiche une), et le signe lecture */
  if (video && image)
    return (
      <div className={cn("relative h-[108px] overflow-hidden rounded-2xl bg-[#111114]", selected ? "shadow-selected" : "shadow-thin")}>
        <video src={`${image}#t=0.6`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover object-top" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-[rgba(17,17,20,0.6)]">
            <Icon name="play" size={15} color="#FFFFFF" fill="#FFFFFF" stroke={0} className="translate-x-px" />
          </span>
        </span>
      </div>
    );
  return (
    <div
      className={cn(
        "relative flex h-[108px] flex-col justify-end gap-[5px] overflow-hidden rounded-2xl bg-white px-2 pb-2 pt-[18px]",
        selected ? "shadow-selected" : "shadow-thin",
      )}
      style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center top" } : undefined}
    >
      {number !== undefined && (
        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-xl bg-ink text-[12px] font-black text-white">{number}</span>
      )}
      {children}
    </div>
  );
}

function Bar({ side, width }: { side: "l" | "r"; width: number }) {
  return <span className={cn("h-[11px] rounded-md", side === "l" ? "self-start" : "self-end", side === "r" ? "bg-toi" : "bg-skeleton")} style={{ width: `${width}%` }} />;
}

/** Le bouton d’enregistrement de l’écran du Centre de contrôle : un rond blanc cerclé, un point rouge. */
function BoutonRec() {
  return (
    <span aria-label="le bouton d’enregistrement" role="img" className="mx-0.5 inline-flex size-[1.15em] items-center justify-center rounded-full border-2 border-current align-[-0.2em]">
      <span className="size-[0.5em] rounded-full bg-[#FF3B30]" />
    </span>
  );
}

/** L’enregistrement choisi : son aperçu, sa durée, et de quoi en changer (pas pendant sa lecture : `onChange` absent). */
function CarteEnregistrement({ shot, onChange }: { shot: Shot; onChange?: () => void }) {
  const [duree, setDuree] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-4 rounded-card bg-white p-3.5 shadow-soft">
      <span className="relative h-[112px] w-[64px] shrink-0 overflow-hidden rounded-[14px] bg-[#111114]">
        {shot.url && (
          <video src={`${shot.url}#t=0.6`} muted playsInline preload="metadata" onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)} className="absolute inset-0 size-full object-cover object-top" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-7 items-center justify-center rounded-full bg-[rgba(17,17,20,0.6)]">
            <Icon name="play" size={12} color="#FFFFFF" fill="#FFFFFF" stroke={0} className="translate-x-px" />
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-black">Ton enregistrement</span>
        <span className="text-[13px] font-extrabold text-grey">
          {duree && Number.isFinite(duree) ? `${duree >= 60 ? `${Math.floor(duree / 60)}\u00a0min ` : ""}${Math.round(duree % 60)}\u00a0s · ` : ""}prêt
        </span>
      </span>
      <button type="button" onClick={onChange} disabled={!onChange} className="lift lift-sm h-9 shrink-0 rounded-full bg-plaque px-3.5 text-[13px] font-black text-ink disabled:opacity-50">
        Changer
      </button>
    </div>
  );
}

/** iMessage : comment filmer sa conv sur iPhone, en quatre gestes, puis la choisir. */
function CommentFilmer({ onPick }: { onPick: () => void }) {
  const etapes: ReactNode[] = [
    "Ouvre votre conv dans Messages",
    <>
      Ouvre le Centre de contrôle, et touche <BoutonRec /> (Enregistrement de l’écran)
    </>,
    "Reviens sur la conv, et remonte-la doucement jusqu’au début",
    "Arrête l’enregistrement, puis choisis-le ici",
  ];
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onPick} className="lift flex flex-col gap-4 rounded-card bg-white p-5 text-left text-ink shadow-soft">
        <span className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,90,96,0.12)]">
            <span className="size-4 rounded-full bg-[#FF5A60] shadow-[0_0_0_4px_rgba(255,90,96,0.22)]" />
          </span>
          <span className="flex flex-col">
            <span className="text-[17px] font-black">Enregistre ton écran</span>
            <span className="text-[13px] font-extrabold text-grey">Toute votre conv, en une minute</span>
          </span>
        </span>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {etapes.map((e, k) => (
            <li key={k} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-black text-white">{k + 1}</span>
              <span className="pt-0.5 text-[14px] font-extrabold leading-[1.4]">{e}</span>
            </li>
          ))}
        </ol>
      </button>
      <p className="m-0 flex items-start gap-2 px-1 text-[12.5px] font-extrabold leading-[1.45] text-grey">
        <Icon name="lock" size={15} color="#6B6862" stroke={2.2} style={{ marginTop: 1 }} />
        <span>
          La vidéo reste sur ton téléphone{NBSP}: seuls les écrans de la conv partent, lus une fois puis oubliés. Pas de bouton <BoutonRec />{NBSP}? Ajoute-le dans Réglages, Centre de contrôle.
        </span>
      </p>
    </div>
  );
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
          style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--r": `${s.r}deg` }}
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
