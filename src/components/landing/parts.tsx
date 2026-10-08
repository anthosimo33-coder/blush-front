"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TESTIMONIAL_SLOTS, TESTIMONIALS } from "@/mocks/landing";
import { QUESTION_ANSWER, REPORT } from "@/mocks/report";
import { Logo } from "@/components/brand/Logo";
import { Bell3D, BubbleLogo } from "@/components/brand/objects3d";
import { AppBadge, Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { ConfidenceLine, Tag } from "@/components/ui/messages";
import type { AppKind, Testimonial } from "@/types";

/* Les morceaux de la landing. */

export const CTA = "/commencer";

/**
 * Qui revient : connecté, avec une conv déjà lue (src/app/retour). La landing l’envoie alors vers son accueil plutôt
 * que vers le parcours. `autre` : le prénom de l’autre, une fois « Qui es-tu ? » rempli.
 */
export type Retour = { autre: string | null } | null;
const RetourContext = createContext<Retour>(null);

/** Le bouton principal de la landing, et la ligne dessous : analyser sa conv, ou la retrouver. */
export function useCta() {
  const retour = useContext(RetourContext);
  return retour
    ? { href: "/app", label: "Retrouver ma conv", note: retour.autre ? `Ta conv avec ${retour.autre} t’attend` : "Ta conv t’attend", header: "Ouvrir BLUSH" }
    : { href: CTA, label: "Analyser ma conv", note: "Aperçu gratuit · Sans mot de passe", header: "Commencer" };
}
export const APP_NAME: Record<AppKind, string> = { whatsapp: "WhatsApp", imessage: "iMessage", instagram: "Instagram", hinge: "Hinge", autre: "Captures" };

/** Les blocs apparaissent en douceur au défilement (rien ne bouge si l’appareil demande moins d’animations). */
export function useReveal(key: number) {
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
  }, [key]);
}

/** Les avis à montrer : les vrais, sinon (galerie, /?apercu=avis) des emplacements, sinon rien. */
export function useReviews() {
  const [slots, setSlots] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique de l’adresse
    if (new URLSearchParams(window.location.search).get("apercu") === "avis") setSlots(true);
  }, []);
  const items = TESTIMONIALS.length > 0 ? TESTIMONIALS : slots ? TESTIMONIAL_SLOTS : [];
  return { items, slots: TESTIMONIALS.length === 0 };
}

/* ———— Habillage ———— */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-[22px] lg:px-8", className)}>{children}</div>;
}

export function CtaButton({ className }: { className?: string }) {
  const cta = useCta();
  return (
    <Link
      href={cta.href}
      className={cn(
        "arrow-nudge lift lift-ink lift-sm inline-flex h-[60px] items-center justify-center gap-2.5 rounded-[30px] px-9 text-[18px] font-black text-white no-underline shadow-ink [background:var(--btn-ink-bg)]",
        className,
      )}
    >
      {cta.label}
      <Icon name="arrow" size={19} color="#FFFFFF" stroke={2.6} className="arrow" />
    </Link>
  );
}

export function SectionHead({ id, kicker, title, sub, align = "center" }: { id: string; kicker?: string; title: ReactNode; sub?: ReactNode; align?: "center" | "start" }) {
  /* Aligné à gauche = section à deux colonnes : le titre descend d’un cran pour tenir sur deux lignes */
  return (
    <div data-reveal="" className={cn("flex flex-col items-center gap-3 text-center", align === "start" && "lg:items-start lg:text-left")}>
      {kicker && <span className="text-[13px] font-black text-grey">{kicker}</span>}
      <h2 id={id} className={cn("m-0 max-w-[720px] text-[34px] font-black leading-[1.04] tracking-[-0.03em] [text-wrap:balance]", align === "start" ? "lg:text-[44px]" : "lg:text-[52px]")}>
        {title}
      </h2>
      {sub && <p className="m-0 max-w-[540px] text-[17px] font-extrabold leading-[1.5] text-soft [text-wrap:balance] lg:text-[19px]">{sub}</p>}
    </div>
  );
}

/** L’habillage d’une landing : la barre du haut, le contenu, le pied de page. `retour` : qui revient (voir useCta). */
export function LandingFrame({ retour = null, children }: { retour?: Retour; children: ReactNode }) {
  return (
    <RetourContext value={retour}>
      <Frame>{children}</Frame>
    </RetourContext>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const cta = useCta();
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-[rgba(17,17,20,0.05)] bg-[rgba(244,242,237,0.82)] backdrop-blur-xl">
        <Container className="flex h-16 items-center justify-between">
          <Logo size={30} fontSize={22} href="/" />
          {/* Le bouton noir reste celui de la page : ici, le blanc qui s’efface */}
          <Link href={cta.href} className="arrow-nudge lift lift-sm inline-flex h-10 items-center gap-1.5 rounded-full bg-white pl-4 pr-3.5 text-[14px] font-black text-ink no-underline shadow-soft">
            {cta.header}
            <Icon name="arrow" size={15} color="#121214" stroke={2.6} className="arrow" />
          </Link>
        </Container>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[rgba(17,17,20,0.06)] py-10">
        <Container className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={26} fontSize={19} href="/" />
            <span className="text-[13px] font-extrabold text-grey">© 2026</span>
          </div>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-extrabold">
            <Link href={cta.href} className="text-soft no-underline hover:text-ink">
              {cta.label}
            </Link>
            <Link href="/compte" className="text-soft no-underline hover:text-ink">
              Mon compte
            </Link>
            <Link href="/confidentialite" className="text-soft no-underline hover:text-ink">
              Confidentialité
            </Link>
          </nav>
        </Container>
      </footer>
    </div>
  );
}

/* ———— Ensuite, avec BLUSH+ : le message qui fait cogiter, et ce qu’on demande à BLUSH ———— */

/* Les messages qu’on relit dix fois : ils flottent autour du titre (grand écran) */
const OVERTHINK: { text: string; at: string; r: number; d: string }[] = [
  { text: "on verra", at: "left-[3%] top-[6%]", r: -4, d: "0s" },
  { text: "haha ok", at: "left-[8%] top-[60%]", r: 3, d: "1.2s" },
  { text: "t’es dispo quand ?", at: "right-[2%] top-[34%]", r: 3, d: "0.6s" },
  { text: "dsl j’avais pas vu", at: "right-[7%] top-[78%]", r: -3, d: "1.8s" },
];

/* Ce qu’on demande à BLUSH, en très grand ; la réponse s’ouvre sous la question */
const ASKS: { q: string; answer: () => ReactNode }[] = [
  {
    q: "ça veut dire quoi ?",
    answer: () => (
      <>
        <span className="max-w-[86%] self-end rounded-[20px] rounded-br-[6px] bg-toi-ink px-4 py-2.5 font-message text-[15px] font-bold text-white">je suis crevée cette semaine, on verra</span>
        <FromBlush>
          <span className="text-[12px] font-black text-grey">Ce que ça veut dire</span>
          <span className="text-[17px] font-black leading-[1.3]">Elle est partante, mais fatiguée.</span>
        </FromBlush>
      </>
    ),
  },
  {
    q: "je lui réponds quoi ?",
    answer: () => (
      <FromBlush>
        <span className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-black text-vrai-ink">Ta meilleure réponse</span>
          <Tag tone="recommandee" />
        </span>
        <span className="self-start rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-[15px] font-bold text-white">Courage pour jeudi. Samedi pour fêter ça&nbsp;?</span>
        <span className="inline-flex h-8 items-center gap-1.5 self-start rounded-full bg-white px-3 text-[12px] font-black shadow-soft">
          <Icon name="copy" size={13} color="#121214" stroke={2.6} />
          Copier
        </span>
      </FromBlush>
    ),
  },
  {
    q: "elle voit quelqu’un d’autre ?",
    answer: () => (
      <FromBlush>
        <span className="text-[17px] font-black leading-[1.3]">{QUESTION_ANSWER.title}</span>
        <span className="text-[14px] font-extrabold leading-[1.45] text-soft">{QUESTION_ANSWER.evidence}</span>
        <ConfidenceLine level={QUESTION_ANSWER.confidence} className="mt-1">
          {QUESTION_ANSWER.limits}
        </ConfidenceLine>
      </FromBlush>
    ),
  },
  {
    q: "on en est où ?",
    answer: () => (
      <FromBlush>
        <span className="text-[17px] font-black leading-[1.3]">
          {REPORT.verdict.emoji} {REPORT.verdict.short} · <span className="text-vrai-ink">{REPORT.trend}</span>
        </span>
        <span className="text-[14px] font-extrabold leading-[1.45] text-soft">{REPORT.nextStep}</span>
      </FromBlush>
    ),
  },
];

/** BLUSH+ en un bloc noir : le titre géant, les messages qui font cogiter, puis les questions qu’on lui pose. */
export function BlushPlus() {
  const [open, setOpen] = useState(0);
  const [touched, setTouched] = useState(false);
  return (
    <section aria-labelledby="quotidien-titre" className="py-10 lg:py-16">
      <Container>
        <div className="relative isolate overflow-hidden rounded-[36px] bg-ink px-5 pb-10 pt-14 text-white lg:rounded-[48px] lg:px-12 lg:pb-16 lg:pt-20">
          <BigHand />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(52%_62%_at_50%_0%,rgba(255,79,154,0.2),rgba(255,79,154,0))]" />
          {/* L’objet 3D : la cloche d’un nouveau message. Et le logo, en bas. */}
          <div aria-hidden="true" data-float="" className="pointer-events-none absolute -right-5 -top-5 w-[96px] lg:right-6 lg:top-8 lg:w-[132px]" style={{ "--r": "12deg", transform: "rotate(12deg)" } as CSSProperties}>
            <Bell3D size={132} className="h-auto w-full" />
          </div>
          <div aria-hidden="true" data-float="" className="pointer-events-none absolute -bottom-8 -left-6 hidden lg:block" style={{ "--r": "-12deg", transform: "rotate(-12deg)", animationDelay: "1.4s" } as CSSProperties}>
            <BubbleLogo size={150} />
          </div>

          <div className="relative flex flex-col items-center text-center">
            {OVERTHINK.map((b) => (
              <span
                key={b.text}
                aria-hidden="true"
                data-float=""
                className={cn(
                  "pointer-events-none absolute hidden whitespace-nowrap rounded-[22px] bg-white px-4 py-2.5 font-message text-[17px] font-bold text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] lg:block",
                  b.r < 0 ? "rounded-bl-[6px]" : "rounded-br-[6px]",
                  b.at,
                )}
                style={{ "--r": `${b.r}deg`, transform: `rotate(${b.r}deg)`, animationDelay: b.d } as CSSProperties}
              >
                {b.text}
              </span>
            ))}
            <span data-reveal="" className="text-[13px] font-black text-white/60">
              Ensuite, avec BLUSH+
            </span>
            {/* Mobile : les messages qui font cogiter, en autocollants au-dessus du titre */}
            <span aria-hidden="true" className="mt-5 flex flex-wrap justify-center gap-2 lg:hidden">
              {OVERTHINK.slice(0, 3).map((b) => (
                <span
                  key={b.text}
                  className={cn("whitespace-nowrap rounded-[18px] bg-white px-3 py-1.5 font-message text-[14px] font-bold text-ink", b.r < 0 ? "rounded-bl-[5px]" : "rounded-br-[5px]")}
                  style={{ transform: `rotate(${b.r}deg)` }}
                >
                  {b.text}
                </span>
              ))}
            </span>
            <h2 id="quotidien-titre" data-reveal="" className="m-0 mt-4 text-[54px] font-black leading-[0.94] tracking-[-0.05em] sm:text-[76px] lg:text-[100px]">
              un nouveau
              <br />
              message&nbsp;?
            </h2>
            <p data-reveal="" className="m-0 mt-6 max-w-[440px] text-[17px] font-extrabold leading-[1.5] text-white/70 [text-wrap:balance] lg:mt-7 lg:text-[19px]">
              Colle-le dans BLUSH, envoie une capture ou un nouvel export. Puis demande-lui&nbsp;:
            </p>
          </div>

          <ul data-reveal="" className="m-0 mt-8 flex list-none flex-col p-0 lg:mt-12">
            {ASKS.map((a, i) => {
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
                    id={`demande-${i}-q`}
                    aria-expanded={on}
                    aria-controls={`demande-${i}`}
                    onClick={() => {
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
                  {/* La réponse s’ouvre en glissant (hauteur 0 → auto) ; fermée, elle sort du clavier et des lecteurs d’écran */}
                  <div
                    id={`demande-${i}`}
                    role="region"
                    aria-labelledby={`demande-${i}-q`}
                    className={cn("grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                  >
                    <div inert={!on || undefined} className="min-h-0 overflow-hidden">
                      <div className={cn("mx-auto max-w-[500px] pb-7 pt-3 transition-opacity duration-500", on ? "opacity-100" : "opacity-0")}>
                        <div className="flex flex-col gap-2 rounded-[26px] bg-white p-3.5 text-left text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)] lg:p-4">{a.answer()}</div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/** La grosse main, comme un curseur géant : blanche, cernée d’encre, l’index levé. */
function HandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("block h-auto w-full overflow-visible drop-shadow-[0_10px_14px_rgba(0,0,0,0.4)]", className)}>
      <path
        d="M22 11 A5 5 0 0 1 32 11 V28.5 A4.5 4.5 0 0 1 41 28.5 V31.5 A4.5 4.5 0 0 1 50 31.5 V35 A4 4 0 0 1 58 35 V44 C58 52 52 58 44 58 H32 C27 58 24 56 21 52 L11 41 A4 4 0 0 1 16.5 35.5 L22 40 Z"
        fill="#FFFFFF"
        stroke="#121214"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M32 32 V40.5 M41 35 V42.5 M50 38.5 V44.5" fill="none" stroke="#121214" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/*
 * À la souris, la main remplace le curseur dans le bloc noir : elle suit en douceur et s’enfonce au clic.
 * Le vrai curseur n’est masqué qu’une fois la main prête (data-hand), jamais sur écran tactile ni au clavier.
 */
function BigHand() {
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

/** Une réponse de BLUSH : la bulle qui écrit, puis la réponse dans une bulle couleur papier. */
function FromBlush({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <BubbleLogo size={28} className="mb-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-[20px] rounded-bl-[6px] bg-[#F4F2ED] px-4 py-3">{children}</div>
    </div>
  );
}

/* ———— Les avis (seulement s’il y en a de vrais) ———— */
export function Reviews({ items, slots }: { items: Testimonial[]; slots: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 440), behavior: "smooth" });
  };
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="avis-titre" className="py-14 lg:py-20">
      <Container>
        <SectionHead id="avis-titre" title="Témoignages" />
      </Container>
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
              {slots ? (
                <span aria-hidden="true" className="size-14 shrink-0 rounded-full bg-skeleton" />
              ) : (
                <Avatar tone="elle" size={56}>
                  {t.name.charAt(0)}
                </Avatar>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[18px] font-black">{t.name}</span>
                <span className="text-[14px] font-extrabold text-grey">{t.label}</span>
              </div>
              {slots && <span className="shrink-0 rounded-full bg-plaque px-2.5 py-1 text-[12px] font-black text-soft">Emplacement</span>}
            </div>
            <p className={cn("m-0 text-[17px] font-extrabold leading-[1.6]", slots ? "text-grey" : "text-ink")}>{t.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-center gap-3">
        <IconButton icon="back" label="Avis précédents" onClick={() => move(-1)} iconSize={20} />
        <IconButton icon="chevron" label="Avis suivants" onClick={() => move(1)} iconSize={20} />
      </div>
    </section>
  );
}

/* ———— Ce que BLUSH promet, en faits ———— */
export function Facts() {
  const facts = [
    { value: "40 s", label: "pour analyser votre conv" },
    { value: "8", label: "chapitres dans ton rapport" },
    { value: "0", label: "message gardé après ton rapport" },
  ];
  return (
    <section aria-labelledby="faits-titre" className="py-14 lg:py-20">
      <Container className="flex flex-col items-center">
        <SectionHead
          id="faits-titre"
          title="Rapide. Complet. Discret."
          sub="Et honnête : BLUSH ne garantit rien sur ce que l’autre ressent. Il dit ce que montrent vos messages, et à quel point il en est sûr."
        />
        <ul className="m-0 mt-10 grid w-full max-w-[1000px] list-none grid-cols-2 gap-3 p-0 lg:mt-14 lg:grid-cols-4 lg:gap-5">
          {facts.map((f, i) => (
            <FactTile key={f.label} index={i}>
              <span className="text-[46px] font-black leading-none tracking-[-0.03em] lg:text-[60px]">{f.value}</span>
              <span className="max-w-[170px] text-[14px] font-extrabold leading-[1.4] text-grey [text-wrap:balance] lg:text-[16px]">{f.label}</span>
            </FactTile>
          ))}
          <FactTile index={3}>
            <span className="flex gap-1.5">
              {(["whatsapp", "imessage", "instagram", "hinge"] as const).map((a) => (
                <AppBadge key={a} app={a} size={30} radius={9} className="lg:!size-10 lg:!rounded-[12px] lg:[&_svg]:!size-5" />
              ))}
            </span>
            <span className="max-w-[170px] text-[14px] font-extrabold leading-[1.4] text-grey [text-wrap:balance] lg:text-[16px]">Toutes tes applis, même par captures</span>
          </FactTile>
        </ul>
      </Container>
    </section>
  );
}

function FactTile({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li
      data-reveal=""
      style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}
      className="flex min-h-[156px] flex-col items-center justify-center gap-3 rounded-[28px] bg-white px-4 py-6 text-center shadow-card lg:aspect-square lg:gap-4"
    >
      {children}
    </li>
  );
}

/* ———— Le dernier appel ———— */
export function FinalCta() {
  const cta = useCta();
  return (
    <section className="pb-20 pt-6 lg:pb-28 lg:pt-10">
      <Container>
        <div data-reveal="" className="flex flex-col items-center text-center">
          <BubbleLogo size={68} animated />
          <h2 className="m-0 mt-6 max-w-[640px] text-[36px] font-black leading-[1.04] tracking-[-0.03em] [text-wrap:balance] lg:text-[56px]">Ta conv a déjà la réponse.</h2>
          <CtaButton className="mt-8" />
          <span className="mt-3.5 text-[14px] font-extrabold text-grey">{cta.note}</span>
        </div>
      </Container>
    </section>
  );
}
