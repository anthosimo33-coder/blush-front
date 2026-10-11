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
            <span data-vocal-rec="" className="size-[9px] rounded-full bg-danger-vif" />
            <span className="text-[14px] font-black text-ink">enregistre un vocal…</span>
          </span>
        )}
      </span>
    </span>
  );
}

/* ———— Le fil de BLUSH : ses bulles, groupées comme dans une messagerie ———— */

/** La place d’une bulle dans le groupe de son expéditeur : seule, première, au milieu ou dernière. Ses coins en dépendent. */
export type PlaceBulle = "single" | "first" | "middle" | "last";

/** La place de la bulle `i` dans un groupe de `n` bulles. */
export const placeDansLeGroupe = (i: number, n: number): PlaceBulle => (n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "middle");

/* Les coins resserrés du côté de l’expéditeur : les bulles d’un groupe se tiennent (BLUSH à gauche, toi à droite) */
const COINS = {
  blush: { single: "", first: "rounded-bl-[6px]", middle: "rounded-l-[6px]", last: "rounded-tl-[6px]" },
  toi: { single: "", first: "rounded-br-[6px]", middle: "rounded-r-[6px]", last: "rounded-tr-[6px]" },
} as const;

/** Les coins d’une bulle, d’après son côté et sa place dans le groupe. */
export const coinsDeBulle = (cote: keyof typeof COINS, place: PlaceBulle) => COINS[cote][place];

/** La bulle blanche de BLUSH : sa forme (318 px au plus), son fond et son filet. Aussi celle du fil de l’accueil (src/app/app/accueil/bulles.tsx). */
export const BULLE_DE_BLUSH = "flex max-w-[318px] flex-col rounded-[20px] bg-white px-4 py-3 text-left text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.045),0_1px_2px_rgba(17,17,20,0.06)]";

/**
 * Une bulle du fil de BLUSH, avant d’être posée : son contenu, son ton (`plain` la bulle blanche, `accent` le pas suivant,
 * `toi` ton message, `bare` une image), ses classes, et `quote`, le texte qu’on creuse en la glissant. Le fil de
 * l’accueil les pose (src/app/app/accueil/bulles.tsx, BubbleShape).
 */
export type BulleDeBlush = { body: ReactNode; tone?: "plain" | "accent" | "toi" | "bare"; className?: string; quote?: string };

/** Un vrai message de votre conv, cité par BLUSH. */
type MessageCite = { from: "elle" | "toi"; caption?: string; text: string };

/**
 * Un vrai message cité dans le fil : sa bulle (grise ou bleue, en Figtree) dans la bulle de BLUSH, un peu plus serrée.
 * `corps` : un autre rendu du même message (la bulle repliée des longs messages, ClampedBubble).
 */
export function citation(msg: MessageCite, corps?: ReactNode): BulleDeBlush {
  return {
    className: "pb-2.5 pt-3",
    quote: msg.text,
    body: corps ?? (
      <Bubble from={msg.from} caption={msg.caption}>
        {msg.text}
      </Bubble>
    ),
  };
}

/**
 * Les bulles de BLUSH, groupées comme dans le chat de l’accueil : elles montent l’une après l’autre, sa petite bulle
 * (le logo) à côté de la dernière, les coins resserrés entre elles.
 */
export function GroupeBulles({ bulles }: { bulles: ReactNode[] }) {
  const n = bulles.length;
  return (
    <div className="flex flex-col gap-[3px]">
      {bulles.map((b, i) => (
        <div key={i} data-rise="" className="flex items-end gap-2" style={delai(i * 0.08)}>
          {i === n - 1 ? <BubbleLogo size={34} className="-mb-0.5 shrink-0" /> : <span aria-hidden="true" className="w-[34px] shrink-0" />}
          <div className={cn(BULLE_DE_BLUSH, coinsDeBulle("blush", placeDansLeGroupe(i, n)))}>{b}</div>
        </div>
      ))}
    </div>
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
