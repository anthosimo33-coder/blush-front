import { cn } from "@/lib/cn";

/*
 * La petite bulle de BLUSH (son logo), dessinée une seule fois par page des guides et du lexique. Une page en pose une
 * dizaine (la signature, chaque bulle de BLUSH, « Ce que BLUSH regarde », les cartes, la couverture, la fin rose) : en
 * BubbleLogo, chacune redisait ses dégradés (et son flou, dès 44 px), et la page pesait bien plus. Ici, le dessin vit
 * dans DefsBulle, posé une fois par le cadre (./cadre.tsx), et chaque BulleMini le reprend par un <use>. Le même dessin
 * que BubbleLogo (src/components/brand/objects3d.tsx) : son corps rose, son ombre, son reflet, ses trois perles et leurs
 * ombres.
 */

/** L’id du dessin, unique dans la page. */
const ID = "bulle-blush";

/** Les deux perles de la bulle : nacrée, puis opale (la dernière). */
const PERLES = {
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
} as const;

/** Une perle : son ombre au sol, sa sphère et son reflet (à l’échelle des perles de BubbleLogo, 26 sur 100). */
function Perle({ cx, kind }: { cx: number; kind: keyof typeof PERLES }) {
  return (
    <g transform={`translate(${cx - 13} 88)`}>
      <ellipse cx="13" cy="27" rx="11" ry="4.6" fill={`url(#${ID}-s)`} />
      <g transform="scale(0.26)">
        <circle cx="50" cy="50" r="46" fill={`url(#${ID}-${kind})`} />
        <ellipse cx="35" cy="29" rx="15" ry="9" transform="rotate(-32 35 29)" fill="#FFFFFF" opacity="0.85" />
      </g>
    </g>
  );
}

/** Le dessin de la bulle, à poser une fois par page (le cadre) : invisible, il ne sert qu’aux BulleMini. */
export function DefsBulle() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute" focusable="false">
      <defs>
        <radialGradient id={`${ID}-b`} cx="0.3" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#FFD7EA" />
          <stop offset="0.32" stopColor="#FF7DBA" />
          <stop offset="0.72" stopColor="#E8358A" />
          <stop offset="1" stopColor="#A50F55" />
        </radialGradient>
        <linearGradient id={`${ID}-h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${ID}-o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#7A0035" stopOpacity="0" />
          <stop offset="1" stopColor="#7A0035" stopOpacity="0.32" />
        </linearGradient>
        <radialGradient id={`${ID}-s`}>
          <stop offset="0" stopColor="#6E0032" stopOpacity="0.33" />
          <stop offset="0.4" stopColor="#6E0032" stopOpacity="0.27" />
          <stop offset="0.7" stopColor="#6E0032" stopOpacity="0.14" />
          <stop offset="1" stopColor="#6E0032" stopOpacity="0" />
        </radialGradient>
        {(["nacre", "opale"] as const).map((kind) => (
          <radialGradient key={kind} id={`${ID}-${kind}`} cx="0.36" cy="0.3" r="0.78">
            {PERLES[kind].map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </radialGradient>
        ))}
        <g id={ID}>
          <path d="M60 55 H140 A45 45 0 0 1 140 145 H76 C68 153 57 159 44 161 C51 153 53 146 51 140 A45 45 0 0 1 60 55 Z" fill={`url(#${ID}-b)`} />
          <path d="M60 55 H140 A45 45 0 0 1 140 145 H76 C68 153 57 159 44 161 C51 153 53 146 51 140 A45 45 0 0 1 60 55 Z" fill={`url(#${ID}-o)`} />
          <path d="M64 62 H136 A34 34 0 0 1 163 76 C135 69 96 69 58 84 A38 38 0 0 1 64 62 Z" fill={`url(#${ID}-h)`} opacity="0.75" />
          <Perle cx={70} kind="nacre" />
          <Perle cx={100} kind="nacre" />
          <Perle cx={130} kind="opale" />
        </g>
      </defs>
    </svg>
  );
}

/** La petite bulle de BLUSH, à côté de ce qu’il dit : le dessin de DefsBulle, à la taille voulue. */
export function BulleMini({ size, className }: { size: number; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="30 40 150 136" className={cn("shrink-0 overflow-visible", className)}>
      <use href={`#${ID}`} />
    </svg>
  );
}
