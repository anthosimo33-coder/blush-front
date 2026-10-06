import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
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
export function BlushTyping({ label, leaving = false }: { label: string; leaving?: boolean }) {
  return (
    <span role="status" className="block">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" data-typing={leaving ? "out" : ""} className="block">
        <span className="block">
          <BubbleLogo size={62} animated />
        </span>
      </span>
    </span>
  );
}

/* ———— Étiquettes de confiance et de statut ———— */
const TAG_COLOR: Record<string, string> = {
  /* Teintes foncées : le texte blanc des étiquettes reste lisible (au moins 5:1) */
  sur: "#087A56",
  probable: "#A85800",
  verifier: "#6D4BD8",
  risque: "#C81D6B",
  meilleur: "#087A56",
  conseille: "#087A56",
  recommandee: "#087A56",
  partager: "#1A66DB",
  verite: "#087A56",
  apercu: "#1A66DB",
  actif: "#087A56",
  ink: "#121214",
};

const TAG_LABEL: Record<string, string> = {
  sur: "Sûr",
  probable: "Probable",
  verifier: "À vérifier",
  risque: "Risqué",
  meilleur: "Le meilleur",
  conseille: "Conseillé",
  recommandee: "Recommandée",
  partager: "à partager",
  verite: "✓ la vérité",
  apercu: "Aperçu gratuit",
  actif: "actif",
};

export type TagTone = keyof typeof TAG_COLOR;

export function Tag({
  tone,
  children,
  size = "sm",
  className,
}: {
  tone: TagTone | Confidence;
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap font-black text-white",
        size === "sm" ? "h-[26px] rounded-[13px] px-2.5 text-[12px]" : "h-7 rounded-[14px] px-[11px] text-[13px]",
        className,
      )}
      style={{
        background: tone === "ink" ? "#121214" : `var(--gloss), ${TAG_COLOR[tone]}`,
        boxShadow: tone === "ink" ? undefined : "inset 0 -1px 0 rgba(0,0,0,0.1)",
      }}
    >
      {children ?? TAG_LABEL[tone]}
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
    <div data-rise="" className={cn("flex flex-col gap-2.5 rounded-card bg-white p-3.5 shadow-card", className)} style={{ "--d": "0.15s" } as CSSProperties}>
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
