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

/** Carte « À toi de jouer » bleutée, éclair bleu. */
export function PlayCard({ title = "À toi de jouer", children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-tile bg-white px-4 py-3.5 shadow-play", className)} style={{ backgroundImage: "linear-gradient(180deg, #F3F8FF, white)" }}>
      <Icon name="bolt" size={20} className="text-toi" />
      <div className="flex flex-col gap-[3px]">
        <span className="text-legende font-black text-toi-ink">{title}</span>
        <span className="text-detail font-black leading-[1.4]">{children}</span>
      </div>
    </div>
  );
}
