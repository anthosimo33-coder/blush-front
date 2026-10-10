import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { delai } from "@/lib/motion";
import { BubbleLogo } from "@/components/brand/objects3d";
import type { Confidence } from "@/types";

/* ———— Bulle : elle grise à gauche, toi bleue à droite. Figtree uniquement ici. ———— */
export function Bubble({
  from,
  children,
  caption,
  className,
  style,
}: {
  from: "elle" | "toi";
  children: ReactNode;
  caption?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const her = from === "elle";
  return (
    <div className={cn("flex max-w-[82%] flex-col gap-1", her ? "items-start self-start" : "items-end self-end", className)} style={style}>
      <span
        className={cn(
          "px-[13px] py-[9px] font-message text-[15px] font-bold leading-[1.35]",
          her ? "rounded-[18px_18px_18px_6px] bg-bubble-her text-ink" : "rounded-[18px_18px_6px_18px] bg-bubble-me text-white",
        )}
      >
        {children}
      </span>
      {caption !== undefined && <span className="text-[12px] font-extrabold text-grey">{caption}</span>}
    </div>
  );
}

/**
 * BLUSH écrit : sa bulle (le logo) arrive d’un bond, respire doucement, et ses trois perles s’allument
 * l’une après l’autre, comme les points de Messages, en rose (globals.css). `leaving` : elle se replie avant la réponse.
 */
export function BlushTyping({ label, leaving = false, vocal = false }: { label: string; leaving?: boolean; vocal?: boolean }) {
  return (
    <span role="status" className="block">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" data-typing={leaving ? "out" : ""} className="flex items-end gap-2">
        <span className="block">
          <BubbleLogo size={62} animated layered />
        </span>
        {/* La réponse part en vocal : « BLUSH enregistre », comme dans une messagerie */}
        {vocal && (
          <span className="mb-2 flex h-10 items-center gap-2 rounded-[20px] bg-white pl-3 pr-3.5 shadow-[0_0_0_1px_rgba(17,17,20,0.045),0_1px_2px_rgba(17,17,20,0.06)]">
            <span data-vocal-rec="" className="size-[9px] rounded-full bg-[#E5484D]" />
            <span className="text-[14px] font-black text-ink">enregistre un vocal…</span>
          </span>
        )}
      </span>
    </span>
  );
}

/* ———— Étiquettes de confiance et de statut ———— */
/* Teintes foncées : le texte blanc des étiquettes reste lisible (au moins 5:1). Sans libellé, l’étiquette dit ses enfants. */
const TAGS = {
  sur: { color: "#087A56", label: "Sûr" },
  probable: { color: "#A85800", label: "Probable" },
  verifier: { color: "#6D4BD8", label: "À vérifier" },
  risque: { color: "#C81D6B", label: "Risqué" },
  meilleur: { color: "#087A56", label: "Le meilleur" },
  conseille: { color: "#087A56", label: "Conseillé" },
  recommandee: { color: "#087A56", label: "Recommandée" },
  partager: { color: "#1A66DB", label: "à partager" },
  verite: { color: "#087A56", label: "✓ la vérité" },
  apercu: { color: "#1A66DB", label: "Aperçu gratuit" },
  actif: { color: "#087A56", label: "actif" },
  ink: { color: "#121214" },
} as const satisfies Record<string, { color: string; label?: string }>;

export type TagTone = keyof typeof TAGS;

export function Tag({
  tone,
  children,
  size = "sm",
  className,
}: {
  tone: TagTone;
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const { color, label }: { color: string; label?: string } = TAGS[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap font-black text-white",
        size === "sm" ? "h-[26px] rounded-[13px] px-2.5 text-[12px]" : "h-7 rounded-[14px] px-[11px] text-[13px]",
        className,
      )}
      style={{
        background: tone === "ink" ? color : `var(--gloss), ${color}`,
        boxShadow: tone === "ink" ? undefined : "inset 0 -1px 0 rgba(0,0,0,0.1)",
      }}
    >
      {children ?? label}
    </span>
  );
}

/** « ✕ ton pari » : ton pari raté, rose pâle. */
export function PariTag({ children = "✕ ton pari", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-[14px] bg-[rgba(255,79,154,0.12)] px-[11px] text-[13px] font-black text-elle-ink", className)}>
      {children}
    </span>
  );
}

/** Niveau de confiance + justification (ex. « Sûr · 12 preuves dans votre conv »). */
export function ConfidenceLine({ level, children, className }: { level: Confidence; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tag tone={level} />
      <span className="text-[13px] font-extrabold text-grey">{children}</span>
    </div>
  );
}

/* ———— Preuve : un vrai message daté, dans une carte ———— */
export function ProofCard({
  title = "La preuve, dans votre conv",
  children,
  conclusion,
  className,
}: {
  title?: string;
  children: ReactNode;
  conclusion?: ReactNode;
  className?: string;
}) {
  return (
    <div data-rise="" className={cn("flex flex-col gap-2.5 rounded-card bg-white p-3.5 shadow-card", className)} style={delai(0.15)}>
      <span className="text-[13px] font-black text-grey">{title}</span>
      {children}
      {conclusion && <span className="text-[15px] font-extrabold leading-[1.4]">{conclusion}</span>}
    </div>
  );
}

/** Ligne de constat avec pastille verte. */
export function Fact({ children, color = "#12C08A" }: { children: ReactNode; color?: string }) {
  return (
    <div className="flex gap-2 text-[15px] font-extrabold leading-[1.4]">
      <Dot color={color} size={11} className="mt-[5px]" />
      <span>{children}</span>
    </div>
  );
}

/** Pastille ronde (remplace le caractère « ● », absent de Nunito). */
export function Dot({ color, size = 8, className }: { color: string; size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: color }} />;
}
