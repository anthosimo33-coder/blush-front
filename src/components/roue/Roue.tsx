"use client";

import { useId } from "react";
import { CASES_DE_LA_ROUE, ROUE } from "@/contenu/roue";
import { cn } from "@/lib/cn";

/*
 * La roue des cadeaux (la maquette G1 validée le 16 octobre) : huit cases roses, blanches et une opale (le gros lot),
 * l’anneau noir et ses perles de lumière, le logo au centre, l’aiguille en haut. Seules les cases tournent, dans un
 * calque HTML à part (une rotation que le compositeur joue, sans repeindre le reste) ; l’anneau, le centre et l’aiguille
 * restent fixes. `angle` : la rotation des cases, en degrés (la case k vient sous l’aiguille à −45 × k) ; `tourne` : la
 * rotation s’anime (le tour), sinon elle se pose sans transition. `gagnee` : la case sous l’aiguille, mise en avant, les
 * autres pâlies (« Gagné »). Un dessin : il ne prend aucun toucher (les cases qui tournent débordent de leur carré, en
 * biais, sur les boutons d’à côté).
 */

/** Le centre et le rayon des cases, dans le repère du dessin (300 × 300). */
const C = 150;
const R = 140;

/** Le point à cet angle (en degrés, 0 en haut, dans le sens des aiguilles d’une montre) et à ce rayon. */
const point = (deg: number, r: number) => {
  const t = (deg * Math.PI) / 180;
  return `${(C + r * Math.sin(t)).toFixed(1)} ${(C - r * Math.cos(t)).toFixed(1)}`;
};

/** Le chemin de la case k (45°, centrée sur k × 45°). */
const chemin = (k: number) => `M${C} ${C}L${point(k * 45 - 22.5, R)}A${R} ${R} 0 0 1 ${point(k * 45 + 22.5, R)}Z`;

/** Les perles de lumière de l’anneau : seize, entre les cases. */
const PERLES = Array.from(
  { length: 16 },
  (_, k) =>
    point(k * 22.5 + 11.25, 148)
      .split(" ")
      .map(Number) as [number, number],
);

/** La durée du tour, en millisecondes : l’écran attend sa fin pour dire « Gagné ». */
export const DUREE_DU_TOUR_MS = 4600;

export function Roue({ angle, tourne = false, gagnee = null, className }: { angle: number; tourne?: boolean; gagnee?: number | null; className?: string }) {
  const u = useId().replaceAll(":", "");
  const rose = `${u}rose`;
  const opale = `${u}opale`;
  return (
    <div role="img" aria-label={ROUE.description} className={cn("pointer-events-none relative aspect-square drop-shadow-[0_18px_24px_rgba(17,17,20,0.22)]", className)}>
      <svg aria-hidden="true" viewBox="-12 -16 324 328" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={rose} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF7AB6" />
            <stop offset="1" stopColor="#E8358A" />
          </linearGradient>
          <linearGradient id={opale} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A8FFE4" />
            <stop offset="0.35" stopColor="#8FC8FF" />
            <stop offset="0.68" stopColor="#E6A8FF" />
            <stop offset="1" stopColor="#FFD3A1" />
          </linearGradient>
        </defs>
      </svg>
      {/* Les cases, seules à tourner : un calque à part, centré comme le dessin (le repère commence à −12, −16) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `rotate(${angle}deg)`,
          transformOrigin: `${((C + 12) / 324) * 100}% ${((C + 16) / 328) * 100}%`,
          transition: tourne ? `transform ${DUREE_DU_TOUR_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)` : "none",
        }}
      >
        <svg viewBox="-12 -16 324 328" className="size-full overflow-visible">
          {CASES_DE_LA_ROUE.map((c, k) => (
            <path
              key={k}
              d={chemin(k)}
              fill={c.couleur === "rose" ? `url(#${rose})` : c.couleur === "opale" ? `url(#${opale})` : "#FFFFFF"}
              opacity={gagnee === null || gagnee === k ? 1 : 0.55}
              stroke={gagnee === k ? "#FFFFFF" : "none"}
              strokeWidth={gagnee === k ? 4 : 0}
            />
          ))}
          {CASES_DE_LA_ROUE.map((c, k) => {
            const encre = c.couleur === "rose" ? "#FFFFFF" : c.couleur === "opale" ? "var(--ink)" : "var(--color-elle-ink)";
            const long = c.haut.length > 6;
            /* « au prix du rapport » : deux lignes sous « Premium » */
            const bas = c.bas.length > 12 ? [c.bas.slice(0, c.bas.indexOf(" ", 4)), c.bas.slice(c.bas.indexOf(" ", 4) + 1)] : [c.bas];
            return (
              <g
                key={k}
                transform={`rotate(${k * 45} ${C} ${C})`}
                style={{ fontFamily: "var(--font-sans)", fill: encre }}
                textAnchor="middle"
                opacity={gagnee === null || gagnee === k ? 1 : 0.55}
              >
                <text x={C} y={long ? 50 : 52} fontSize={long ? 16 : c.haut.includes("%") ? 21 : 25} fontWeight={900}>
                  {c.haut}
                </text>
                {bas.map((ligne, i) => (
                  <text key={ligne} x={C} y={(long ? 65 : 70) + i * 12} fontSize={10.5} fontWeight={900}>
                    {ligne}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {/* L’anneau, ses perles, le centre et l’aiguille : fixes */}
      <svg aria-hidden="true" viewBox="-12 -16 324 328" className="absolute inset-0 size-full overflow-visible">
        <circle cx={C} cy={C} r={147} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth={12} />
        {PERLES.map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r={3.2} fill="#FFFFFF" />
        ))}
        <circle cx={C} cy={C} r={36} style={{ fill: "var(--ink)" }} />
        <circle cx={C} cy={C} r={31} fill="#FFFFFF" />
        <g transform="translate(131 136)">
          <path d="M10 2h24a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9H17l-8 6 1-6.2A9 9 0 0 1 1 19v-8a9 9 0 0 1 9-9z" fill={`url(#${rose})`} transform="scale(0.88)" />
          <circle cx={12} cy={13.2} r={3} fill="#FFFFFF" />
          <circle cx={19.4} cy={13.2} r={3} fill="#FFFFFF" />
          <circle cx={26.8} cy={13.2} r={3} fill={`url(#${opale})`} />
        </g>
        <path d="M138 -10 L162 -10 L150 22 Z" style={{ fill: "var(--ink)" }} stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** L’angle où la case k est sous l’aiguille, après `tours` tours complets (le tour part toujours dans le même sens). */
export const angleDeLaCase = (k: number, tours = 0) => tours * 360 - k * 45;
