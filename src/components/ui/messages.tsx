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
          "px-[13px] py-[9px] font-message text-detail font-bold leading-[1.35]",
          her ? "rounded-[18px_18px_18px_6px] bg-bubble-her text-ink" : "rounded-[18px_18px_6px_18px] bg-bubble-me text-white",
        )}
      >
        {children}
      </span>
      {caption !== undefined && <span className="text-micro font-extrabold text-grey">{caption}</span>}
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
            <span data-vocal-rec="" className="size-[9px] rounded-full bg-danger" />
            <span className="text-note font-black text-ink">enregistre un vocal…</span>
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
export const BULLE_DE_BLUSH =
  "flex max-w-[318px] flex-col rounded-[20px] bg-white px-4 py-3 text-left text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.045),0_1px_2px_rgba(17,17,20,0.06)]";

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
  sur: { couleur: "var(--color-vrai-ink)", label: "Sûr" },
  probable: { couleur: "var(--color-attente-ink)", label: "Probable" },
  verifier: { couleur: "var(--color-flou-ink)", label: "À vérifier" },
  risque: { couleur: "var(--color-elle-ink)", label: "Risqué" },
  meilleur: { couleur: "var(--color-vrai-ink)", label: "Le meilleur" },
  conseille: { couleur: "var(--color-vrai-ink)", label: "Conseillé" },
  recommandee: { couleur: "var(--color-vrai-ink)", label: "Recommandée" },
  partager: { couleur: "var(--color-toi-ink)", label: "à partager" },
  verite: { couleur: "var(--color-vrai-ink)", label: "✓ la vérité" },
  apercu: { couleur: "var(--color-toi-ink)", label: "Aperçu gratuit" },
  actif: { couleur: "var(--color-vrai-ink)", label: "actif" },
  ink: { couleur: "var(--color-ink)" },
} as const satisfies Record<string, { couleur: string; label?: string }>;

export type TagTone = keyof typeof TAGS;

export function Tag({ tone, children, size = "sm", className }: { tone: TagTone; children?: ReactNode; size?: "sm" | "md"; className?: string }) {
  const { couleur, label }: { couleur: string; label?: string } = TAGS[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap font-black text-white",
        size === "sm" ? "h-[26px] rounded-[13px] px-2.5 text-micro" : "h-7 rounded-[14px] px-[11px] text-legende",
        className,
      )}
      /* La teinte du token, avec son reflet (sauf l’étiquette encre) */
      style={{
        background: tone === "ink" ? couleur : `var(--gloss), ${couleur}`,
        boxShadow: tone === "ink" ? undefined : "inset 0 -1px 0 rgba(0,0,0,0.1)",
      }}
    >
      {children ?? label}
    </span>
  );
}

/** Niveau de confiance + justification (ex. « Sûr · 12 preuves dans votre conv »). */
export function ConfidenceLine({ level, children, className }: { level: Confidence; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tag tone={level} />
      <span className="text-legende font-extrabold text-grey">{children}</span>
    </div>
  );
}

/** Ligne de constat avec pastille verte. */
export function Fact({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 text-detail font-extrabold leading-[1.4]">
      <Dot size={11} className="mt-[5px] bg-vrai" />
      <span>{children}</span>
    </div>
  );
}

/** Pastille ronde (remplace le caractère « ● », absent de Nunito). Sa couleur : une classe du token dans `className` (bg-toi). */
export function Dot({ size = 8, className }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size }} />;
}
