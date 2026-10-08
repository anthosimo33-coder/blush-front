"use client";

import { BACKEND } from "@/services/mode";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/hooks";
import { play } from "@/lib/sound";
import { getAnalysisProgress, startAnalysis } from "@/services/api";
import { READING_STEPS } from "@/mocks/story";
import { BubbleLogo, CheckBurst } from "@/components/brand/objects3d";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Screen } from "@/components/shell/Screen";
import { readJourney, setJourney } from "@/state/journey";
import type { AnalysisProgress } from "@/types";

const START: AnalysisProgress = { progress: 0, messagesRead: 0, stepsDone: 0, discoveries: [], done: false };

/** reading : la bulle écrit, l’anneau se remplit · leaving : l’anneau s’efface · done : la gerbe marque la fin. */
type Phase = "reading" | "leaving" | "done";

/*
 * Écran 08 — Lecture. Une seule composition centrée, du début à la fin :
 * le visuel (la bulle dans son anneau, puis la gerbe), le titre et son compteur, les découvertes.
 * En bas, l’étape en cours laisse la place au bouton « Voir mon rapport ».
 */
export function LectureScreen({ total, restart }: { total: number; restart: boolean }) {
  const reduced = useReducedMotion();
  const [p, setP] = useState<AnalysisProgress>(START);
  const [phase, setPhase] = useState<Phase>("reading");
  const count = useCountUp(p.messagesRead, reduced);
  const restartRef = useRef(restart);
  /* Vrai dès qu’on voit la lecture se faire : une analyse déjà finie à l’arrivée ne rejoue pas ses sons */
  const live = useRef(false);
  const heard = useRef(0);
  /* La lecture a échoué (le serveur a tout essayé) : on le dit, et on propose de relancer. `run` relance l’effet */
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState(0);
  const retry = () => {
    setFailed(false);
    setP(START);
    setRun((r) => r + 1);
  };

  useEffect(() => {
    let alive = true;
    let first = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      /* Le parcours lu maintenant : au premier rendu (hydratation), l’état du navigateur n’est pas encore là */
      const cur = readJourney();
      const { jobId } = await startAnalysis({ me: cur.me ?? "hugo", pronom: cur.pronom, prenom: cur.prenom, guess: cur.guess ?? "flou", goal: cur.goal ?? "ensemble" }, { restart: restartRef.current });
      restartRef.current = false;
      if (!alive) return;
      setJourney({ jobId });
      const tick = async () => {
        const next = await getAnalysisProgress(jobId);
        if (!alive) return;
        setP(next);
        const arrivedDone = first;
        first = false;
        if (next.failed) {
          setFailed(true);
          return;
        }
        if (!next.done) {
          live.current = true;
          /* La démo s’anime toutes les 150 ms ; le vrai back-end, on le lit chaque seconde */
          timer = setTimeout(tick, BACKEND ? 1000 : 150);
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
    /* Lancé à l’arrivée sur l’écran, puis à chaque « Relancer » */
  }, [run]);

  /* Chaque découverte, un toucher un cran plus haut ; la coche, la signature sur un accord chaud */
  const found = p.discoveries.length;
  useEffect(() => {
    if (live.current && found > heard.current) play("decouverte", found - 1);
    heard.current = found;
  }, [found]);
  useEffect(() => {
    if (phase === "done" && live.current) play("analyseFinie");
  }, [phase]);

  const done = phase === "done";
  const step = p.done ? READING_STEPS.length - 1 : Math.min(p.stepsDone, READING_STEPS.length - 1);
  const shown = reduced && p.done ? { ...p, messagesRead: total } : p;

  return (
    <Screen
      mainWidth={680}
      contentGap={12}
      desktopTopPad={10}
      centered
      footer={
        /* Même hauteur que le bouton : rien ne bouge quand il remplace l’étape en cours */
        <div className="flex h-[60px] flex-col items-center justify-center">
          {failed && p.failReason === "refus" ? (
            /* Un refus revient à chaque essai : on propose une autre conv, pas de relancer */
            <ButtonLink href="/commencer" arrow>
              Essayer une autre conv
            </ButtonLink>
          ) : failed ? (
            <Button arrow onClick={retry}>
              Relancer la lecture
            </Button>
          ) : done ? (
            <div data-popin="" className="w-full" style={{ "--d": "0.5s" } as CSSProperties}>
              {/* D’abord la révélation du verdict, qui mène au rapport. Chargement complet : Safari teinte ses barres pour la scène sombre */}
              <ButtonLink
                href="/rapport/verdict"
                arrow
                onClick={(e) => {
                  e.preventDefault();
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- voulu : un vrai chargement pour que Safari reteinte ses barres
                  window.location.assign("/rapport/verdict");
                }}
              >
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
        {p.done ? "Ton rapport est prêt." : "BLUSH analyse votre conv."}
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

        {failed && p.failReason === "refus" ? (
          /* ⚠ Texte à valider */
          <div role="alert" className="flex max-w-[520px] flex-col items-center gap-3">
            <h1 className="m-0 mt-5 text-[30px] font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">BLUSH ne peut pas lire cette conv.</h1>
            <p className="m-0 text-[15px] font-extrabold leading-[1.45] text-soft">
              Claude, l’IA qui lit les convs pour BLUSH, a refusé de l’analyser. Ça arrive quand une conv contient des passages qu’il ne traite pas. Rien n’est perdu : tu peux en essayer une autre.
            </p>
          </div>
        ) : failed ? (
          /* ⚠ Texte à valider */
          <h1 className="m-0 mt-5 text-[30px] font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]" role="alert">
            Ça a coincé de notre côté.
            <br />
            Ta conv est bien là.
          </h1>
        ) : (
          <h1 className="m-0 mt-5 text-[30px] font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">
            {/* Trois lignes sur mobile, deux sur desktop : les coupures ne tombent jamais au milieu d’une idée */}
            BLUSH analyse tes
            <br className="lg:hidden" /> <span className="tabular-nums">{done ? total : count}</span> messages,
            <br />
            du premier au dernier.
          </h1>
        )}

        <Discoveries items={shown.discoveries} className="mt-6" />
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
      aria-label="Analyse de votre conv"
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
            /* Le serveur est lu chaque seconde : l’anneau glisse d’une valeur à l’autre sans à-coups */
            className={cn("transition-[stroke-dashoffset] duration-[900ms] ease-linear", arc.shown === 0 && "opacity-0")}
          />
        ))}
      </svg>
      <div data-float="" className="pt-2" style={{ "--r": "-4deg" } as CSSProperties}>
        <BubbleLogo size={88} animated />
      </div>
    </div>
  );
}

/* Les autocollants, dans l’ordre des découvertes : elle (rose), un mot à vous (bleu), le moment (vert). */
const STICKERS = [
  { color: "#FF4F9A", rotate: -2 },
  { color: "#3D8BFF", rotate: 1.5 },
  { color: "#12C08A", rotate: -1 },
];

/** Les découvertes, en autocollants qui arrivent avec un petit rebond. */
function Discoveries({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("m-0 flex min-h-[34px] list-none flex-wrap justify-center gap-2.5 p-0", className)} aria-label="Ce que BLUSH remarque">
      {items.map((text, i) => {
        const d = STICKERS[i % STICKERS.length];
        return (
          <li
            key={text}
            data-popin=""
            /* Une trouvaille longue passe sur deux lignes plutôt que de déborder sur un petit écran */
            className="inline-flex min-h-[34px] max-w-full items-center gap-[7px] rounded-[17px] bg-white px-3 py-[7px] text-left text-[13px] font-black leading-[1.25] shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_8px_18px_-8px_rgba(17,17,20,0.22)]"
            style={{ "--r": `${d.rotate}deg`, "--d": `${i * 0.08}s`, transform: `rotate(${d.rotate}deg)` } as CSSProperties}
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            {text}
          </li>
        );
      })}
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
