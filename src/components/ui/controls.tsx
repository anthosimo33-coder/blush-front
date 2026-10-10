"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AppKind } from "@/types";
import { AppBadge } from "./Avatar";
import { Icon, type IconName } from "./icons";

/* ———— Chip ———— */
export function Chip({
  children,
  selected = false,
  onClick,
  href,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = cn(
    "inline-flex h-9 items-center whitespace-nowrap rounded-[18px] px-3.5 text-[14px] font-black",
    selected ? "bg-ink text-white shadow-ink" : "bg-white text-ink shadow-soft",
    (onClick || href) && "lift lift-sm relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
    (onClick || href) && selected && "lift-ink",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" aria-pressed={selected} onClick={onClick} className={cls}>
        {children}
      </button>
    );
  return <span className={cls}>{children}</span>;
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
    <div role="radiogroup" aria-label={label} className={cn("flex h-12 rounded-3xl bg-segment p-1", className)}>
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
              "flex flex-1 items-center justify-center rounded-[20px] text-[15px] font-black transition-colors",
              on ? "bg-white text-ink shadow-[0_2px_6px_rgba(17,17,20,0.08)]" : "text-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
      style={{ background: checked ? "linear-gradient(120deg, #12C08A, #3D8BFF)" : "#E6E3DC" }}
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
      <Icon name="check" size={Math.round(size * 0.54)} color="#FFFFFF" stroke={3.4} />
    </span>
  );
}

/* ———— Tuile d’appli (écran 01) ———— */
export function AppTile({
  app,
  title,
  subtitle,
  href,
  wide = false,
  onClick,
  className,
}: {
  app: AppKind;
  title: string;
  subtitle: string;
  href: string;
  wide?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "lift relative flex rounded-card bg-white text-ink no-underline shadow-soft",
        wide ? "col-span-full items-center gap-3 px-4 py-3.5" : "flex-col items-start gap-2.5 p-4",
        className,
      )}
    >
      <AppBadge app={app} className="lift-badge" />
      {/* Desktop : même chevron que la tuile large, centré sur la pastille (remplit le coin vide, dit « on y va ») */}
      {!wide && <Icon name="chevron" size={18} color="#8A8780" stroke={2.6} className="lift-chev absolute right-4 top-[30px] hidden lg:block" />}
      <span className={cn("flex flex-col gap-0.5", wide && "flex-1")}>
        <span className="text-[17px] font-black">{title}</span>
        <span className="text-[12px] font-extrabold text-grey">{subtitle}</span>
      </span>
      {wide && <Icon name="chevron" size={18} color="#8A8780" stroke={2.6} className="lift-chev" />}
    </Link>
  );
}

/* ———— Tuile de choix (écran 06) ———— */
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
      <span className="lift-badge flex size-9 items-center justify-center rounded-[18px]" style={{ color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) calc(100% * 31 / 255), transparent)` }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[13px] font-black leading-[1.2]">{label}</span>
    </button>
  );
}

/* ———— Grande carte de choix (export complet / captures) ———— */
export function ChoiceCard({
  app,
  title,
  badge,
  badgeTone = "vrai",
  subtitle,
  selected = false,
  onClick,
  style,
}: {
  app: AppKind;
  title: string;
  badge?: string;
  badgeTone?: "vrai" | "toi";
  subtitle: string;
  selected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      className={cn("lift flex w-full items-center gap-3 rounded-card bg-white p-3.5 text-left text-ink", selected ? "shadow-selected" : "shadow-soft")}
    >
      <AppBadge app={app} className="lift-badge" />
      <span className="flex flex-1 flex-col gap-[5px]">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-black">{title}</span>
          {badge && (
            <span
              className="inline-flex h-6 items-center rounded-xl px-2.5 text-[12px] font-black text-white"
              style={{ background: `var(--gloss), ${badgeTone === "vrai" ? "#12C08A" : "#3D8BFF"}`, boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.1)" }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="text-[13px] font-bold leading-[1.35] text-grey">{subtitle}</span>
      </span>
      {selected && <SelectedCheck size={26} />}
    </button>
  );
}
