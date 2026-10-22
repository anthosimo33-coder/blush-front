"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { BUBBLE_BODY, BubbleLogo, Sphere, type SphereKind } from "@/components/brand/objects3d";

/*
 * Les îlots du pied de page de la landing (PiedDePage.tsx) : ce qui répond au doigt (le téléphone qui sonne, le chat qui
 * miaule), les objets de la marque dont le code part déjà avec le logo (une perle, la bulle en autocollant), et la
 * sentinelle qui fige les boucles quand le pied de page sort de l’écran. Le reste du pied de page est rendu sur le serveur.
 */

/** Une perle de la marque, à la taille que lui donne sa classe (le SVG suit la boîte). */
export function Perle({ kind, className }: { kind: SphereKind; className?: string }) {
  return <Sphere size={100} kind={kind} shadow={false} className={className} />;
}

/**
 * La bulle BLUSH qui écrit, en autocollant : un contour blanc sous le logo, pour qu’il se détache sur le rose. Le logo
 * animé est en calques, placés au pixel près d’après `size` : il ne suit pas une boîte, d’où une taille par écran.
 */
export function LogoAutocollant({ size }: { size: number }) {
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} viewBox="30 40 150 136" className="absolute inset-0 overflow-visible">
        <path d={BUBBLE_BODY} fill="#ffffff" stroke="#ffffff" strokeWidth={12} strokeLinejoin="round" />
      </svg>
      <BubbleLogo size={size} animated />
    </span>
  );
}

/**
 * Fige les boucles du pied de page quand il sort de l’écran (data-hors-champ, globals.css) : rien ne tourne pour rien.
 * Et quand il est là, le fond de la page prend le rose foncé de son bas (data-pied-en-vue) : Safari, sur iPhone, peint ce
 * fond sous sa barre du bas, qui restait crème sous « blush ».
 */
export function PiedEnVue() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const pied = ref.current?.closest<HTMLElement>("[data-pied]");
    if (!pied) return;
    const racine = document.documentElement;
    const io = new IntersectionObserver(
      (entrees) =>
        entrees.forEach((e) => {
          pied.toggleAttribute("data-hors-champ", !e.isIntersecting);
          racine.toggleAttribute("data-pied-en-vue", e.isIntersecting);
        }),
      { rootMargin: "160px 0px" },
    );
    io.observe(pied);
    return () => {
      io.disconnect();
      pied.removeAttribute("data-hors-champ");
      racine.removeAttribute("data-pied-en-vue");
    };
  }, []);
  return <span ref={ref} hidden />;
}

/** Le chat miaule ; touché, BLUSH traduit (et retouché, il re-miaule). La bulle grandit vers le haut : sa place est par le bas. */
export function Miaou() {
  const [traduit, setTraduit] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={traduit}
      onClick={() => setTraduit((t) => !t)}
      className="lift lift-sm lift-rose block w-max max-w-[11.5em] rounded-[1.1em] rounded-br-[0.3em] bg-white px-[0.8em] py-[0.5em] text-left font-message text-ink shadow-[0_0.8em_1.6em_-0.7em_rgba(90,0,40,0.5)] lg:rounded-br-[1.1em] lg:rounded-bl-[0.3em]"
    >
      {traduit ? (
        <span data-rise="" className="block">
          <span className="block text-[max(12px,0.55em)] font-extrabold text-elle-ink">traduit par BLUSH</span>
          <span className="mt-[0.1em] block text-[0.86em] font-bold leading-[1.25]">je t’ai vu relire sa conv à 3{NBSP}h du mat</span>
        </span>
      ) : (
        <span className="block">
          <span className="block font-extrabold leading-[1.15]">miaou</span>
          <span className="mt-[0.1em] block text-[max(12px,0.55em)] font-bold text-grey">touche pour traduire</span>
        </span>
      )}
    </button>
  );
}

/** Le combiné d’un téléphone (rempli) : décrocher tel quel, raccrocher retourné. */
const COMBINE =
  "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z";

type Appel = "sonne" | "decroche" | "manque";

/**
 * Le téléphone du pied de page : ton crush appelle. Décroché, c’est BLUSH au bout du fil ; refusé, l’appel manqué. Tout
 * est en em (1 em = 1 px d’un téléphone de 240 px de large) : la taille du texte de sa place le met à l’échelle.
 * `photo` : celle de l’appel (une conv d’exemple de la landing).
 */
export function Telephone({ photo }: { photo: string }) {
  const [appel, setAppel] = useState<Appel>("sonne");
  /* La première sonnerie arrive avec la page ; ce qui suit un geste s’affiche en glissant */
  const [touche, setTouche] = useState(false);
  const aller = (a: Appel) => {
    setTouche(true);
    setAppel(a);
  };
  const glisse = touche ? "" : undefined;
  return (
    <div className="relative h-[30.625em] w-[15em]">
      {appel === "sonne" && <Ondes />}
      <div
        data-pied-sonne={appel === "sonne" ? "" : undefined}
        className="relative size-full rounded-[3.125em] p-[0.5625em] shadow-[inset_0_0_0_0.125em_rgba(255,255,255,0.14),0_2.5em_4.4em_-1.25em_rgba(90,0,40,0.65),0_0.75em_1.5em_-0.6em_rgba(0,0,0,0.4)] [background:linear-gradient(160deg,#3a3a42_0%,var(--ink)_45%)]"
      >
        <div
          aria-live="polite"
          className="relative size-full overflow-hidden rounded-[2.625em] text-white [background:radial-gradient(90%_60%_at_50%_22%,#6b2a55_0%,#2a1424_55%,var(--ink)_100%)]"
        >
          <span aria-hidden="true" className="absolute left-[4.5625em] top-[0.625em] h-[1.375em] w-[4.75em] rounded-full bg-black" />

          {appel === "sonne" && (
            <div data-rise={glisse} className="absolute inset-0">
              <p className="absolute inset-x-0 top-[3.75em] m-0 text-center">
                <span className="block text-[0.9375em] font-extrabold text-white/80">appel entrant…</span>
                <span className="mt-[0.1em] block text-[1.875em] font-black leading-[1.1] tracking-[-0.02em]">ton crush</span>
              </p>
              <span aria-hidden="true" className="absolute left-[3.6875em] top-[10em] size-[6.5em]">
                <span data-pied-halo="" className="absolute inset-0 rounded-full border-[0.125em] border-[#ff7dba]" />
                <span data-pied-halo="" className="absolute inset-0 rounded-full border-[0.125em] border-[#ff7dba]" style={{ animationDelay: "0.8s" }} />
                {/* eslint-disable-next-line @next/next/no-img-element -- une photo carrée de public/, déjà à sa taille (comme Avatar) */}
                <img
                  src={photo}
                  alt=""
                  width={256}
                  height={256}
                  loading="lazy"
                  decoding="async"
                  className="relative block size-full rounded-full object-cover shadow-[0_0_0_0.1875em_rgba(255,255,255,0.9)]"
                />
              </span>
              <div className="absolute inset-x-0 bottom-[2.125em] flex justify-around">
                <BoutonAppel raccroche label="Refuser l’appel" legende="refuser" onClick={() => aller("manque")} />
                <BoutonAppel label="Décrocher" legende="décrocher" onClick={() => aller("decroche")} />
              </div>
            </div>
          )}

          {appel === "decroche" && (
            <div data-rise={glisse} className="absolute inset-0">
              <p className="absolute inset-x-0 top-[3.25em] m-0 flex flex-col items-center">
                <BubbleLogo size={62} className="size-[3.875em]" />
                <span className="mt-[0.25em] text-[1.75em] font-black leading-[1.1] tracking-[-0.03em]">BLUSH</span>
                <span className="text-[0.9375em] font-extrabold text-white/80">en ligne · 0:07</span>
              </p>
              <p className="absolute inset-x-[0.875em] top-[12.75em] m-0 flex flex-col items-start gap-[0.375em] font-message text-[1.0625em] font-bold leading-[1.3] text-ink">
                <span className="rounded-[1.1em] rounded-bl-[0.35em] bg-white px-[0.85em] py-[0.5em]">allô{NBSP}?</span>
                <span className="rounded-[1.1em] rounded-bl-[0.35em] bg-white px-[0.85em] py-[0.5em]">t’as relu sa conv combien de fois là{NBSP}?</span>
              </p>
              <div className="absolute inset-x-0 bottom-[2.125em] flex justify-center">
                <BoutonAppel raccroche label="Raccrocher" legende="raccrocher" onClick={() => aller("sonne")} />
              </div>
            </div>
          )}

          {appel === "manque" && (
            <div data-rise={glisse} className="absolute inset-0">
              <p className="absolute inset-x-0 top-[3.75em] m-0 text-center">
                <span className="block text-[0.9375em] font-extrabold text-white/80">appel manqué</span>
                <span className="mt-[0.1em] block text-[1.875em] font-black leading-[1.1] tracking-[-0.02em]">ton crush</span>
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- la même photo, déjà chargée */}
              <img
                src={photo}
                alt=""
                aria-hidden="true"
                width={256}
                height={256}
                loading="lazy"
                decoding="async"
                className="absolute left-[4.0625em] top-[10em] block size-[5.75em] rounded-full object-cover opacity-80 grayscale-[0.7]"
              />
              <p className="absolute inset-x-[1.125em] top-[17.5em] m-0 text-center text-[1.25em] font-black leading-[1.2] [text-wrap:balance]">
                tu rappelles ou tu fais genre{NBSP}?
              </p>
              <div className="absolute inset-x-0 bottom-[2.5em] flex justify-center">
                <button
                  type="button"
                  onClick={() => aller("sonne")}
                  className="relative h-[3.25em] rounded-full bg-white px-[1.75em] text-[1.0625em] font-black text-ink transition-transform duration-150 after:absolute after:-inset-[0.4em] after:content-[''] active:scale-[0.96]"
                >
                  rappeler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un bouton rond de l’appel : décrocher (vert), refuser ou raccrocher (rouge, le combiné retourné), et sa légende. */
function BoutonAppel({ raccroche = false, label, legende, onClick }: { raccroche?: boolean; label: string; legende: string; onClick: () => void }) {
  return (
    <span className="flex flex-col items-center gap-[0.375em]">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "relative flex size-[3.75em] items-center justify-center rounded-full shadow-[inset_0_0.06em_0_rgba(255,255,255,0.3)] transition-transform duration-150 after:absolute after:-inset-[0.6em] after:rounded-full after:content-[''] active:scale-[0.92]",
          raccroche ? "bg-danger" : "bg-vrai",
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-[1.75em] fill-white", raccroche && "rotate-[135deg]")}>
          <path d={COMBINE} />
        </svg>
      </button>
      <span aria-hidden="true" className="text-[0.8125em] font-extrabold text-white/85">
        {legende}
      </span>
    </span>
  );
}

/** Les ondes de la sonnerie, deux de chaque côté : chacune un calque à soi, qui ne change que d’échelle et d’opacité. */
function Ondes() {
  const arc = (cote: "gauche" | "droite", grande: boolean) => (
    <svg
      key={`${cote}${grande}`}
      data-pied-onde=""
      viewBox="0 0 40 120"
      className={cn("absolute top-[8.125em] h-[7.5em] w-[2.5em] overflow-visible", cote === "gauche" ? "-left-[3.375em]" : "-right-[3.375em] -scale-x-100")}
      style={grande ? { animationDelay: "0.25s" } : undefined}
    >
      <path d={grande ? "M18 16 Q-6 60 18 104" : "M32 34 Q16 60 32 86"} fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {arc("gauche", false)}
      {arc("gauche", true)}
      {arc("droite", false)}
      {arc("droite", true)}
    </span>
  );
}
