"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/hooks";
import { getAnalysisProgress, startAnalysis } from "@/services/api";
import { READING_DISCOVERIES, READING_STEPS } from "@/mocks/story";
import { BubbleLogo, CheckBurst } from "@/components/brand/objects3d";
import { ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Screen } from "@/components/shell/Screen";
import { useJourney } from "@/state/journey";
import type { AnalysisProgress } from "@/types";

const START: AnalysisProgress = { progress: 0, messagesRead: 0, stepsDone: 0, discoveries: 0, done: false };

/** reading : la bulle écrit, l’anneau se remplit · leaving : l’anneau s’efface · done : la gerbe marque la fin. */
type Phase = "reading" | "leaving" | "done";

/*
 * Écran 08 — Lecture. Une seule composition centrée, du début à la fin :
 * le visuel (la bulle dans son anneau, puis la gerbe), le titre et son compteur, les découvertes.
 * En bas, l’étape en cours laisse la place au bouton « Voir mon rapport ».
 */
export function LectureScreen({ total, restart }: { total: number; restart: boolean }) {
  const [j, set] = useJourney();
  const reduced = useReducedMotion();
  const [p, setP] = useState<AnalysisProgress>(START);
  const [phase, setPhase] = useState<Phase>("reading");
  const count = useCountUp(p.messagesRead, reduced);
  const restartRef = useRef(restart);

  useEffect(() => {
    let alive = true;
    let first = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const { jobId } = await startAnalysis({ me: j.me ?? "hugo", guess: j.guess ?? "flou", goal: j.goal ?? "ensemble" }, { restart: restartRef.current });
      restartRef.current = false;
      if (!alive) return;
      set({ jobId });
      const tick = async () => {
        const next = await getAnalysisProgress(jobId);
        if (!alive) return;
        setP(next);
        const arrivedDone = first;
        first = false;
        if (!next.done) {
          timer = setTimeout(tick, 150);
          return;
        }
        /* Lecture déjà finie à l’arrivée, ou mouvement réduit : la fin s’affiche directement. */
        if (arrivedDone || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setPhase("done");
          return;
        }
        /* Sinon on laisse voir l’anneau plein et la coche « Ton verdict », puis la gerbe arrive. */
        timer = setTimeout(() => {
          setPhase("leaving");
          timer = setTimeout(() => setPhase("done"), 280);
        }, 700);
      };
      tick();
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lancé une seule fois à l’arrivée sur l’écran
  }, []);

  const done = phase === "done";
  const step = p.done ? READING_STEPS.length - 1 : Math.min(p.stepsDone, READING_STEPS.length - 1);
  const shown = reduced && p.done ? { ...p, messagesRead: total, discoveries: READING_DISCOVERIES.length } : p;

  return (
    <Screen
      mainWidth={600}
      contentGap={12}
      desktopTopPad={10}
      centered
      footer={
        /* Même hauteur que le bouton : rien ne bouge quand il remplace l’étape en cours */
        <div className="flex h-[60px] flex-col items-center justify-center">
          {done ? (
            <div data-popin="" className="w-full" style={{ "--d": "0.5s" } as CSSProperties}>
              <ButtonLink href="/rapport" arrow>
                Voir mon rapport
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center gap-2 text-[15px] font-black">
                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {p.done ? (
                    <span data-popin="" className="flex size-5 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" }}>
                      <Icon name="check" size={11} color="#FFFFFF" stroke={3.4} />
                    </span>
                  ) : (
                    <TypingDots size={5} />
                  )}
                </span>
                <span key={step} data-rise="">
                  {READING_STEPS[step]}
                  <span className="sr-only">{p.done ? " : fait" : " : en cours"}</span>
                </span>
              </div>
              <p className={cn("m-0 text-[13px] font-extrabold text-grey", p.done && "invisible")}>Ça prend environ 40 secondes</p>
            </div>
          )}
        </div>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {p.done ? "Ton rapport est prêt." : "CRUSH lit votre conv."}
      </p>

      <div className="isolate flex flex-1 flex-col items-center justify-center pb-6 text-center lg:flex-none lg:pb-0 lg:pt-[max(24px,calc(50dvh_-_310px))]">
        {/* Le visuel : même cadre pour l’anneau et pour la gerbe, le titre ne bouge pas quand l’un remplace l’autre.
            Le halo est sous tout le reste (z négatif dans la colonne isolée) : il ne voile pas le titre. */}
        <div className="relative flex h-[150px] w-[300px] items-center justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#FFFFFF,rgba(255,255,255,0))]"
          />
          {done ? (
            <div data-float="">
              <CheckBurst size={92} pop />
            </div>
          ) : (
            <ReadingDial progress={reduced && p.done ? 1 : shown.progress} leaving={phase === "leaving"} />
          )}
        </div>

        <h1 className="m-0 mt-5 text-[30px] font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">
          {/* Trois lignes sur mobile, deux sur desktop : les coupures ne tombent jamais au milieu d’une idée */}
          CRUSH lit tes
          <br className="lg:hidden" /> <span className="tabular-nums">{done ? total : count}</span> messages,
          <br />
          du premier au dernier.
        </h1>

        <Discoveries shown={done ? READING_DISCOVERIES.length : shown.discoveries} className="mt-6" />
      </div>
    </Screen>
  );
}

/** La bulle du logo écrit au centre ; l’anneau autour se remplit au fil de la lecture. */
function ReadingDial({ progress, leaving }: { progress: number; leaving: boolean }) {
  const pct = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label="Lecture de votre conv"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("relative flex size-[150px] items-center justify-center transition-[opacity,transform] duration-300 ease-out", leaving && "scale-90 opacity-0")}
    >
      {/* Deux demi-anneaux, chacun avec son dégradé : la couleur suit la lecture, bleu → rose → vert */}
      <svg aria-hidden="true" viewBox="0 0 150 150" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="lecture-ring-a" gradientUnits="userSpaceOnUse" x1="75" y1="3" x2="75" y2="147">
            <stop offset="0" stopColor="#3D8BFF" />
            <stop offset="1" stopColor="#FF4F9A" />
          </linearGradient>
          <linearGradient id="lecture-ring-b" gradientUnits="userSpaceOnUse" x1="75" y1="147" x2="75" y2="3">
            <stop offset="0" stopColor="#FF4F9A" />
            <stop offset="1" stopColor="#12C08A" />
          </linearGradient>
        </defs>
        <circle cx="75" cy="75" r="72" fill="none" stroke="rgba(17,17,20,0.07)" strokeWidth="4" />
        {[
          { d: "M75 3 A72 72 0 0 1 75 147", stroke: "url(#lecture-ring-a)", shown: Math.min(pct, 50) },
          { d: "M75 147 A72 72 0 0 1 75 3", stroke: "url(#lecture-ring-b)", shown: Math.max(0, pct - 50) },
        ].map((arc) => (
          <path
            key={arc.d}
            d={arc.d}
            fill="none"
            stroke={arc.stroke}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={50}
            strokeDasharray="50"
            strokeDashoffset={50 - arc.shown}
            className={cn("transition-[stroke-dashoffset] duration-200 ease-linear", arc.shown === 0 && "opacity-0")}
          />
        ))}
      </svg>
      <div data-float="" className="pt-2" style={{ "--r": "-4deg" } as CSSProperties}>
        <BubbleLogo size={88} animated />
      </div>
    </div>
  );
}

/** Les découvertes, en autocollants qui arrivent avec un petit rebond. */
function Discoveries({ shown, className }: { shown: number; className?: string }) {
  return (
    <ul className={cn("m-0 flex min-h-[34px] list-none flex-wrap justify-center gap-2.5 p-0", className)} aria-label="Ce que CRUSH remarque">
      {READING_DISCOVERIES.map((d, i) =>
        shown > i ? (
          <li
            key={d.text}
            data-popin=""
            className="inline-flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-[17px] bg-white px-3 text-[13px] font-black shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_8px_18px_-8px_rgba(17,17,20,0.22)]"
            style={{ "--r": `${d.rotate}deg`, "--d": `${i * 0.08}s`, transform: `rotate(${d.rotate}deg)` } as CSSProperties}
          >
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: d.color }} />
            {d.text}
          </li>
        ) : null,
      )}
    </ul>
  );
}

/** Le compteur monte en douceur vers la valeur reçue. */
function useCountUp(target: number, reduced: boolean) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (reduced) {
      cur.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- état final direct en mouvement réduit
      setV(target);
      return;
    }
    let raf = 0;
    const step = () => {
      cur.current += (target - cur.current) * 0.18;
      if (Math.abs(target - cur.current) < 0.5) cur.current = target;
      setV(Math.round(cur.current));
      if (cur.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return v;
}
