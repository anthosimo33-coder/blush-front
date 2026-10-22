import type { Route } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { NOTE_DES_AVIS } from "@/contenu/paiement";
import { LogoIlot } from "@/components/shell/LogoIlot";
import { ctaDe, type Retour } from "./cta";
import { Cloche } from "./ilots";
import { LogoAutocollant, Miaou, PiedEnVue, Perle, Telephone } from "./ilots-pied";
import { CtaButton, SousLeBouton } from "./parts";

/*
 * Le pied de page de la landing, et son dernier appel : un grand bloc rose (les couleurs de la bulle du logo), le titre
 * géant, le bouton, puis le vrai pied de page (les liens) et « blush » en très grand, coupé par le bas. Autour, en
 * autocollants : les messages qu’on relit, le téléphone qui sonne (ton crush, et c’est BLUSH qui répond), la patte d’un
 * chat qui décroche, et le chat qui juge, assis sur le trait.
 *
 * Une scène dessinée pour le téléphone (390 de large) et pour l’ordi (1440), qui suit la largeur : chaque objet lit sa
 * place dans les deux (place(), .pied-objet dans globals.css). Les objets du haut se placent depuis le haut du bloc ;
 * ceux du bas depuis le trait, pour rester collés au chat quel que soit l’écran.
 * Tout ce qui bouge est un calque à soi qui ne change que transform ou opacity, et tout se fige hors de l’écran
 * (PiedEnVue). Rendu sur le serveur : seuls le téléphone, le miaou, les perles et la bulle sont des îlots.
 */

/** Une place dans une maquette : x, y depuis le haut (ou b, par le bas), la largeur l, la taille du texte t, la rotation r en degrés. */
type Place = { x: number; y?: number; b?: number; l?: number; t?: number; r?: number };

/** Une rotation, en degrés CSS. */
const degres = (r?: number) => (r === undefined ? undefined : `${r}deg`);

/** Les variables d’un objet (.pied-objet, globals.css) : sa place au téléphone, puis à l’ordi (null : absent de cet écran). */
function place(tel: Place | null, ordi: Place | null): CSSProperties {
  return {
    ...(tel && { "--x": tel.x, "--y": tel.y, "--b": tel.b, "--l": tel.l, "--t": tel.t, "--rm": degres(tel.r) }),
    ...(ordi && { "--X": ordi.x, "--Y": ordi.y, "--B": ordi.b, "--L": ordi.l, "--T": ordi.t, "--rd": degres(ordi.r) }),
  };
}

/** Le décalage d’une boucle qui flotte (data-float), pour que les autocollants ne bougent pas ensemble. */
const decale = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** L’objet qui n’est que d’un écran : au téléphone seulement, ou à l’ordi seulement. */
const SEULEMENT = { tel: "lg:hidden", ordi: "hidden lg:block" } as const;

export function PiedDePage({ retour }: { retour: Retour }) {
  const cta = ctaDe(retour);
  return (
    <footer
      data-pied=""
      className="relative isolate overflow-hidden rounded-t-[36px] text-white [background:linear-gradient(180deg,var(--elle)_0%,#e8358a_34%,var(--color-elle-ink)_56%,#a50f55_100%)] lg:rounded-t-[48px]"
    >
      <PiedEnVue />
      <div className="pied-scene relative mx-auto w-[calc(390*var(--m))] lg:w-[calc(1440*var(--u))]">
        {/* ———— Le dernier appel ———— */}
        <div className="pointer-events-none relative z-[2] flex flex-col items-center pt-[calc(352*var(--m))] text-center lg:pt-[calc(120*var(--u))]">
          <h2
            data-reveal=""
            className="m-0 text-[length:calc(88*var(--m))] font-black leading-[0.84] tracking-[-0.045em] [text-shadow:0_0.034em_0_rgba(140,0,70,0.22)] lg:text-[length:calc(176*var(--u))]"
          >
            <span className="sr-only">ta conv sait tout.</span>
            <span aria-hidden="true" className="block">
              ta c
              <span data-pied-saute="" className="mx-[0.015em] inline-block size-[0.5em] align-[-0.01em]">
                <Perle kind="opale" className="block size-full" />
              </span>
              nv
            </span>
            <span aria-hidden="true" className="block">
              sait
            </span>
            <span aria-hidden="true" className="block">
              tout.
            </span>
          </h2>
          <div data-reveal="" className="pointer-events-auto mt-[calc(28*var(--m))] flex flex-col items-center lg:mt-[calc(36*var(--u))]" style={{ "--reveal-delay": "80ms" }}>
            <CtaButton retour={retour} blanc className="sm:h-[68px] sm:rounded-[34px] sm:px-10 sm:text-[20px] lg:h-[72px] lg:rounded-[36px] lg:px-11 lg:text-[21px]" />
            <SousLeBouton retour={retour} surRose />
            {NOTE_DES_AVIS && (
              <p className="m-0 mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-note font-extrabold text-soft shadow-[0_10px_24px_-12px_rgba(90,0,40,0.5)]">
                <span aria-hidden="true" className="tracking-[0.04em] text-attente">
                  ★★★★★
                </span>
                <span>
                  <span className="font-black text-ink">{NOTE_DES_AVIS.note}</span> · {NOTE_DES_AVIS.nombre} avis de testeurs
                </span>
              </p>
            )}
          </div>
        </div>

        {/* ———— En haut : les messages qu’on relit, le téléphone qui sonne, la patte qui décroche ———— */}
        <Photo src="/convs/emma.webp" style={{ ...place({ x: 16, y: 40, l: 120, r: -9 }, { x: 80, y: 80, l: 230, r: -9 }) }} />
        <Bulle de="toi" style={{ ...place({ x: 12, y: 196, t: 15, r: -4 }, { x: 236, y: 58, t: 20, r: 5 }), ...decale(1.2) }}>
          je dors pas, je relis
        </Bulle>
        <Objet style={{ ...place({ x: 352, y: 612, l: 26 }, { x: 470, y: 60, l: 44 }), ...decale(0.6) }}>
          <Perle kind="nacre" className={OMBRE_PERLE} />
        </Objet>
        <Objet style={{ ...place({ x: 152, y: 30, l: 42, r: 16 }, { x: 930, y: 34, l: 74, r: 16 }), ...decale(0.9) }}>
          <Cloche size={132} className="h-auto w-full drop-shadow-[0_12px_14px_rgba(20,40,120,0.3)]" />
        </Objet>
        <Objet style={{ ...place({ x: 22, y: 262, l: 36 }, { x: 54, y: 400, l: 52 }), ...decale(1.8) }}>
          <Perle kind="bleu" className={OMBRE_PERLE} />
        </Objet>
        <div className="pied-objet z-[3]" style={place({ x: 214, y: 26, t: 10, r: 10 }, { x: 1110, y: 60, t: 16, r: 10 })}>
          <Telephone photo="/convs/yanis.webp" />
        </div>
        <div
          aria-hidden="true"
          data-float=""
          className="pied-objet pointer-events-none z-[5] flex flex-col items-start gap-[0.35em]"
          style={{ ...place({ x: 118, y: 256, t: 17, r: -5 }, { x: 950, y: 318, t: 22, r: -5 }), ...decale(0.3) }}
        >
          <span className={cn(BULLE, BULLES.autre)}>haha</span>
          {/* Il écrit… (les points de TypingDots, à l’échelle de la bulle) */}
          <span className={cn(BULLE, BULLES.autre, "flex h-[2.2em] items-center")}>
            <span data-dots="" className="inline-flex items-center gap-[0.25em] text-muted">
              <span className="block size-[0.36em] rounded-full bg-current" />
              <span className="block size-[0.36em] rounded-full bg-current" />
              <span className="block size-[0.36em] rounded-full [background:var(--degrade-perle)]" />
            </span>
          </span>
        </div>
        <div aria-hidden="true" className="pied-objet pointer-events-none z-[4]" style={place({ x: 291.5, y: 259, l: 105, r: -35 }, { x: 1254, y: 410, l: 190, r: -50 })}>
          <div data-pied-patte="">
            <Patte />
          </div>
        </div>

        {/* ———— En bas, depuis le trait : le chat et son miaou, les autres autocollants ———— */}
        <div className="relative mt-[calc(268*var(--m))] h-0 lg:mt-[calc(82*var(--u))]">
          <div aria-hidden="true" data-float="" className="pied-objet z-[3] lg:hidden" style={{ ...place({ x: 300, y: -255, r: 12 }, null), ...decale(1.4) }}>
            <LogoAutocollant size={72} />
          </div>
          {/* La bulle animée est en calques au pixel près : une taille par écran (petit ordi, puis grand) */}
          <div aria-hidden="true" data-float="" className="pied-objet z-[3] hidden lg:block xl:hidden" style={{ ...place(null, { x: 975, y: -236, r: -8 }), ...decale(1.4) }}>
            <LogoAutocollant size={112} />
          </div>
          <div aria-hidden="true" data-float="" className="pied-objet z-[3] hidden xl:block" style={{ ...place(null, { x: 940, y: -244, r: -8 }), ...decale(1.4) }}>
            <LogoAutocollant size={150} />
          </div>
          <Photo src="/convs/sacha.webp" style={{ ...place({ x: 24, y: -258, l: 104, r: -7 }, { x: 290, y: -480, l: 190, r: 8 }), ...decale(2) }} />
          <Bulle de="toi" style={{ ...place({ x: 104, y: -220, t: 15, r: 4 }, { x: 112, y: -370, t: 20, r: -6 }), ...decale(0.8) }}>
            je réponds quoi là{NBSP}?
          </Bulle>
          <Bulle de="blush" className={SEULEMENT.ordi} style={{ ...place(null, { x: 1000, y: -68, t: 20, r: 4 }), ...decale(2.4) }}>
            envoie la conv, je te dis tout
          </Bulle>
          <Objet className={SEULEMENT.ordi} style={{ ...place(null, { x: 1130, y: -190, l: 40 }), ...decale(1) }}>
            <Perle kind="opale" className={OMBRE_PERLE} />
          </Objet>
          <Objet className={SEULEMENT.ordi} style={{ ...place(null, { x: 880, y: -40, l: 30 }), ...decale(2.8) }}>
            <Perle kind="rose" className={OMBRE_PERLE} />
          </Objet>
          <div aria-hidden="true" className="pied-objet pointer-events-none z-[4]" style={place({ x: 228, y: -163.6, l: 150 }, { x: 40, y: -229.1, l: 210 })}>
            <Chat />
          </div>
          <div className="pied-objet z-[5]" style={place({ x: 62, b: 50, t: 19, r: 3 }, { x: 222, b: 174, t: 22, r: -3 })}>
            <Miaou />
          </div>
        </div>

        {/* ———— Le vrai pied de page ———— */}
        <div aria-hidden="true" className="relative z-[3] mx-[calc(22*var(--m))] h-0.5 rounded-full bg-white/40 lg:mx-[calc(64*var(--u))]" />
        <div className="relative z-[3] mx-[calc(22*var(--m))] mt-3 flex flex-col gap-1 lg:mx-[calc(64*var(--u))] lg:mt-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex h-11 items-center gap-3">
            <LogoIlot size={30} fontSize={22} href="/" onInk />
            <span className="whitespace-nowrap text-legende font-extrabold">© 2026</span>
          </div>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-5 text-accent font-black lg:gap-x-6 xl:gap-x-8 xl:text-carte">
            <LienDuPied href={cta.href} scroll={cta.scroll}>
              {cta.label}
            </LienDuPied>
            <LienDuPied href={retour ? "/compte" : "/connexion"}>{retour ? "Mon compte" : "Se connecter"}</LienDuPied>
            <LienDuPied href="/confidentialite">Confidentialité</LienDuPied>
            <LienDuPied href="/conditions">Conditions</LienDuPied>
            <LienDuPied href="/mentions-legales">Mentions légales</LienDuPied>
          </nav>
        </div>
        <p
          aria-hidden="true"
          className="pointer-events-none m-0 mb-[-0.111em] mt-[calc(28*var(--m))] select-none whitespace-nowrap text-center text-[length:calc(150*var(--m))] font-black leading-[0.72] tracking-[-0.05em] lg:mt-[calc(65*var(--u))] lg:text-[length:calc(500*var(--u))]"
        >
          blush
        </p>
      </div>
    </footer>
  );
}

/** Un lien du pied de page, en blanc, souligné au survol. */
function LienDuPied({ href, scroll, children }: { href: Route; scroll?: boolean; children: ReactNode }) {
  return (
    <Link href={href} scroll={scroll} className="flex min-h-11 items-center whitespace-nowrap text-white no-underline decoration-2 underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** L’ombre d’une perle qui flotte, peinte une fois sur son SVG (pas sur le calque qui bouge). */
const OMBRE_PERLE = "block size-full drop-shadow-[0_10px_12px_rgba(110,0,50,0.3)]";

/** Un objet qui flotte (data-float) : sa boîte est carrée, à la largeur de sa place. */
function Objet({ className, style, children }: { className?: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div aria-hidden="true" data-float="" className={cn("pied-objet pointer-events-none z-[1] aspect-square", className)} style={style}>
      {children}
    </div>
  );
}

/* Une bulle de message, comme celles du bloc du quotidien (parts.tsx), à l’échelle de sa place (tout en em) */
const BULLE = "block whitespace-nowrap rounded-[1.29em] px-[0.94em] py-[0.59em] font-message font-bold leading-[1.25] shadow-[0_0.9em_1.8em_-0.8em_rgba(90,0,40,0.5)]";
/** Qui parle : toi (bleu, à droite), l’autre (blanc, à gauche), BLUSH (papier, sous sa bulle). */
const BULLES = {
  toi: "rounded-br-[0.35em] bg-toi-ink text-white",
  autre: "rounded-bl-[0.35em] bg-white text-ink",
  blush: "rounded-tl-[0.35em] bg-paper text-ink",
} as const;

/** Un message en autocollant, qui flotte. */
function Bulle({ de, className, style, children }: { de: keyof typeof BULLES; className?: string; style: CSSProperties; children: ReactNode }) {
  return (
    <span aria-hidden="true" data-float="" className={cn("pied-objet pointer-events-none z-[5]", className)} style={style}>
      <span className={cn(BULLE, BULLES[de])}>{children}</span>
    </span>
  );
}

/** Une photo en autocollant (une conv d’exemple de la landing), au bord blanc, qui flotte. */
function Photo({ src, style }: { src: string; style: CSSProperties }) {
  return (
    <span aria-hidden="true" data-float="" className="pied-objet pointer-events-none z-[1]" style={style}>
      <span className="block rounded-[16.5%/13.6%] bg-white p-[3%] shadow-[0_24px_48px_-20px_rgba(90,0,40,0.6)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- une photo carrée de public/, déjà à sa taille (comme Avatar) */}
        <img src={src} alt="" width={256} height={256} loading="lazy" decoding="async" className="block aspect-[23/28] w-full rounded-[14.4%/11.7%] object-cover" />
      </span>
    </span>
  );
}

/** Les quatre coussinets des doigts : leur centre, et leur inclinaison en degrés. */
const COUSSINETS = [
  { cx: 70, cy: 108, r: -30 },
  { cx: 106, cy: 78, r: -10 },
  { cx: 146, cy: 78, r: 10 },
  { cx: 182, cy: 108, r: 30 },
];

/**
 * La patte d’un chat, rose et toute douce, qui sort du bord pour décrocher. Son bras est très long : il sort du bloc à
 * toutes les largeurs. Le flou de la fourrure ne se calcule qu’une fois : c’est son calque entier qui bouge (data-pied-patte).
 */
function Patte() {
  return (
    <svg viewBox="0 0 220 330" className="block h-auto w-full overflow-visible drop-shadow-[0_20px_26px_rgba(110,0,50,0.35)]">
      <defs>
        <radialGradient id="pied-fourrure" cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.25" stopColor="#FFE1EF" />
          <stop offset="0.62" stopColor="#FFB3D6" />
          <stop offset="1" stopColor="#F06BAA" />
        </radialGradient>
        <linearGradient id="pied-bras" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFD3E7" />
          <stop offset="0.55" stopColor="#FFB0D4" />
          <stop offset="1" stopColor="#EC63A3" />
        </linearGradient>
        <radialGradient id="pied-coussinet" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFE3F1" />
          <stop offset="0.4" stopColor="#FF7DBA" />
          <stop offset="0.82" stopColor="#E8358A" />
          <stop offset="1" stopColor="#B8125F" />
        </radialGradient>
        <filter id="pied-poils" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale={7} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#pied-poils)">
        <path d="M72 190 C60 260 64 420 76 1400 L208 1400 C214 420 210 260 194 190 Z" fill="url(#pied-bras)" />
        <ellipse cx="126" cy="132" rx="92" ry="86" fill="url(#pied-fourrure)" />
      </g>
      {COUSSINETS.map(({ cx, cy, r }) => (
        <g key={cx} transform={`rotate(${r} ${cx} ${cy})`}>
          <ellipse cx={cx} cy={cy} rx="17" ry="22" fill="url(#pied-coussinet)" />
          <ellipse cx={cx - 3} cy={cy - 9} rx="5" ry="3" fill="#FFFFFF" opacity="0.6" />
        </g>
      ))}
      <path d="M126 134 C152 134 174 152 174 172 C174 192 152 200 126 192 C100 200 78 192 78 172 C78 152 100 134 126 134 Z" fill="url(#pied-coussinet)" />
      <ellipse cx="112" cy="148" rx="12" ry="5" transform="rotate(-12 112 148)" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}

/**
 * Le chat noir qui juge, joues roses et collier BLUSH, assis sur le trait. Quatre calques du même dessin (la queue
 * derrière, le corps, les yeux, la tête devant) : seuls la queue qui bat et les yeux qui clignent bougent, chacun sur son
 * calque, sans repeindre le reste. Ses yeux regardent sa bulle : à gauche au téléphone, à droite à l’ordi (.pied-pupilles).
 */
function Chat() {
  const calque = "absolute inset-0 size-full overflow-visible";
  return (
    <span className="relative block aspect-[220/250]">
      <svg viewBox="0 0 220 250" data-pied-queue="" className={cn(calque, "origin-[77.3%_90.4%]")}>
        <path d="M168 228 C214 228 226 178 204 152 C194 140 198 124 212 128" fill="none" stroke="#17171B" strokeWidth="20" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 220 250" className={calque}>
        <defs>
          <radialGradient id="pied-chat" gradientUnits="userSpaceOnUse" cx="84" cy="64" r="200">
            <stop offset="0" stopColor="#4A4A54" />
            <stop offset="0.35" stopColor="#232329" />
            <stop offset="1" stopColor="#0B0B0E" />
          </radialGradient>
          <filter id="pied-ombre" x="-50%" y="-300%" width="200%" height="700%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <ellipse cx="112" cy="243" rx="80" ry="7" fill="rgba(80,0,40,0.35)" filter="url(#pied-ombre)" />
        <path d="M44 240 C30 186 56 134 112 132 C168 134 194 186 180 240 Z" fill="url(#pied-chat)" />
        <ellipse cx="88" cy="238" rx="19" ry="10" fill="#26262C" />
        <ellipse cx="136" cy="238" rx="19" ry="10" fill="#26262C" />
        <path d="M50 84 L46 16 L100 52 Z" fill="url(#pied-chat)" stroke="#1A1A1F" strokeWidth="10" strokeLinejoin="round" />
        <path d="M174 84 L178 16 L124 52 Z" fill="url(#pied-chat)" stroke="#1A1A1F" strokeWidth="10" strokeLinejoin="round" />
        <path d="M58 70 L56 34 L84 54 Z" fill="#FF7DBA" stroke="#FF7DBA" strokeWidth="4" strokeLinejoin="round" />
        <path d="M166 70 L168 34 L140 54 Z" fill="#FF7DBA" stroke="#FF7DBA" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="112" cy="100" rx="70" ry="60" fill="url(#pied-chat)" />
        <ellipse cx="82" cy="66" rx="22" ry="10" transform="rotate(-24 82 66)" fill="#FFFFFF" opacity="0.13" />
      </svg>
      <svg viewBox="0 0 220 250" data-pied-clin="" className={cn(calque, "origin-[50%_40%]")}>
        <ellipse cx="86" cy="100" rx="15" ry="17" fill="#FFD36B" />
        <ellipse cx="138" cy="100" rx="15" ry="17" fill="#FFD36B" />
        <g className="pied-pupilles">
          <ellipse cx="92" cy="102" rx="5.5" ry="13" className="fill-ink" />
          <ellipse cx="144" cy="102" rx="5.5" ry="13" className="fill-ink" />
          <circle cx="95" cy="96" r="3.2" fill="#FFFFFF" />
          <circle cx="147" cy="96" r="3.2" fill="#FFFFFF" />
        </g>
      </svg>
      <svg viewBox="0 0 220 250" className={calque}>
        {/* Les paupières mi-closes (l’air blasé), de la couleur de la tête */}
        <path d="M68 94 Q86 85 104 94 L104 76 L68 76 Z" fill="url(#pied-chat)" />
        <path d="M120 94 Q138 85 156 94 L156 76 L120 76 Z" fill="url(#pied-chat)" />
        <path d="M70 93 Q86 85.5 102 93 M122 93 Q138 85.5 154 93" fill="none" stroke="#000000" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="68" cy="124" rx="14" ry="8" className="fill-elle" opacity="0.6" />
        <ellipse cx="156" cy="124" rx="14" ry="8" className="fill-elle" opacity="0.6" />
        <path d="M105 118 Q112 113 119 118 Q112 127 105 118 Z" fill="#FF7DBA" />
        <path d="M112 124 Q107 132 100 128 M112 124 Q117 132 124 128" fill="none" stroke="#6A6A72" strokeWidth="2.6" strokeLinecap="round" />
        <g stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round">
          <path d="M64 116 L26 108 M64 124 L24 128 M160 116 L198 108 M160 124 L200 128" />
        </g>
        <path d="M70 157 Q112 177 154 157" fill="none" className="stroke-elle" strokeWidth="10" strokeLinecap="round" />
        <circle cx="112" cy="174" r="9" fill="#E8358A" />
        <ellipse cx="109" cy="171" rx="3" ry="2" fill="#FFFFFF" opacity="0.7" />
      </svg>
    </span>
  );
}
