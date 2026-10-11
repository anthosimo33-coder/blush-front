import type { ComponentPropsWithoutRef, ReactNode, Ref, SVGProps } from "react";
import { scaleOf } from "@/contenu/niveaux";
import { cn } from "@/lib/cn";
import type { LevelId, Verdict } from "@/types";
import type { AttributsLibres } from "./attributs";
import { Avatar } from "./Avatar";

/**
 * Une personne comme un contact : son initiale dans l’anneau de votre niveau, le verdict en badge (comme Sophie sur
 * l’accueil). Sans niveau ni verdict (BLUSH lit encore la conv) : l’anneau vide, sans badge.
 *
 * Pour un anneau qui s’anime (l’en-tête de l’accueil) : `ringProps` et `badgeProps` vont sur l’arc du niveau et sur le
 * badge (leurs data-*, les ancres d’animation), `enveloppe` entoure l’avatar (une ViewTransition, une ancre), `children`
 * ajoute un calque sous l’anneau (le halo), `ref` et le reste (className, data-*) vont sur l’anneau entier. `fontSize` :
 * celle de l’initiale, sinon celle de l’Avatar.
 */
export function ContactRing({
  initial,
  level,
  emoji,
  size = 52,
  fontSize,
  ringProps,
  badgeProps,
  enveloppe = (avatar) => avatar,
  children,
  className,
  ref,
  ...rest
}: {
  initial: string;
  level: LevelId | null;
  emoji: Verdict["emoji"] | null;
  size?: number;
  fontSize?: number;
  ringProps?: SVGProps<SVGCircleElement> & AttributsLibres;
  badgeProps?: Omit<ComponentPropsWithoutRef<"span">, "children"> & AttributsLibres;
  enveloppe?: (avatar: ReactNode) => ReactNode;
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
} & AttributsLibres) {
  const { levels, index } = level ? scaleOf(level) : { levels: [], index: -1 };
  const ring = 2 * Math.PI * 21;
  return (
    <span ref={ref} aria-hidden="true" className={cn("relative flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} {...rest}>
      {children}
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="21" fill="none" className="stroke-line" strokeWidth="3.5" />
        {level && <circle cx="24" cy="24" r="21" fill="none" className="stroke-vrai" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(ring * (index + 1)) / levels.length} ${ring}`} {...ringProps} />}
      </svg>
      {enveloppe(
        <Avatar tone="elle" size={Math.round(size * 0.75)} fontSize={fontSize}>
          {initial}
        </Avatar>,
      )}
      {emoji && (
        <span
          {...badgeProps}
          className={cn(
            "absolute -bottom-1 -right-1.5 flex size-[22px] items-center justify-center rounded-full bg-white text-micro leading-none shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_3px_8px_-3px_rgba(17,17,20,0.35)]",
            badgeProps?.className,
          )}
        >
          {emoji}
        </span>
      )}
    </span>
  );
}
