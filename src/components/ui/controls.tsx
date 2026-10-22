"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/hooks";
import type { AppKind } from "@/types";
import type { AttributsLibres } from "./attributs";
import { AppBadge } from "./Avatar";
import { Icon, type IconName } from "./icons";

/* ———— Chip ———— */
/** Ce qui fait une pastille : un lien (`href`), un bouton à bascule (`onClick`, le seul qu’on désactive), ou une étiquette. */
type FormeChip =
  | { href: Route; onClick?: undefined; disabled?: undefined }
  | { onClick: () => void; disabled?: boolean; href?: undefined }
  | { href?: undefined; onClick?: undefined; disabled?: undefined };

/** Une pastille : un lien avec `href`, un bouton à bascule avec `onClick` (`disabled` possible), une étiquette sinon ; les aria-* et data-* vont sur l’élément. */
export function Chip({
  children,
  selected = false,
  onClick,
  href,
  disabled,
  className,
  ...rest
}: {
  children: ReactNode;
  selected?: boolean;
  className?: string;
} & FormeChip &
  AttributsLibres) {
  const cls = cn(
    "inline-flex h-9 items-center whitespace-nowrap rounded-[18px] px-3.5 text-note font-black",
    selected ? "bg-ink text-white shadow-ink" : "bg-white text-ink shadow-soft",
    (onClick || href) && "lift lift-sm relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
    (onClick || href) && selected && "lift-ink",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" aria-pressed={selected} onClick={onClick} disabled={disabled} className={cls} {...rest}>
        {children}
      </button>
    );
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}

/* ———— Copier en un geste ———— */
/**
 * La pastille « Copier » : un toucher copie `text` (avec le son de la copie), et elle dit « Copié » deux secondes.
 * `label` : ce qu’elle dit avant (« Copier », « Copier le message »). Une copie refusée par le navigateur ne change rien.
 */
export function CopyPill({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const minuteur = useRef<number | undefined>(undefined);
  /* Démontée pendant ses deux secondes de « Copié » : le minuteur part avec elle */
  useEffect(() => () => window.clearTimeout(minuteur.current), []);
  const copier = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={() => void copier()}
      className={cn("lift lift-sm inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-legende font-black text-ink shadow-soft", className)}
    >
      <Icon name={copied ? "check" : "copy"} size={14} stroke={2.6} className="text-ink" />
      {copied ? "Copié" : label}
    </button>
  );
}

/* ———— Groupe de radios au clavier ———— */
/** Les touches qui passent d’une option à l’autre : la suivante, la précédente, la première, la dernière. */
const DEPLACEMENTS: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * Un groupe de radios comme le veut l’ARIA : un seul arrêt de tabulation (l’option cochée, ou la première si rien ne
 * l’est), et les flèches qui passent à l’option voisine en la choisissant (en boucle), Début et Fin aux extrémités.
 * Les options sont les `[role="radio"]` du groupe, des boutons qui choisissent au toucher : la flèche les touche
 * (`click()`), l’écran ne fait rien de plus. À poser sur l’élément `role="radiogroup"` (`ref` et `onKeyDown`).
 */
function useRovingRadio<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const options = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].filter((o) => !o.matches(":disabled"));
  /* Après chaque rendu (une option cochée a pu changer) : l’arrêt de tabulation suit l’option cochée */
  useLayoutEffect(() => {
    const os = options();
    const arret = os.find((o) => o.getAttribute("aria-checked") === "true") ?? os[0];
    os.forEach((o) => (o.tabIndex = o === arret ? 0 : -1));
  });
  const onKeyDown = (e: KeyboardEvent<T>) => {
    const deplacer = DEPLACEMENTS[e.key];
    if (!deplacer || e.altKey || e.ctrlKey || e.metaKey) return;
    const os = options();
    const i = os.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const suivante = os[deplacer(i, os.length)];
    if (!suivante) return;
    suivante.focus();
    if (suivante.getAttribute("aria-checked") !== "true") suivante.click();
  };
  return { ref, onKeyDown };
}

/** Le nom d’un groupe de radios, obligatoire : son texte (`label`), ou l’id de son titre visible (`labelledBy`). */
type NomDuGroupe = { label: string; labelledBy?: never } | { labelledBy: string; label?: never };

/** Un groupe de radios (`role="radiogroup"`), parcouru aux flèches du clavier (useRovingRadio). Son nom : `label`, ou l’id de son titre. */
export function RadioGroup({ label, labelledBy, className, children }: NomDuGroupe & { className?: string; children: ReactNode }) {
  const { ref, onKeyDown } = useRovingRadio<HTMLDivElement>();
  return (
    <div ref={ref} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  );
}

/* ———— Segmented (deux options) ———— */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <RadioGroup label={label} className={cn("flex h-12 rounded-3xl bg-segment p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-[20px] text-detail font-black transition-colors",
              on ? "bg-white text-ink shadow-[0_2px_6px_rgba(17,17,20,0.08)]" : "text-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </RadioGroup>
  );
}

/* ———— Switch : 52 × 32, glissement 300 ms sans rebond ———— */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative flex h-8 w-[52px] shrink-0 items-center rounded-2xl p-[3px] transition-[background] duration-300 before:absolute before:-inset-1.5 before:content-['']"
      style={{ background: checked ? "linear-gradient(120deg, var(--vrai), var(--toi))" : "var(--line)" }}
    >
      <span
        className="size-[26px] rounded-[13px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-out"
        style={{ transform: checked ? "translateX(20px)" : "none" }}
      />
    </button>
  );
}

/* ———— Coche noire (sélection) ———— */
export function SelectedCheck({ size = 24 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-ink" style={{ width: size, height: size }} aria-hidden="true">
      <Icon name="check" size={Math.round(size * 0.54)} stroke={3.4} className="text-white" />
    </span>
  );
}

/* ———— Tuile d’appli (écran 01) ———— */
export function AppTile({
  app,
  title,
  subtitle,
  href,
  onClick,
  className,
}: {
  app: AppKind;
  title: string;
  subtitle: string;
  href: Route;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link href={href} onClick={onClick} className={cn("lift relative flex flex-col items-start gap-2.5 rounded-card bg-white p-4 text-ink no-underline shadow-soft", className)}>
      <AppBadge app={app} className="lift-badge" />
      {/* Desktop : un chevron centré sur la pastille (remplit le coin vide, dit « on y va ») */}
      <Icon name="chevron" size={18} stroke={2.6} className="lift-chev absolute right-4 top-[30px] hidden lg:block text-muted" />
      <span className="flex flex-col gap-0.5">
        <span className="text-accent font-black">{title}</span>
        <span className="text-micro font-extrabold text-grey">{subtitle}</span>
      </span>
    </Link>
  );
}

/* ———— Tuile de choix (écran 06) : une option d’un RadioGroup ———— */
/** La teinte d’une tuile de choix : une couleur de globals.css (--toi, --elle, --vrai, --flou, --attente). */
export type TileTone = "toi" | "elle" | "vrai" | "flou" | "attente";

export function ChoiceTile({
  icon,
  tone,
  label,
  selected,
  onClick,
  className,
}: {
  icon: IconName;
  tone: TileTone;
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "lift flex min-h-[104px] min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-tile bg-white px-2 py-3 text-center text-ink",
        selected ? "shadow-selected" : "shadow-soft",
        className,
      )}
    >
      {/* La pastille prend la couleur de globals.css : l’icône en plein, le fond à 31/255 (le 1F d’un hex, 12 %) */}
      <span
        className="lift-badge flex size-9 items-center justify-center rounded-[18px]"
        style={{ color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) calc(100% * 31 / 255), transparent)` }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="text-legende font-black leading-[1.2]">{label}</span>
    </button>
  );
}
