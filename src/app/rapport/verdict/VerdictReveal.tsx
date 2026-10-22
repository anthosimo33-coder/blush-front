"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { delai } from "@/lib/motion";
import { useSonForce } from "@/lib/audio";
import { play, useSoundsEnabled } from "@/lib/sound";
import { formatCount } from "@/lib/format";
import { nombreDApplis } from "@/lib/morceaux";
import { FRAIS_DU_RENDU } from "@/lib/query";
import { useRapport } from "@/lib/requetes";
import type { ReportPayload } from "@/types/api";
import { BubbleLogo, Sphere, type SphereKind } from "@/components/brand/objects3d";
import { TypingDots } from "@/components/ui/feedback";
import { ScoreBar } from "@/components/ui/progress";
import { Icon } from "@/components/ui/icons";
import type { Confidence, Message, Story } from "@/types";
import { moiEtAutre } from "@/lib/participants";
import { IlOuElle } from "@/lib/pronom";
import { bloquerDefilement } from "@/lib/defilement";
import { figtree } from "@/lib/fonts";
import { auRepos } from "@/lib/repos";
import { tracer } from "@/lib/tracer";
import dynamic from "next/dynamic";
import { cardsOf, type Card } from "./cartes";

/* La feuille du partage (src/app/rapport/Partage.tsx) ne s’ouvre qu’au toucher : elle arrive à part, sans alourdir la scène */
const PartageSheet = dynamic(() => import("../Partage").then((m) => m.PartageSheet), { ssr: false });

/*
 * La révélation du verdict : juste après l’analyse, une scène sombre et une carte à la fois, comme des stories.
 * Les chiffres, le verdict, qui fait quoi, le moment où tout a basculé, puis « à toi de jouer » et le rapport.
 * Les cartes viennent du rapport (cartes.ts) : sans accès, du seul chapitre offert, le verdict ; rien de payant n’est
 * montré avant le paiement.
 * Un toucher à droite (ou →) avance, à gauche (ou ←) recule ; « Passer » mène droit au rapport.
 * Absent des maquettes, textes relus le 8 octobre.
 */

/* Le fond respire avec chaque carte : trois lueurs (rose au centre, bleu en bas à gauche, rose en haut à droite) */
const GLOWS: Record<Card["id"], [number, number, number]> = {
  chiffres: [0.55, 0.25, 0],
  verdict: [1, 0, 0.3],
  duel: [0.2, 0.8, 0.8],
  moment: [0.3, 0, 0.9],
  jouer: [0.2, 1, 0.2],
};

const CONFIDENCE: Record<Confidence, string> = { sur: "Sûr", probable: "Probable", verifier: "À vérifier" };

/*
 * On entre et on sort de la scène par un chargement complet : Safari reteinte alors ses barres (sombres ici, claires au rapport).
 * En navigation interne, la barre du bas garderait la couleur de la page d’avant. `replace` : « Retour » depuis le rapport ne revient pas ici.
 */
const toReport = () => window.location.replace("/rapport");

/* `rendu` : l’heure du rendu serveur. Tout juste rendu (la scène s’ouvre par un chargement complet), le rapport n’est pas relu au montage (src/lib/query.ts) */
export function VerdictReveal({ initial, story, rendu }: { initial: ReportPayload; story: Story; rendu?: number }) {
  const { data } = useRapport(initial, { rendu, frais: FRAIS_DU_RENDU });
  const payload = data ?? initial;
  const cards = cardsOf(payload);
  const last = cards.length - 1;
  const [at, setAt] = useState(0);
  const [partage, setPartage] = useState(false);
  /* Montée fermée une fois la scène posée (ou à sa première ouverture), puis gardée (sa sortie, le lien et l’image déjà prêts) */
  const [partageVu, setPartageVu] = useState(false);
  if (partage && !partageVu) setPartageVu(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  /* Un glissé vient d’avancer : le « clic » qui le suit ne compte pas */
  const swiped = useRef(false);
  const card = cards[Math.min(at, last)] ?? cards[0];
  const { verdict } = payload.report;
  /* L’autre personne : « Il » ou « Elle » dans le duel (d’après son pronom, une fois « Qui es-tu ? » rempli) */
  const pronom = moiEtAutre(story).autre.pronoun;
  const autre = IlOuElle(pronom);

  /*
   * Le mode sobre (une alerte de danger) : pas de mise en scène, le rapport tout de suite. `alerte` le dit dès le
   * verdict, avant que le rapport doux (`sober`) soit écrit
   */
  const sobre = !!payload.sober || !!payload.alerte;
  useEffect(() => {
    if (sobre) toReport();
  }, [sobre]);

  /* Rien ne défile derrière la scène (même quand la feuille de partage s’ouvre puis se ferme par-dessus) */
  useEffect(() => bloquerDefilement(), []);

  /* La feuille du partage, chargée une fois la scène posée et montée fermée : au premier toucher, elle n’a plus qu’à
     s’ouvrir (montée au toucher, React gardait 0,3 s son écran d’attente avant de la montrer) */
  useEffect(() => auRepos(() => void import("../Partage").then(() => setPartageVu(true))), []);

  /*
   * « Passer » ou « Voir mon rapport » : trois points à la place, peints avant le chargement complet (deux images plus
   * tard), puis le rapport. Un retour arrière qui ressort la page du cache du navigateur rend les liens touchables.
   */
  const [enRoute, setEnRoute] = useState(false);
  const parti = useRef(false);
  const partir = useCallback((e?: MouseEvent<HTMLAnchorElement>) => {
    e?.preventDefault();
    if (parti.current) return;
    parti.current = true;
    setEnRoute(true);
    requestAnimationFrame(() => requestAnimationFrame(toReport));
  }, []);
  useEffect(() => {
    const remettre = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      parti.current = false;
      setEnRoute(false);
    };
    window.addEventListener("pageshow", remettre);
    return () => window.removeEventListener("pageshow", remettre);
  }, []);
  /*
   * La dernière carte : le serveur prépare déjà le rapport (une instance réveillée, la base aussi) pendant qu’on la lit.
   * Son coût : un rendu complet de /rapport côté serveur, dont le HTML est jeté (sa garde, verdictEcrit ; la conv ; le
   * rapport lu et déchiffré par getReport, qui relance ce qui manquerait à la chaîne), une fois par scène, à la dernière
   * carte seulement : « Voir mon rapport » refait la page (un chargement complet), sur une instance déjà chaude.
   */
  const chauffe = useRef(false);
  useEffect(() => {
    if (at !== last || chauffe.current) return;
    chauffe.current = true;
    fetch("/rapport", { credentials: "same-origin", priority: "low" }).catch((e) => tracer("verdict:prechargement", e));
  }, [at, last]);

  /* Chaque nouvelle carte est annoncée : le focus va sur son titre */
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [at]);

  /* Le verdict : un souffle grave, puis l’accord de ce verdict quand l’emoji se pose (le mode sobre n’a pas de scène, donc pas de son).
     Le bouton son, comme une story : touché, la scène joue même en mode silencieux. Absent des maquettes, textes relus le 8 octobre */
  const sons = useSoundsEnabled();
  const [loud, setLoud] = useState(false);
  const onVerdict = card.id === "verdict";
  useEffect(() => {
    if (onVerdict && !sobre) play("verdict", verdict.emoji);
  }, [onVerdict, sobre, verdict.emoji]);
  /* Le son forcé que tient le bouton son touché : lâché quand on le retouche, ou qu’on quitte le verdict */
  const sonForce = useSonForce();
  const toggleLoud = () => {
    const on = !loud;
    setLoud(on);
    sonForce(on);
    if (on && onVerdict && !sobre) play("verdict", verdict.emoji);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /*
       * La fenêtre de partage ouverte garde ses touches (Échap la ferme, sans quitter le verdict). Lue sur la page, pas sur
       * `partage` : la feuille reste ouverte pendant sa sortie animée (Sheet ne la ferme qu’au bout), quand `partage` est
       * déjà faux. Le même sélecteur que globals.css (les animations en pause sous une fenêtre).
       */
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowRight") setAt((i) => Math.min(last, i + 1));
      else if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") partir();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, partir]);

  const go = (to: number) => setAt(Math.max(0, Math.min(last, to)));

  /* Un glissé du doigt : vers la gauche on avance, vers la droite on recule */
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || (e.target as HTMLElement).closest("a, button")) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    swiped.current = Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy);
    if (swiped.current) go(at + (dx < 0 ? 1 : -1));
  };

  /* Un toucher : à gauche on recule, ailleurs on avance */
  const onTap = (e: MouseEvent<HTMLElement>) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest("a, button")) return;
    go(e.clientX < window.innerWidth * 0.3 ? at - 1 : at + 1);
  };

  if (sobre) return <div className="fixed inset-0 bg-paper" />;

  const step = <span className="sr-only">{`Étape ${at + 1} sur ${cards.length}\u00a0: `}</span>;
  const glow = GLOWS[card.id];

  return (
    <main
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={onPointerUp}
      onClick={onTap}
      className={cn("fixed inset-0 z-[60] flex cursor-pointer touch-manipulation select-none flex-col overflow-hidden bg-ink text-white", figtree.variable)}
    >
      {/* Sombre jusque sous les barres du navigateur, dès le premier affichage (Safari les teinte d’après la page) */}
      <style>{"html,body{background:var(--ink)!important}"}</style>
      <h1 className="sr-only">Ton verdict</h1>

      {/* Les lueurs du fond */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 [background:radial-gradient(60%_45%_at_50%_38%,rgba(255,79,154,0.42),transparent_70%)]"
        style={{ opacity: glow[0] }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 [background:radial-gradient(55%_45%_at_12%_78%,rgba(61,139,255,0.34),transparent_70%)]"
        style={{ opacity: glow[1] }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 [background:radial-gradient(55%_45%_at_88%_20%,rgba(255,79,154,0.3),transparent_70%)]"
        style={{ opacity: glow[2] }}
      />

      {/* La scène est noire dès le premier affichage (Safari teinte ses barres d’après lui) ; seul le contenu apparaît en fondu */}
      <div
        data-stage=""
        className="relative mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] lg:px-6 lg:pb-10 lg:pt-8"
      >
        {/* Les traits du haut, comme des stories */}
        <div aria-hidden="true" className="flex gap-1.5">
          {cards.map((c, i) => (
            <span key={c.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              {i <= at && <span key={i === at ? `en-cours-${at}` : "lu"} data-vfill={i === at ? "" : undefined} className="block h-full rounded-full bg-white" />}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          {/* L’adresse du site, toujours dans le cadre : elle est sur chaque capture des cartes */}
          <span className="flex items-center gap-2 text-note font-black tracking-[-0.01em]">
            <BubbleLogo size={26} />
            askblush.com
          </span>
          <span className="flex items-center gap-4">
            {sons && (
              <button
                type="button"
                onClick={toggleLoud}
                aria-pressed={loud}
                aria-label="Le son, même en mode silencieux"
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full transition-colors after:absolute after:-inset-2 after:content-['']",
                  loud ? "bg-white text-ink" : "text-white/70 hover:text-white",
                )}
              >
                <Icon name="sound" size={18} stroke={2.4} />
              </button>
            )}
            <a
              href="/rapport"
              onClick={partir}
              aria-busy={enRoute}
              className="relative rounded-full px-1 text-note font-black text-white/70 no-underline transition-colors hover:text-white after:absolute after:-inset-x-3 after:-inset-y-3 after:content-['']"
            >
              {/* Les points en blanc plein, plus lisibles que le texte à 70 % sur le fond sombre de la révélation */}
              {enRoute ? <TypingDots size={5} color="white" label="Ton rapport arrive" /> : "Passer"}
            </a>
          </span>
        </div>

        {/* La carte : son contenu arrive par étapes */}
        <div key={card.id} data-vcard="" className="flex min-h-0 flex-1 flex-col justify-center py-5 [@media(max-height:600px)]:py-3">
          {card.id === "chiffres" && <Numbers story={story} heading={heading} step={step} />}
          {card.id === "verdict" && (
            <div className="flex flex-col items-center text-center">
              <p data-rise="" style={delai(0.05)} className="m-0 text-detail font-black text-elle">
                Le verdict
              </p>
              <div className="relative mt-4 flex size-[150px] items-center justify-center lg:size-[190px] [@media(max-height:600px)]:size-[110px]">
                <span
                  aria-hidden="true"
                  data-vglow=""
                  className="absolute -inset-14 rounded-full [background:radial-gradient(circle,rgba(255,79,154,0.55),rgba(255,79,154,0)_66%)]"
                />
                <PearlBurst />
                <span aria-hidden="true" data-drop="" className="relative text-[110px] leading-none lg:text-[140px] [@media(max-height:600px)]:text-[80px]">
                  {verdict.emoji}
                </span>
              </div>
              <h2
                ref={heading}
                tabIndex={-1}
                className="m-0 mt-4 text-[40px] font-black leading-[1.02] tracking-[-0.03em] outline-none [text-wrap:balance] lg:text-[54px] [@media(max-height:600px)]:text-[32px]"
              >
                {step}
                <Words text={verdict.title} from={0.85} />
              </h2>
              <p data-rise="" style={delai(1.45)} className="m-0 mt-3 max-w-[340px] text-[19px] font-extrabold leading-[1.35] text-white/75 lg:text-[21px]">
                {verdict.subtitle}
              </p>
              {card.confidence && (
                <p data-rise="" style={delai(1.75)} className="m-0 mt-6 flex items-center gap-2 text-note font-extrabold text-white/70 [@media(max-height:600px)]:mt-4">
                  <span className="rounded-full bg-vrai px-2.5 py-1 text-micro font-black leading-none text-ink">{CONFIDENCE[card.confidence.level]}</span>
                  {card.confidence.text}
                </p>
              )}
            </div>
          )}
          {card.id === "duel" && (
            <div className="flex flex-col">
              <h2 ref={heading} tabIndex={-1} data-rise="" className="m-0 text-detail font-black text-white/70 outline-none">
                {step}
                Entre vous deux
              </h2>
              <div data-rise="" style={delai(0.1)} className="mt-4 flex justify-between text-legende font-black">
                <span className="flex items-center gap-1.5 text-toi">
                  <span className="size-2 rounded-full bg-toi" />
                  Toi
                </span>
                <span className="flex items-center gap-1.5 text-elle">
                  {autre}
                  <span className="size-2 rounded-full bg-elle" />
                </span>
              </div>
              <ul className="m-0 mt-3 flex list-none flex-col gap-4 p-0 [@media(max-height:600px)]:gap-2.5">
                {card.rows.map((r, i) => (
                  <li key={r.label} data-rise="" style={delai(0.25 + i * 0.14)}>
                    <ScoreBar row={r} sombre autre={pronom} delay={0.45 + i * 0.14} />
                  </li>
                ))}
              </ul>
              {card.meaning && (
                <p
                  data-rise=""
                  style={delai(0.95)}
                  className="m-0 mt-7 text-titre-3 font-black leading-[1.2] tracking-[-0.02em] [text-wrap:balance] lg:text-[28px] [@media(max-height:600px)]:mt-4 [@media(max-height:600px)]:text-[20px]"
                >
                  {card.meaning}
                </p>
              )}
            </div>
          )}
          {card.id === "moment" && (
            <div className="flex flex-col">
              {card.kicker && (
                <p data-rise="" className="m-0 text-detail font-black text-elle">
                  {card.kicker}
                </p>
              )}
              <h2
                ref={heading}
                tabIndex={-1}
                data-rise=""
                style={delai(0.05)}
                className="m-0 mt-1.5 text-[32px] font-black leading-[1.05] tracking-[-0.02em] outline-none [text-wrap:balance] lg:text-[40px] [@media(max-height:600px)]:text-[26px]"
              >
                {step}
                {card.title}
              </h2>
              {/* La scène rejouée : elle écrit, puis toi */}
              <div className="mt-6 flex flex-col gap-2 [@media(max-height:600px)]:mt-4">
                {card.messages.map((m, i) => (
                  <Replay key={i} message={m} at={0.55 + i * 1.05} />
                ))}
              </div>
              {card.essential && (
                <p
                  data-rise=""
                  style={delai(0.55 + card.messages.length * 1.05 + 0.15)}
                  className="m-0 mt-6 text-[22px] font-black leading-[1.25] tracking-[-0.01em] [text-wrap:balance] lg:text-[26px] [@media(max-height:600px)]:mt-4 [@media(max-height:600px)]:text-[19px]"
                >
                  {card.essential}
                </p>
              )}
              {card.fact && (
                <p
                  data-rise=""
                  style={delai(0.55 + card.messages.length * 1.05 + 0.45)}
                  className="m-0 mt-3 flex items-start gap-2 text-note font-extrabold leading-[1.4] text-white/70"
                >
                  <span aria-hidden="true" className="mt-[5px] size-2 shrink-0 rounded-full bg-vrai" />
                  {card.fact}
                </p>
              )}
            </div>
          )}
          {card.id === "jouer" && (
            <div className="flex flex-col">
              <p data-rise="" className="m-0 flex items-center gap-1.5 text-detail font-black text-toi">
                <Icon name="bolt" size={16} stroke={2.4} className="text-toi" />À toi de jouer
              </p>
              {card.quote && (
                <span
                  data-rise=""
                  style={delai(0.15)}
                  className="mt-5 max-w-[86%] -rotate-2 self-start rounded-[20px] rounded-bl-[6px] bg-white/10 px-4 py-2.5 font-message text-corps font-bold leading-[1.3] text-white/85"
                >
                  {card.quote}
                </span>
              )}
              <h2
                ref={heading}
                tabIndex={-1}
                data-rise=""
                style={delai(0.35)}
                className="m-0 mt-5 text-[34px] font-black leading-[1.08] tracking-[-0.02em] outline-none [text-wrap:balance] lg:text-[44px] [@media(max-height:600px)]:text-[28px]"
              >
                {step}
                {card.text ?? "Ton rapport est prêt."}
              </h2>
            </div>
          )}
        </div>

        {/* En bas : reculer, avancer ; à la fin, le rapport */}
        {at < last ? (
          <div className="flex items-center justify-between gap-3">
            {at > 0 ? (
              <button
                type="button"
                onClick={() => go(at - 1)}
                aria-label="Précédent"
                className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15"
              >
                <Icon name="back" size={20} stroke={2.6} className="text-white" />
              </button>
            ) : (
              <span aria-hidden="true" className="size-11" />
            )}
            {at === 0 && (
              <span aria-hidden="true" className="text-note font-extrabold text-white/70">
                <span className="lg:hidden">Touche pour voir le verdict</span>
                <span className="hidden lg:inline">Clique pour voir le verdict</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => go(at + 1)}
              aria-label="Suivant"
              className="lift lift-sm flex size-14 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_-10px_rgba(255,79,154,0.6)]"
            >
              <Icon name="arrow" size={22} stroke={2.8} className="arrow-nudge text-ink" />
            </button>
          </div>
        ) : (
          <div data-rise="" style={delai(0.7)} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => go(at - 1)}
                aria-label="Précédent"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15"
              >
                <Icon name="back" size={20} stroke={2.6} className="text-white" />
              </button>
              <a
                href="/rapport"
                onClick={partir}
                aria-busy={enRoute}
                className="lift lift-sm flex h-[60px] flex-1 items-center justify-center gap-2.5 rounded-[30px] bg-white text-carte font-black text-ink no-underline shadow-[0_14px_36px_-12px_rgba(255,79,154,0.55)]"
              >
                {enRoute ? (
                  <TypingDots color="currentColor" label="Ton rapport arrive" />
                ) : (
                  <>
                    Voir mon rapport
                    <Icon name="arrow" size={20} stroke={2.8} />
                  </>
                )}
              </a>
            </div>
            <button
              type="button"
              onClick={() => setPartage(true)}
              aria-haspopup="dialog"
              className="mx-auto inline-flex h-11 items-center gap-2 px-3 text-detail font-black text-white/80 transition-colors hover:text-white"
            >
              <Icon name="share" size={16} color="currentColor" stroke={2.4} />
              Partager mon verdict
            </button>
          </div>
        )}
      </div>

      {/* Les touchers dans la fenêtre de partage n’avancent pas les cartes du verdict */}
      <div className="contents" onClick={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        {partageVu && <PartageSheet open={partage} onClose={() => setPartage(false)} />}
      </div>
    </main>
  );
}

/** Carte 1 : le nombre de messages défile jusqu’au vrai total, puis la durée, les applis, les vocaux. */
function Numbers({ story, heading, step }: { story: Story; heading: RefObject<HTMLHeadingElement | null>; step: ReactNode }) {
  const shown = useCountUp(story.totalMessages, 1300, 350);
  const apps = nombreDApplis(story);
  const facts = [story.durationLabel, `${apps} appli${apps > 1 ? "s" : ""}`, story.voiceCount ? `${story.voiceCount} voca${story.voiceCount > 1 ? "ux" : "l"}` : null].filter(
    Boolean,
  ) as string[];
  return (
    <div className="flex flex-col items-center text-center">
      <p data-rise="" className="m-0 text-detail font-black text-white/70">
        BLUSH a analysé
      </p>
      <h2 ref={heading} tabIndex={-1} className="m-0 mt-1 outline-none">
        {step}
        <span className="sr-only">{`${formatCount(story.totalMessages)} messages, du premier au dernier.`}</span>
        <span aria-hidden="true" className="block text-[clamp(64px,24vw,124px)] font-black leading-[0.95] tracking-[-0.045em] tabular-nums">
          {formatCount(shown)}
        </span>
        <span aria-hidden="true" data-rise="" style={delai(0.2)} className="mt-3 block text-[22px] font-black leading-[1.2] lg:text-[26px]">
          messages, du premier au dernier.
        </span>
      </h2>
      <ul className="m-0 mt-7 flex list-none flex-wrap justify-center gap-2 p-0">
        {facts.map((f, i) => (
          <li key={f} data-rise="" style={delai(1.35 + i * 0.12)} className="rounded-full bg-white/10 px-3.5 py-2 text-note font-black">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Le titre arrive mot par mot. */
function Words({ text, from }: { text: string; from: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span data-word="" className="inline-block" style={delai(from + i * 0.08)}>
            {w}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/** Les perles jaillissent quand l’emoji se pose. */
function PearlBurst() {
  const parts: { tx: number; ty: number; s: number; kind: SphereKind }[] = [
    { tx: -118, ty: -46, s: 22, kind: "opale" },
    { tx: 112, ty: -58, s: 18, kind: "nacre" },
    { tx: -96, ty: 42, s: 14, kind: "nacre" },
    { tx: 128, ty: 30, s: 26, kind: "opale" },
    { tx: -140, ty: 0, s: 11, kind: "nacre" },
    { tx: 70, ty: -92, s: 12, kind: "rose" },
    { tx: -60, ty: -96, s: 15, kind: "nacre" },
    { tx: 92, ty: 74, s: 14, kind: "rose" },
  ];
  return (
    <>
      {parts.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-burst=""
          className="absolute left-1/2 top-1/2"
          style={{ "--tx": `${p.tx}px`, "--ty": `${p.ty}px`, ...delai(0.62 + i * 0.03), width: p.s, height: p.s, margin: `-${p.s / 2}px 0 0 -${p.s / 2}px` }}
        >
          <Sphere size={p.s} kind={p.kind} shadow={false} />
        </span>
      ))}
    </>
  );
}

/** Un message rejoué : les trois points, puis la bulle (la vraie phrase, dans la police des messages). */
function Replay({ message, at }: { message: Message; at: number }) {
  const elle = message.from === "elle";
  return (
    <div className={cn("relative flex flex-col", elle ? "items-start" : "items-end")}>
      <span
        aria-hidden="true"
        data-once=""
        style={delai(at)}
        className={cn("absolute top-0 flex h-[44px] items-center rounded-[22px] px-4", elle ? "left-0 bg-white" : "right-0 bg-toi-ink")}
      >
        <span data-dots="" className="flex items-center gap-1">
          {[0, 1, 2].map((d) => (
            <span key={d} className={cn("size-[7px] rounded-full", elle ? "bg-muted" : "bg-white")} />
          ))}
        </span>
      </span>
      <span
        data-msg=""
        style={delai(at + 0.7)}
        className={cn(
          "max-w-[84%] rounded-[22px] px-4 py-2.5 font-message text-accent font-bold leading-[1.3]",
          elle ? "origin-bottom-left rounded-bl-[6px] bg-white text-ink" : "origin-bottom-right rounded-br-[6px] bg-toi-ink text-white",
        )}
      >
        {message.text}
      </span>
      {message.caption && (
        <span data-rise="" style={delai(at + 0.85)} className="mt-1 px-1 text-micro font-extrabold text-white/60">
          {message.caption}
        </span>
      )}
    </div>
  );
}

/** Un nombre qui défile jusqu’à sa valeur (tout de suite en mouvement réduit). */
function useCountUp(target: number, ms: number, wait: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (reduce) return setValue(target);
      if (!start) start = t + wait;
      const p = Math.min(1, Math.max(0, (t - start) / ms));
      setValue(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, wait]);
  return value;
}
