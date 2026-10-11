"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { flipFrom, prefersReducedMotion, snapshotTops, spring } from "@/lib/motion";
import { Bell3D, BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import type { Testimonial } from "@/types";

/*
 * Les îlots de la landing : les seules parties qui tournent dans le navigateur (l’apparition au défilement, les questions
 * de BLUSH+, la grosse main, les avis qui glissent). Le reste de la page est rendu sur le serveur (parts.tsx), et les
 * convs qui défilent ont leur îlot à elles (ConvsExemples.tsx).
 */

/*
 * Le logo, en îlot : rendu par le serveur, chaque bulle partait en entier dans la charge de la page (ses dégradés, ses
 * filtres, ses perles), alors que son code est déjà dans le navigateur (les convs qui défilent l’importent, et avec
 * elles tout objects3d). En îlot, la page n’en envoie que les props, sans un octet de JS en plus.
 */
export function LogoBulle(props: ComponentProps<typeof BubbleLogo>) {
  return <BubbleLogo {...props} />;
}

/** La cloche d’un nouveau message (BLUSH+), en îlot pour la même raison : son code part déjà avec le logo. */
export function Cloche(props: ComponentProps<typeof Bell3D>) {
  return <Bell3D {...props} />;
}

/** Les blocs apparaissent en douceur au défilement (rien ne bouge si l’appareil demande moins d’animations). `cle` : la relance. */
export function Apparitions({ cle }: { cle: number }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])"));
    const vh = window.innerHeight;
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < vh * 0.92) el.dataset.shown = "";
    });
    document.documentElement.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "";
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.filter((el) => !("shown" in el.dataset)).forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("reveal-ready");
    };
  }, [cle]);
  return null;
}

/** Une question à BLUSH, et sa réponse rendue sur le serveur. */
export type Demande = { q: string; reponse: ReactNode };

/** Ce qu’on demande à BLUSH, en très grand ; la réponse s’ouvre sous la question. */
export function Demandes({ demandes }: { demandes: Demande[] }) {
  const [open, setOpen] = useState(0);
  const [touched, setTouched] = useState(false);
  /* Les ids des questions et de leurs réponses, propres à cette liste (le FLIP les prend aussi pour clés) */
  const base = useId();
  /*
   * Une autre question s’ouvre d’un coup (animer la hauteur refaisait la mise en page de toute la suite à chaque image) :
   * les questions glissent de leur ancienne place à la nouvelle (FLIP, en transform), puis la réponse apparaît.
   * La liste garde la place de la plus longue réponse : le bloc noir ne change pas de hauteur, rien ne saute dessous.
   */
  const liste = useRef<HTMLUListElement>(null);
  const avant = useRef<Map<string, number> | null>(null);
  const [reserve, setReserve] = useState<number>();
  const questions = () => liste.current?.querySelectorAll<HTMLElement>("[data-demande]") ?? [];
  const cle = (el: HTMLElement) => el.id;
  useLayoutEffect(() => {
    const b = avant.current;
    avant.current = null;
    if (b && !prefersReducedMotion()) flipFrom(b, questions(), cle, spring("soft"));
  }, [open]);
  useEffect(() => {
    const ul = liste.current;
    if (!ul) return;
    const somme = (sel: string, f: (h: number[]) => number) => f([...ul.querySelectorAll<HTMLElement>(sel)].map((el) => el.offsetHeight));
    /* Les questions, plus la plus longue réponse (fermée, son contenu garde sa hauteur sous le masque) */
    const ro = new ResizeObserver(() => setReserve(somme("[data-demande]", (h) => h.reduce((a, b) => a + b, 0)) + somme("[data-reponse]", (h) => Math.max(0, ...h))));
    ul.querySelectorAll("[data-demande], [data-reponse]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);
  return (
    <ul ref={liste} data-reveal="" className="m-0 mt-8 flex list-none flex-col p-0 lg:mt-12" style={reserve ? { minHeight: reserve } : undefined}>
      {demandes.map((a, i) => {
        const on = i === open;
        return (
          <li key={a.q} className="relative">
            {/* Écran tactile (pas de curseur) : la main montre qu’on peut toucher une autre question, jusqu’au premier geste */}
            {i === 1 && !touched && (
              <span aria-hidden="true" className="pointer-events-none absolute right-[3%] top-[40%] z-10 hidden w-[74px] [@media(hover:none)]:block">
                <span data-tap="" className="block origin-[42%_10%] -rotate-12">
                  <HandIcon />
                </span>
              </span>
            )}
            <button
              type="button"
              id={`${base}-${i}-q`}
              data-demande=""
              aria-expanded={on}
              aria-controls={`${base}-${i}`}
              onClick={() => {
                if (i !== open) avant.current = snapshotTops(questions(), cle);
                setOpen(i);
                setTouched(true);
              }}
              className={cn(
                "mx-auto block max-w-full py-1.5 text-center text-[32px] font-black leading-[1.08] tracking-[-0.04em] transition-colors duration-300 [text-wrap:balance] lg:py-2 lg:text-[60px]",
                on ? "text-white" : "text-white/45 hover:text-white/80",
              )}
            >
              {a.q}
            </button>
            {/* La réponse s’ouvre d’un coup et apparaît en fondu, une fois les questions presque posées ; fermée, elle sort du clavier et des lecteurs d’écran */}
            <div id={`${base}-${i}`} role="region" aria-labelledby={`${base}-${i}-q`} className={cn("grid", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div inert={!on || undefined} className="min-h-0 overflow-hidden">
                <div data-reponse="" className={cn("mx-auto max-w-[500px] pb-7 pt-3 transition-[opacity,transform] duration-300 ease-out", on ? "translate-y-0 opacity-100 delay-150" : "-translate-y-2 opacity-0")}>
                  <div className="flex flex-col gap-2 rounded-[26px] bg-white p-3.5 text-left text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)] lg:p-4">{a.reponse}</div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** La grosse main, comme un curseur géant : blanche, cernée d’encre, l’index levé. */
function HandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("block h-auto w-full overflow-visible drop-shadow-[0_10px_14px_rgba(0,0,0,0.4)]", className)}>
      <path
        d="M22 11 A5 5 0 0 1 32 11 V28.5 A4.5 4.5 0 0 1 41 28.5 V31.5 A4.5 4.5 0 0 1 50 31.5 V35 A4 4 0 0 1 58 35 V44 C58 52 52 58 44 58 H32 C27 58 24 56 21 52 L11 41 A4 4 0 0 1 16.5 35.5 L22 40 Z"
        className="fill-white stroke-ink"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M32 32 V40.5 M41 35 V42.5 M50 38.5 V44.5" fill="none" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/*
 * À la souris, la main remplace le curseur dans le bloc noir : elle suit en douceur et s’enfonce au clic.
 * Le vrai curseur n’est masqué qu’une fois la main prête (data-hand), jamais sur écran tactile ni au clavier.
 */
export function BigHand() {
  const hand = useRef<HTMLDivElement>(null);
  useEffect(() => {
    /* La zone : le bloc noir qui contient la main */
    const h = hand.current;
    const z = h?.parentElement;
    if (!z || !h || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    z.dataset.hand = "on";
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let inside = false;
    let raf = 0;
    const place = () => {
      h.style.translate = `${cx}px ${cy}px`;
    };
    const aim = () => {
      const r = z.getBoundingClientRect();
      tx = px - r.left;
      ty = py - r.top;
    };
    const step = () => {
      cx += (tx - cx) * 0.35;
      cy += (ty - cy) * 0.35;
      if (Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3) {
        cx = tx;
        cy = ty;
        raf = 0;
      } else raf = requestAnimationFrame(step);
      place();
    };
    const follow = () => {
      if (reduce) {
        cx = tx;
        cy = ty;
        place();
      } else if (!raf) raf = requestAnimationFrame(step);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      aim();
      if (!inside) {
        inside = true;
        cx = tx;
        cy = ty;
        place();
        h.dataset.on = "";
      }
      follow();
    };
    const leave = () => {
      inside = false;
      delete h.dataset.on;
      delete h.dataset.press;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") h.dataset.press = "";
    };
    const up = () => delete h.dataset.press;
    const scroll = () => {
      if (!inside) return;
      aim();
      follow();
    };
    z.addEventListener("pointermove", move);
    z.addEventListener("pointerleave", leave);
    z.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      z.removeEventListener("pointermove", move);
      z.removeEventListener("pointerleave", leave);
      z.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(raf);
      delete z.dataset.hand;
    };
  }, []);
  return (
    /* La pointe de l’index (27, 6 sur 64) tombe sur le pointeur */
    <div ref={hand} aria-hidden="true" className="big-hand pointer-events-none absolute left-0 top-0 z-30 -ml-[47px] -mt-[10px] w-[112px]">
      <div>
        <HandIcon />
      </div>
    </div>
  );
}

/** Les avis, qui glissent au doigt, aux flèches du clavier ou par leurs deux boutons. */
export function AvisDefilants({ items }: { items: Testimonial[] }) {
  const track = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 440), behavior: "smooth" });
  };
  return (
    <>
      {/* Zone qui défile : atteignable au clavier (les flèches du clavier la font glisser) */}
      <ul
        ref={track}
        tabIndex={0}
        aria-label="Les avis"
        className="m-0 mt-10 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto px-[max(22px,calc((100vw_-_1056px)/2))] py-3 [scrollbar-width:none] lg:mt-14 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((t, i) => (
          <li key={i} className="flex w-[84vw] max-w-[420px] shrink-0 snap-center flex-col gap-5 rounded-[28px] bg-white p-6 shadow-card lg:p-8">
            <div className="flex items-center gap-3.5">
              <Avatar tone="elle" size={56}>
                {t.name.charAt(0)}
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-carte font-black">{t.name}</span>
                <span className="text-note font-extrabold text-grey">{t.label}</span>
              </div>
            </div>
            <p className="m-0 text-accent font-extrabold leading-[1.6] text-ink">{t.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-center gap-3">
        <IconButton icon="back" label="Avis précédents" onClick={() => move(-1)} iconSize={20} />
        <IconButton icon="chevron" label="Avis suivants" onClick={() => move(1)} iconSize={20} />
      </div>
    </>
  );
}
