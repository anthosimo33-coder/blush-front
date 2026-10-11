import { useId, type CSSProperties, type ReactNode } from "react";
import { Sphere, type SphereKind } from "@/components/brand/objects3d";
import { AppBadge } from "@/components/ui/Avatar";
import { SelectedCheck } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { delai } from "@/lib/motion";
import type { AppKind } from "@/types";

/*
 * Les archives de la planche (Q67) : des briques du design system « Le jeu » qu’aucun écran n’utilise plus. Elles
 * quittent src/components (le code mort ne s’y cache plus derrière la planche) sans être supprimées : une proposition
 * reste visible tant que l’équipe n’a pas tranché (AGENTS.md). La planche les montre dans sa section « Archives ».
 * Archivées le 11 octobre 2026, à revoir le 11 janvier 2027.
 * TODO(produit): au 11 janvier 2027, réutiliser chacune dans un écran ou la supprimer.
 */

/** La date de l’archivage et celle de la revue, montrées sous chaque brique. */
export const ARCHIVAGE = { le: "11 oct. 2026", revue: "11 janv. 2027" } as const;

/** Identifiant SVG unique et sûr pour les url(#…) */
function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Le cadenas en volume (la suite payante du rapport, avant le cadenas plat de LockRow). Ses teintes sont celles de l’objet. */
export function Lock3D({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  const u = useSvgId("lk");
  return (
    <svg aria-hidden="true" width={size} height={Math.round(size * 1.08)} viewBox="0 0 120 130" className={className} style={{ overflow: "visible", ...style }}>
      <defs>
        <linearGradient id={`${u}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7E8596" />
          <stop offset="0.22" stopColor="#F5F7FB" />
          <stop offset="0.45" stopColor="#AEB4C2" />
          <stop offset="0.68" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#6F7688" />
        </linearGradient>
        <radialGradient id={`${u}g`} cx="0.28" cy="0.18" r="1">
          <stop offset="0" stopColor="#FFF4C4" />
          <stop offset="0.3" stopColor="#FFD866" />
          <stop offset="0.7" stopColor="#F2A21C" />
          <stop offset="1" stopColor="#B86A06" />
        </radialGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#7A4300" stopOpacity="0" />
          <stop offset="1" stopColor="#7A4300" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`${u}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5A3405" />
          <stop offset="1" stopColor="#2E1A02" />
        </linearGradient>
        <filter id={`${u}f`} x="-50%" y="-300%" width="200%" height="700%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <ellipse cx="60" cy="126" rx="44" ry="5" fill="rgba(120,70,0,0.28)" filter={`url(#${u}f)`} />
      <path d="M34 60 V40 a26 26 0 0 1 52 0 V60" fill="none" stroke="#5E6474" strokeWidth="15" strokeLinecap="round" transform="translate(0 2)" />
      <path d="M34 60 V40 a26 26 0 0 1 52 0 V60" fill="none" stroke={`url(#${u}c)`} strokeWidth="13" strokeLinecap="round" />
      <path d="M40 38 a20 20 0 0 1 14 -18" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <rect x="10" y="52" width="100" height="70" rx="24" fill={`url(#${u}g)`} />
      <rect x="10" y="52" width="100" height="70" rx="24" fill={`url(#${u}o)`} />
      <rect x="18" y="57" width="84" height="18" rx="9" fill={`url(#${u}b)`} />
      <path d="M24 114 Q60 121 96 114" fill="none" stroke="#FFE6A3" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="60" cy="84" r="9.5" fill={`url(#${u}k)`} />
      <path d="M56 88 h8 l2 16 a2 2 0 0 1 -2 2 h-8 a2 2 0 0 1 -2 -2 z" fill={`url(#${u}k)`} />
      <path d="M53.5 90 a9 9 0 0 0 13 0" fill="none" stroke="#FFE2A0" strokeWidth="1.6" opacity="0.6" />
      <circle cx="26" cy="62" r="3" fill="#FFFFFF" opacity="0.9" />
    </svg>
  );
}

/** Les billes : composition nacre et opale de la planche « Objets 3D ». */
export function Marbles({ className }: { className?: string }) {
  const items: { kind: SphereKind; left: number; top: number; size: number }[] = [
    { kind: "opale", left: 0, top: 34, size: 46 },
    { kind: "nacre", left: 62, top: 0, size: 30 },
    { kind: "opale", left: 96, top: 54, size: 62 },
    { kind: "nacre", left: 44, top: 98, size: 22 },
    { kind: "nacre", left: 150, top: 20, size: 16 },
  ];
  return (
    <div className={className} style={{ position: "relative", width: 180, height: 140 }}>
      {items.map((it, i) => (
        <span key={i} aria-hidden="true" data-float="" style={{ position: "absolute", left: it.left, top: it.top, width: it.size, height: it.size }}>
          <Sphere size={it.size} kind={it.kind} shadow={false} />
        </span>
      ))}
    </div>
  );
}

/** La grande carte de choix (export complet ou captures), avant les tuiles d’applis du parcours. */
export function ChoiceCard({
  app,
  title,
  badge,
  badgeTone = "vrai",
  subtitle,
  selected = false,
  onClick,
}: {
  app: AppKind;
  title: string;
  badge?: string;
  badgeTone?: "vrai" | "toi";
  subtitle: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn("lift flex w-full items-center gap-3 rounded-card bg-white p-3.5 text-left text-ink", selected ? "shadow-selected" : "shadow-soft")}
    >
      <AppBadge app={app} className="lift-badge" />
      <span className="flex flex-1 flex-col gap-[5px]">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-carte font-black">{title}</span>
          {badge && (
            <span
              className={cn("inline-flex h-6 items-center rounded-xl px-2.5 text-micro font-black text-white", badgeTone === "vrai" ? "bg-vrai" : "bg-toi")}
              style={{ backgroundImage: "var(--gloss)", boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.1)" }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="text-legende font-bold leading-[1.35] text-grey">{subtitle}</span>
      </span>
      {selected && <SelectedCheck size={26} />}
    </button>
  );
}

/** « ✕ ton pari » : ton pari raté, rose pâle (le jeu des paris, retiré). */
export function PariTag({ children = "✕ ton pari", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-[14px] bg-[rgba(255,79,154,0.12)] px-[11px] text-legende font-black text-elle-ink", className)}>
      {children}
    </span>
  );
}

/** La preuve : un vrai message daté, dans une carte (le rapport montre aujourd’hui ses preuves dans « Ce qu’on voit »). */
export function ProofCard({ title = "La preuve, dans votre conv", children, conclusion }: { title?: string; children: ReactNode; conclusion?: ReactNode }) {
  return (
    <div data-rise="" className="flex flex-col gap-2.5 rounded-card bg-white p-3.5 shadow-card" style={delai(0.15)}>
      <span className="text-legende font-black text-grey">{title}</span>
      {children}
      {conclusion && <span className="text-detail font-extrabold leading-[1.4]">{conclusion}</span>}
    </div>
  );
}

/** Liste numérotée dans une carte (les étapes d’un export, avant les guides de l’import). */
export function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="m-0 flex list-none flex-col rounded-card bg-white px-5 py-1 shadow-card">
      {steps.map((s, i) => (
        <li key={i} className={cn("flex min-h-14 items-center gap-3.5 py-3", i > 0 && "border-t border-[rgba(17,17,20,0.07)]")}>
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-plaque text-legende font-black text-soft">{i + 1}</span>
          <span className="flex-1 text-corps font-extrabold leading-[1.35]">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Petite légende grise de carte (13 px, 900). */
export function CardLabel({ children }: { children: ReactNode }) {
  return <div className="text-legende font-black text-grey">{children}</div>;
}
