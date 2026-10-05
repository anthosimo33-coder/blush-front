import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

type CardVariant = "card" | "plaque" | "strong";

const CARD: Record<CardVariant, string> = {
  /* Carte : blanche, contour fin et ombre douce */
  card: "bg-white shadow-card",
  /* Plaque : zone secondaire (astuces, ajouts) */
  plaque: "bg-plaque shadow-thin",
  /* Carte forte : contour encre de 2 px */
  strong: "bg-white shadow-selected",
};

export function Card({
  variant = "card",
  as: Tag = "div",
  className,
  style,
  children,
}: {
  variant?: CardVariant;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("rounded-card", CARD[variant], className)} style={style}>
      {children}
    </Tag>
  );
}

/** Petite légende grise de carte (13 px, 900). */
export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[13px] font-black text-grey", className)}>{children}</div>;
}

/** Carte « À toi de jouer » bleutée, éclair bleu. */
export function PlayCard({ title = "À toi de jouer", children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-tile bg-white px-4 py-3.5 shadow-play", className)} style={{ backgroundImage: "linear-gradient(180deg, #F3F8FF, #FFFFFF)" }}>
      <Icon name="bolt" size={20} color="#3D8BFF" />
      <div className="flex flex-col gap-[3px]">
        <span className="text-[13px] font-black text-toi-ink">{title}</span>
        <span className="text-[15px] font-black leading-[1.4]">{children}</span>
      </div>
    </div>
  );
}

/** Liste numérotée dans une carte (étapes d’export). */
export function StepList({ steps, className }: { steps: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("m-0 flex list-none flex-col rounded-card bg-white px-5 py-1 shadow-card", className)}>
      {steps.map((s, i) => (
        <li key={i} className={cn("flex min-h-14 items-center gap-3.5 py-3", i > 0 && "border-t border-[rgba(17,17,20,0.07)]")}>
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-plaque text-[13px] font-black text-soft">{i + 1}</span>
          <span className="flex-1 text-[16px] font-extrabold leading-[1.35]">{s}</span>
        </li>
      ))}
    </ol>
  );
}
