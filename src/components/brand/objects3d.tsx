/* BLUSH · objets 3D « premium » en SVG — port fidèle de maquettes/objets-3d-source.py */
import { useId, type CSSProperties } from "react";
import { delai } from "@/lib/motion";

type Stop = readonly [string, string];

const SPHERE_STOPS = {
  nacre: [
    ["0", "#FFFFFF"],
    ["0.38", "#F3F1F7"],
    ["0.78", "#CEC8DB"],
    ["1", "#A79FBC"],
  ],
  opale: [
    ["0", "#FFFFFF"],
    ["0.16", "#DDFFF5"],
    ["0.4", "#A3D3FF"],
    ["0.64", "#E4B2FF"],
    ["0.86", "#FFC49B"],
    ["1", "#E39A86"],
  ],
  rose: [
    ["0", "#FFE3F1"],
    ["0.3", "#FF94C8"],
    ["0.7", "#E8358A"],
    ["1", "#9E0E4E"],
  ],
  vert: [
    ["0", "#D2FFEC"],
    ["0.3", "#53E8B4"],
    ["0.7", "#12C08A"],
    ["1", "#067554"],
  ],
  bleu: [
    ["0", "#E2F0FF"],
    ["0.3", "#7DB9FF"],
    ["0.7", "#3D8BFF"],
    ["1", "#1A55C4"],
  ],
} satisfies Record<string, readonly Stop[]>;

export type SphereKind = keyof typeof SPHERE_STOPS;

function Stops({ stops }: { stops: readonly Stop[] }) {
  return (
    <>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </>
  );
}

/** Identifiant SVG unique et sûr pour les url(#…) */
function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

type ObjProps = { size: number; className?: string; style?: CSSProperties };

export function Sphere({ size, kind = "nacre", shadow = true, className, style }: ObjProps & { kind?: SphereKind; shadow?: boolean }) {
  const u = useSvgId("sp");
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100" className={className} style={{ overflow: "visible", flexShrink: 0, ...style }}>
      <defs>
        <radialGradient id={`${u}g`} cx="0.36" cy="0.3" r="0.78">
          <Stops stops={SPHERE_STOPS[kind]} />
        </radialGradient>
        <radialGradient id={`${u}r`} cx="0.62" cy="0.92" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}s`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}f`} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      {shadow && <ellipse cx="50" cy="97" rx="30" ry="4.5" fill="rgba(60,40,80,0.22)" filter={`url(#${u}f)`} />}
      <circle cx="50" cy="50" r="46" fill={`url(#${u}g)`} />
      <circle cx="50" cy="50" r="46" fill={`url(#${u}r)`} />
      <ellipse cx="35" cy="29" rx="17" ry="10" transform="rotate(-32 35 29)" fill={`url(#${u}s)`} />
      <circle cx="29" cy="25" r="3.4" fill="#FFFFFF" />
    </svg>
  );
}

/** Le corps de la bulle du logo (viewBox 30 40 150 136) : le logo, et son contour d’autocollant (le pied de page de la landing). */
export const BUBBLE_BODY = "M60 55 H140 A45 45 0 0 1 140 145 H76 C68 153 57 159 44 161 C51 153 53 146 51 140 A45 45 0 0 1 60 55 Z";

/**
 * Le logo officiel : la bulle rose en volume, deux points nacre et un point opale.
 * `animated` : BLUSH écrit. Les perles s’allument l’une après l’autre, comme les trois points de Messages (globals.css).
 * Un logo qui peut s’animer (prop `animated` passée, même à false) est en calques par défaut : animées dans le SVG,
 * les perles repeindraient tout le logo à chaque image ; et basculer du SVG aux calques au premier mot le remonterait.
 */
export function BubbleLogo({
  size,
  dots = true,
  animated,
  layered,
  glow = true,
  className,
  style,
}: ObjProps & { dots?: boolean; animated?: boolean; layered?: boolean; glow?: boolean }) {
  const u = useSvgId("bp");
  const detail = size >= 44;
  if ((layered ?? animated !== undefined) && dots) return <LayeredBubbleLogo size={size} animated={!!animated} detail={detail} className={className} style={style} />;
  /*
   * L’ombre d’une perle. En petit (l’avatar du fil, sous chaque réponse), son flou est un dégradé radial : un
   * feGaussianBlur par perle se recalculait à chaque peinture de chaque avatar, pour un flou de moins d’un pixel.
   */
  const ombre = detail ? { rx: 9, ry: 2.6, fill: "rgba(110,0,50,0.35)", filter: `url(#${u}d)` } : { rx: 11, ry: 4.6, fill: `url(#${u}s)` };
  /* La perle et son ombre bougent séparément : quand la perle monte, son ombre se resserre */
  const dot = (cx: number, kind: "nacre" | "opale", i: number) => (
    <g key={cx} transform={`translate(${cx - 13} 88)`} style={{ "--i": i }}>
      <ellipse data-shade="" cx="13" cy="27" {...ombre} />
      <g data-pearl="">
        <svg x="0" y="0" width="26" height="26" viewBox="0 0 100 100">
          <defs>
            <radialGradient id={`${u}${kind}${cx}`} cx="0.36" cy="0.3" r="0.78">
              <Stops stops={SPHERE_STOPS[kind]} />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill={`url(#${u}${kind}${cx})`} />
          <ellipse cx="35" cy="29" rx="15" ry="9" transform="rotate(-32 35 29)" fill="#FFFFFF" opacity="0.85" />
        </svg>
      </g>
    </g>
  );
  return (
    <svg
      aria-hidden="true"
      data-live={animated ? "" : undefined}
      width={size}
      height={size}
      viewBox="30 40 150 136"
      className={className}
      style={{ overflow: "visible", flexShrink: 0, ...style }}
    >
      <defs>
        <radialGradient id={`${u}b`} cx="0.3" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#FFD7EA" />
          <stop offset="0.32" stopColor="#FF7DBA" />
          <stop offset="0.72" stopColor="#E8358A" />
          <stop offset="1" stopColor="#A50F55" />
        </radialGradient>
        <linearGradient id={`${u}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#7A0035" stopOpacity="0" />
          <stop offset="1" stopColor="#7A0035" stopOpacity="0.32" />
        </linearGradient>
        {/* Les flous ne servent qu’en grand (le halo, le reflet du bas, les ombres des perles) */}
        {detail && glow && (
          <filter id={`${u}c`} x="-50%" y="-300%" width="200%" height="700%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        )}
        {detail && (
          <filter id={`${u}d`} x="-50%" y="-300%" width="200%" height="700%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        )}
        {/* En petit, l’ombre floue des perles : le même rose, qui s’efface vers le bord (le profil d’un flou de 1,4) */}
        {!detail && dots && (
          <radialGradient id={`${u}s`}>
            <stop offset="0" stopColor="#6E0032" stopOpacity="0.33" />
            <stop offset="0.4" stopColor="#6E0032" stopOpacity="0.27" />
            <stop offset="0.7" stopColor="#6E0032" stopOpacity="0.14" />
            <stop offset="1" stopColor="#6E0032" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {detail && glow && <ellipse data-glow="" cx="102" cy="168" rx="52" ry="6" fill="rgba(190,20,100,0.28)" filter={`url(#${u}c)`} />}
      <path d={BUBBLE_BODY} fill={`url(#${u}b)`} />
      <path d={BUBBLE_BODY} fill={`url(#${u}o)`} />
      {detail && <path d="M66 141 Q100 151 140 142" fill="none" stroke="#FFC7E4" strokeWidth="3" strokeLinecap="round" opacity="0.65" filter={`url(#${u}d)`} />}
      <path d="M64 62 H136 A34 34 0 0 1 163 76 C135 69 96 69 58 84 A38 38 0 0 1 64 62 Z" fill={`url(#${u}h)`} opacity="0.75" />
      {detail && (
        <>
          <circle cx="150" cy="70" r="3.6" fill="#FFFFFF" opacity="0.9" />
          <circle cx="158" cy="80" r="1.8" fill="#FFFFFF" opacity="0.7" />
        </>
      )}
      {dots && <g>{[dot(70, "nacre", 0), dot(100, "nacre", 1), dot(130, "opale", 2)]}</g>}
    </svg>
  );
}

/**
 * Le même logo, perles, ombres et halo en calques HTML posés au même endroit.
 * Une animation dans un SVG repeint tout le logo à chaque image sur le fil principal (et saccade quand le téléphone est occupé) ;
 * en calques, la vague de « BLUSH écrit », les sauts quand tu tapes et le halo se jouent sur le compositeur.
 * Un bloc de la taille du logo, comme le SVG (un bloc lui aussi, par la base de Tailwind) : rien ne bouge autour.
 */
function LayeredBubbleLogo({ size, animated, detail, className, style }: ObjProps & { animated: boolean; detail: boolean }) {
  const u = useSvgId("bl");
  /* Le viewBox (30 40 150 136) remplit la largeur et se centre en hauteur */
  const k = size / 150;
  const oy = (size - 136 * k) / 2;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  const pearl = (cx: number, kind: "nacre" | "opale", i: number) => (
    <span key={cx} style={{ "--i": i }}>
      <span
        data-shade=""
        className="absolute rounded-full"
        style={{
          left: px((cx - 30 - 9) * k),
          top: px((115 - 40 - 2.6) * k + oy),
          width: px(18 * k),
          height: px(5.2 * k),
          background: "rgba(110,0,50,0.35)",
          filter: `blur(${px(1.4 * k)})`,
        }}
      />
      <span data-pearl="" className="absolute block" style={{ left: px((cx - 13 - 30) * k), top: px((88 - 40) * k + oy), width: px(26 * k), height: px(26 * k) }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }}>
          <defs>
            <radialGradient id={`${u}${kind}${cx}`} cx="0.36" cy="0.3" r="0.78">
              <Stops stops={SPHERE_STOPS[kind]} />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill={`url(#${u}${kind}${cx})`} />
          <ellipse cx="35" cy="29" rx="15" ry="9" transform="rotate(-32 35 29)" fill="#FFFFFF" opacity="0.85" />
        </svg>
      </span>
    </span>
  );
  return (
    <span
      aria-hidden="true"
      data-live={animated ? "" : undefined}
      className={["relative block shrink-0", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, ...style }}
    >
      {detail && (
        <span
          data-glow=""
          className="absolute rounded-full"
          style={{
            left: px((102 - 52 - 30) * k),
            top: px((168 - 6 - 40) * k + oy),
            width: px(104 * k),
            height: px(12 * k),
            background: "rgba(190,20,100,0.28)",
            filter: `blur(${px(5 * k)})`,
          }}
        />
      )}
      <BubbleLogo size={size} dots={false} glow={false} style={{ position: "absolute", left: 0, top: 0 }} />
      {pearl(70, "nacre", 0)}
      {pearl(100, "nacre", 1)}
      {pearl(130, "opale", 2)}
    </span>
  );
}

export function Bell3D({ size, className, style }: ObjProps) {
  const u = useSvgId("bl");
  return (
    <svg aria-hidden="true" width={size} height={Math.round(size * 1.08)} viewBox="0 0 120 130" className={className} style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id={`${u}g`} cx="0.32" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#EAF4FF" />
          <stop offset="0.3" stopColor="#8FC4FF" />
          <stop offset="0.72" stopColor="#3D8BFF" />
          <stop offset="1" stopColor="#1A4FB8" />
        </radialGradient>
        <linearGradient id={`${u}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5FA2FF" />
          <stop offset="1" stopColor="#1F55C2" />
        </linearGradient>
        <linearGradient id={`${u}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}p`} cx="0.36" cy="0.3" r="0.78">
          <Stops stops={SPHERE_STOPS.rose} />
        </radialGradient>
        <radialGradient id={`${u}k`} cx="0.36" cy="0.3" r="0.78">
          <Stops stops={SPHERE_STOPS.bleu} />
        </radialGradient>
        <filter id={`${u}f`} x="-50%" y="-300%" width="200%" height="700%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <ellipse cx="60" cy="125" rx="40" ry="5" fill="rgba(20,60,140,0.25)" filter={`url(#${u}f)`} />
      <path d="M14 46 q-6 12 0 24 M106 46 q6 12 0 24" fill="none" stroke="#8FC4FF" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <circle cx="60" cy="13" r="7" fill={`url(#${u}r)`} />
      <circle cx="60" cy="104" r="11" fill={`url(#${u}k)`} />
      <path d="M60 16 C37 16 27 34 27 54 V76 L17 90 H103 L93 76 V54 C93 34 83 16 60 16 Z" fill={`url(#${u}g)`} />
      <rect x="14" y="86" width="92" height="13" rx="6.5" fill={`url(#${u}r)`} />
      <rect x="20" y="87.5" width="80" height="3" rx="1.5" fill="#FFFFFF" opacity="0.45" />
      <path d="M40 32 C34 42 33 56 34 68" fill="none" stroke={`url(#${u}h)`} strokeWidth="7" strokeLinecap="round" opacity="0.8" />
      <circle cx="94" cy="26" r="15" fill={`url(#${u}p)`} />
      <ellipse cx="89" cy="20" rx="5" ry="3" fill="#FFFFFF" opacity="0.7" />
      <text x="94" y="31.5" textAnchor="middle" fontSize="16" fontWeight="900" fill="#FFFFFF" fontFamily="var(--font-nunito), sans-serif">
        1
      </text>
    </svg>
  );
}

function CheckBadge({ size, className, style }: ObjProps) {
  const u = useSvgId("ck");
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100" className={className} style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id={`${u}g`} cx="0.36" cy="0.28" r="0.8">
          <Stops stops={SPHERE_STOPS.vert} />
        </radialGradient>
        <radialGradient id={`${u}s`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}f`} x="-50%" y="-300%" width="200%" height="700%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${u}t`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <ellipse cx="50" cy="98" rx="32" ry="4.5" fill="rgba(6,110,80,0.3)" filter={`url(#${u}f)`} />
      <circle cx="50" cy="50" r="46" fill={`url(#${u}g)`} />
      <ellipse cx="36" cy="27" rx="18" ry="10" transform="rotate(-30 36 27)" fill={`url(#${u}s)`} />
      <path
        d="M30 53 L44 66 L71 37"
        fill="none"
        stroke="#065E44"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
        transform="translate(0 3)"
        filter={`url(#${u}t)`}
      />
      <path d="M30 53 L44 66 L71 37" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** La gerbe : coche verte et billes qui jaillissent (une réussite). */
export function CheckBurst({ size = 84, pop = false, className }: { size?: number; pop?: boolean; className?: string }) {
  const parts: { tx: number; ty: number; d: number; s: number; kind: SphereKind }[] = [
    { tx: -130, ty: -30, d: 0.1, s: 24, kind: "opale" },
    { tx: 120, ty: -40, d: 0.14, s: 20, kind: "nacre" },
    { tx: -100, ty: 34, d: 0.18, s: 15, kind: "nacre" },
    { tx: 140, ty: 26, d: 0.22, s: 28, kind: "opale" },
    { tx: -150, ty: 4, d: 0.26, s: 12, kind: "nacre" },
    { tx: 96, ty: -6, d: 0.3, s: 12, kind: "nacre" },
    { tx: -84, ty: -50, d: 0.34, s: 18, kind: "nacre" },
    { tx: 110, ty: 50, d: 0.38, s: 15, kind: "opale" },
  ];
  return (
    <div className={className} style={{ position: "relative", width: 300, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {parts.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-burst=""
          style={{
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            ...delai(p.d),
            position: "absolute",
            left: "50%",
            top: "50%",
            width: p.s,
            height: p.s,
            margin: `-${Math.floor(p.s / 2)}px 0 0 -${Math.floor(p.s / 2)}px`,
          }}
        >
          <Sphere size={p.s} kind={p.kind} shadow={false} />
        </span>
      ))}
      <span data-popin={pop ? "" : undefined} style={{ position: "relative", display: "flex" }}>
        <CheckBadge size={size} />
      </span>
    </div>
  );
}
