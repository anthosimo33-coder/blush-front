import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

/*
 * Listes groupées, à la manière des Réglages et de Contacts sur iPhone :
 * un titre de section discret, une carte blanche, des lignes séparées par un filet.
 */
export function InsetGroup({ title, footer, children, className, id }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={title && id ? id : undefined} className={cn("flex flex-col gap-2", className)}>
      {title && (
        <h2 id={id} className="m-0 pl-4 text-[13px] font-black text-grey">
          {title}
        </h2>
      )}
      <div className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-card [&>*+*]:border-t [&>*+*]:border-[rgba(17,17,20,0.06)]">{children}</div>
      {footer && <p className="m-0 px-4 text-[12.5px] font-extrabold leading-[1.45] text-grey">{footer}</p>}
    </section>
  );
}

export type RowTone = "elle" | "toi" | "vrai" | "ink" | "grey" | "danger";

const TONES: Record<RowTone, { bg: string; fg: string }> = {
  elle: { bg: "rgba(255,79,154,0.12)", fg: "#E8358A" },
  toi: { bg: "rgba(61,139,255,0.12)", fg: "#2F7BFF" },
  vrai: { bg: "rgba(18,192,138,0.12)", fg: "#0E9F72" },
  ink: { bg: "#121214", fg: "#FFFFFF" },
  grey: { bg: "#F1EFEA", fg: "#4B4A47" },
  danger: { bg: "rgba(229,72,77,0.1)", fg: "#E5484D" },
};

/** Une pastille d’icône teintée, en tête de ligne. */
export function RowIcon({ icon, tone = "grey", children }: { icon?: IconName; tone?: RowTone; children?: ReactNode }) {
  const t = TONES[tone];
  return (
    <span aria-hidden="true" className="lift-pop flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: t.bg }}>
      {icon ? <Icon name={icon} size={18} color={t.fg} stroke={2.3} /> : children}
    </span>
  );
}

/**
 * Une ligne de liste groupée. Lien, bouton ou simple ligne selon `href` / `onClick`.
 * `danger` : action destructive, en rouge, comme sur iPhone.
 */
export function InsetRow({
  leading,
  title,
  sub,
  trailing,
  chevron,
  href,
  scroll,
  onClick,
  danger,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  href?: string;
  /** false : le lien ne remet pas la page en haut (vers l’accueil, qui s’ouvre sur le dernier échange). */
  scroll?: boolean;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[16px] font-black leading-[1.3]", danger ? "text-[#D93036]" : "text-ink")}>{title}</span>
        {sub && <span className="text-[13px] font-extrabold leading-[1.4] text-grey">{sub}</span>}
      </span>
      {trailing}
      {chevron && <Icon name="chevron" size={17} color="#B4B1A9" stroke={2.6} className="lift-chev shrink-0" />}
    </>
  );
  const cls = cn("flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left no-underline", className);
  if (href)
    return (
      <Link href={href} scroll={scroll} className={cn("row-hover", cls)}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn("row-hover", cls)}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** En-tête centré : un visuel, un titre, une phrase. Pour les écrans qui ont un seul sujet. */
export function HeroHeader({ visual, kicker, title, sub, className, titleId }: { visual?: ReactNode; kicker?: ReactNode; title: ReactNode; sub?: ReactNode; className?: string; titleId?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      {visual}
      {kicker && <div className={cn("text-[13px] font-black", !!visual && "mt-4")}>{kicker}</div>}
      <h1 id={titleId} className={cn("m-0 text-[30px] font-black leading-[1.08] tracking-[-0.02em] [text-wrap:balance] lg:text-[34px]", !!visual && !kicker && "mt-4", !!kicker && "mt-1.5")}>
        {title}
      </h1>
      {sub && <p className="m-0 mt-2.5 max-w-[440px] text-[15px] font-extrabold leading-[1.45] text-soft">{sub}</p>}
    </div>
  );
}
