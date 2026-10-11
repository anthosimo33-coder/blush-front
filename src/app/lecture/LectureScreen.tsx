"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks";
import { SOUFFLE } from "@/lib/messages-erreur";
import { delai } from "@/lib/motion";
import { play } from "@/lib/sound";
import { READING_STEPS } from "@/contenu/parcours";
import { BubbleLogo, CheckBurst } from "@/components/brand/objects3d";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DoneCheck, TypingDots } from "@/components/ui/feedback";
import { Screen } from "@/components/shell/Screen";
import { useSuiviLecture } from "./suivi";

/*
 * Écran 08 — Lecture. Une seule composition centrée, du début à la fin :
 * le visuel (la bulle dans son anneau, puis la gerbe), le titre et son compteur, les découvertes.
 * En bas, l’étape en cours laisse la place au bouton « Voir mon rapport ».
 */
export function LectureScreen({ total }: { total: number }) {
  const reduced = useReducedMotion();
  /* La lecture lancée en arrivant, puis suivie jusqu’à son verdict (suivi.ts). `failed` : le serveur a tout essayé, on le dit et on propose de relancer */
  const { p, phase, echec: failed, trop, enDirect: live, relancer: retry } = useSuiviLecture();
  const heard = useRef(0);
  /* « Voir mon rapport » touché : le bouton le montre jusqu’au chargement du verdict (un vrai chargement, voulu) */
  const [enRoute, setEnRoute] = useState(false);
  useEffect(() => {
    /* Un retour arrière ressort la page du cache du navigateur : le bouton redevient touchable */
    const remettre = (e: PageTransitionEvent) => {
      if (e.persisted) setEnRoute(false);
    };
    window.addEventListener("pageshow", remettre);
    return () => window.removeEventListener("pageshow", remettre);
  }, []);

  /* Chaque découverte, un toucher un cran plus haut ; la coche, la signature sur un accord chaud */
  const found = p.discoveries.length;
  useEffect(() => {
    if (live.current && found > heard.current) play("decouverte", found - 1);
    heard.current = found;
  }, [found, live]);
  useEffect(() => {
    if (phase === "done" && live.current) play("analyseFinie");
  }, [phase, live]);

  const done = phase === "done";
  /* Pourquoi la lecture a échoué, d’après le suivi : le refus du modèle, le budget de l’IA du jour, ou une panne */
  const raison = p.failReason;
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
          {failed && raison === "refus" ? (
            /* Un refus revient à chaque essai : on propose une autre conv, pas de relancer */
            <ButtonLink href="/commencer" arrow>
              Essayer une autre conv
            </ButtonLink>
          ) : failed && raison === "souffle" ? null : failed ? (
            <Button arrow onClick={retry}>
              Relancer la lecture
            </Button>
          ) : done ? (
            /* Le bouton arrive juste après la gerbe (0,15 s) : l’anneau plein a déjà fait attendre */
            <div data-popin="" className="w-full" style={delai(0.15)}>
              {/* D’abord la révélation du verdict, qui mène au rapport. Chargement complet : Safari teinte ses barres pour la scène sombre */}
              <ButtonLink
                href="/rapport/verdict"
                arrow={!enRoute}
                aria-busy={enRoute}
                onClick={(e) => {
                  e.preventDefault();
                  if (enRoute) return;
                  setEnRoute(true);
                  /* Deux images plus tard : les trois points sont peints avant que le navigateur ne parte */
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- voulu : un vrai chargement pour que Safari reteinte ses barres
                      window.location.assign("/rapport/verdict");
                    }),
                  );
                }}
              >
                {enRoute ? <TypingDots color="currentColor" label="Ton verdict arrive" /> : "Voir mon rapport"}
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center gap-2 text-detail font-black">
                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {p.done ? (
                    <DoneCheck size={20} data-popin="" />
                  ) : (
                    <TypingDots size={5} />
                  )}
                </span>
                <span key={step} data-rise="">
                  {READING_STEPS[step]}
                  <span className="sr-only">{p.done ? "\u00a0: fait" : "\u00a0: en cours"}</span>
                </span>
              </div>
              <p className={cn("m-0 text-legende font-extrabold text-grey", p.done && "invisible")}>Ça prend environ 40 secondes</p>
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
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
          />
          {done ? (
            <div data-float="">
              <CheckBurst size={92} pop />
            </div>
          ) : (
            <ReadingDial progress={reduced && p.done ? 1 : shown.progress} leaving={phase === "leaving"} />
          )}
        </div>

        {failed && raison === "refus" ? (
          /* Texte relu le 8 octobre */
          <div role="alert" className="flex max-w-[520px] flex-col items-center gap-3">
            <h1 className="m-0 mt-5 text-titre-2 font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">BLUSH ne peut pas lire cette conv.</h1>
            <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">
              L’IA qui lit les convs pour BLUSH a refusé de l’analyser. Ça arrive quand une conv contient des passages qu’elle ne traite pas. Rien n’est perdu{NBSP}: tu peux en essayer une autre.
            </p>
          </div>
        ) : failed && raison === "souffle" ? (
          /* Le budget de l’IA du jour : rien à relancer, la lecture repart quand on revient après minuit */
          <div role="alert" className="flex max-w-[520px] flex-col items-center gap-3">
            <h1 className="m-0 mt-5 text-titre-2 font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">{SOUFFLE}</h1>
            {/* TODO(produit): phrase à valider */}
            <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">Ta conv est bien là{NBSP}: la lecture reprendra quand tu reviendras.</p>
          </div>
        ) : failed ? (
          /* Texte relu le 8 octobre */
          <div role="alert" className="flex max-w-[520px] flex-col items-center gap-3">
            <h1 className="m-0 mt-5 text-titre-2 font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">
              Ça a coincé de notre côté.
              <br />
              Ta conv est bien là.
            </h1>
            {trop && <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">Tu as déjà relancé plusieurs fois aujourd’hui. Réessaie demain{NBSP}: ta conv t’attend.</p>}
          </div>
        ) : (
          <h1 className="m-0 mt-5 text-titre-2 font-black leading-[1.1] tracking-[-0.025em] lg:mt-6 lg:text-[38px]">
            {/* Trois lignes sur mobile, deux sur desktop : les coupures ne tombent jamais au milieu d’une idée */}
            BLUSH analyse tes
            <br className="lg:hidden" /> <span className="tabular-nums">{done ? total : <Compteur cible={p.messagesRead} reduced={reduced} />}</span> messages,
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
            <stop offset="0" style={{ stopColor: "var(--toi)" }} />
            <stop offset="1" style={{ stopColor: "var(--elle)" }} />
          </linearGradient>
          <linearGradient id="lecture-ring-b" gradientUnits="userSpaceOnUse" x1="75" y1="147" x2="75" y2="3">
            <stop offset="0" style={{ stopColor: "var(--elle)" }} />
            <stop offset="1" style={{ stopColor: "var(--vrai)" }} />
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
      <div data-float="" className="pt-2" style={{ "--r": "-4deg" }}>
        <BubbleLogo size={88} animated />
      </div>
    </div>
  );
}

type Sticker = { color: string; rotate: number };

/* Les autocollants, dans l’ordre des découvertes : elle (rose), un mot à vous (bleu), le moment (vert). */
const STICKERS: [Sticker, ...Sticker[]] = [
  { color: "var(--elle)", rotate: -2 },
  { color: "var(--toi)", rotate: 1.5 },
  { color: "var(--vrai)", rotate: -1 },
];

/** Les découvertes, en autocollants qui arrivent avec un petit rebond. */
function Discoveries({ items, className }: { items: string[]; className?: string }) {
  return (
    /* La place de deux lignes, réservée d’avance : le bloc centré ne remonte pas quand les découvertes passent à la ligne */
    <ul className={cn("m-0 flex min-h-[78px] list-none flex-wrap content-start justify-center gap-2.5 p-0", className)} aria-label="Ce que BLUSH remarque">
      {items.map((text, i) => {
        const d = STICKERS[i % STICKERS.length] ?? STICKERS[0];
        return (
          <li
            key={text}
            data-popin=""
            /* Une trouvaille longue passe sur deux lignes plutôt que de déborder sur un petit écran */
            className="inline-flex min-h-[34px] max-w-full items-center gap-[7px] rounded-[17px] bg-white px-3 py-[7px] text-left text-legende font-black leading-[1.25] shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_8px_18px_-8px_rgba(17,17,20,0.22)]"
            style={{ "--r": `${d.rotate}deg`, ...delai(i * 0.08), transform: `rotate(${d.rotate}deg)` }}
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            {text}
          </li>
        );
      })}
    </ul>
  );
}

/** Le compteur, à part : sa montée, image par image, ne re-rend que lui, pas tout l’écran. */
function Compteur({ cible, reduced }: { cible: number; reduced: boolean }) {
  return useCountUp(cible, reduced);
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
