import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AttributsLibres } from "./attributs";
import { Icon, type IconName } from "./icons";

/*
 * Ce que l’écran répond à un geste : un souci (Alert), une étape faite (DoneCheck), une note discrète avec son icône
 * (NoteIcone), BLUSH qui travaille (TypingDots). Un seul dessin pour chacun, au lieu d’une copie par écran ; les couleurs
 * viennent des tokens de globals.css (danger, ok, muted).
 */

/* ———— Le souci ———— */

/**
 * Les trois habillages d’un souci, tels que les écrans les écrivaient. `texte` : une ligne rouge sous le bouton (le compte,
 * l’effacement, le paiement) ; `carte` : une carte blanche au-dessus du champ ou du bouton (ta question, l’import, « Qui
 * est qui ») ; `voile` : un fond rouge pâle, un rouge plus foncé pour rester lisible dessus (le partage).
 */
const HABILLAGES = {
  texte: "m-0 text-note font-extrabold text-danger",
  carte: "m-0 rounded-[16px] bg-white px-4 py-3 text-note font-extrabold leading-[1.4] text-danger shadow-card",
  voile: "m-0 rounded-[18px] bg-[rgba(229,72,77,0.08)] px-4 py-3 text-note font-extrabold text-danger-ink",
} as const;

export type HabillageAlerte = keyof typeof HABILLAGES;

/**
 * Un souci, annoncé tout de suite aux lecteurs d’écran (role="alert", qui porte son aria-live) : ce qui n’a pas marché, et
 * quoi faire. `className` : la place que lui donne l’écran (une marge, un texte centré), jamais sa couleur.
 */
export function Alert({ children, variant = "texte", className, ...rest }: { children: ReactNode; variant?: HabillageAlerte; className?: string } & AttributsLibres) {
  return (
    <p role="alert" className={cn(HABILLAGES[variant], className)} {...rest}>
      {children}
    </p>
  );
}

/* ———— L’étape faite ———— */

/** L’ombre verte sous la coche : petite sous les pastilles de texte, grande sous celles d’un écran de fin (48 px). */
const OMBRES = {
  petite: "0 3px 8px -3px rgba(18,192,138,0.6)",
  grande: "0 8px 18px -8px rgba(18,192,138,0.6)",
} as const;

/**
 * La pastille verte « c’est fait » : une coche blanche sur le vert brillant de la vérité. `glyphe` : la taille de la coche
 * (par défaut un peu plus de la moitié de la pastille) ; `ombre` : petite jusqu’à 40 px, grande au-delà, ou aucune.
 * `label` : la pastille dit ce qu’elle montre (« prêt ») ; sans lui, elle est décorative.
 */
export function DoneCheck({
  size = 26,
  glyphe = Math.round(size * 0.54),
  trait = 3.4,
  ombre = size >= 40 ? "grande" : "petite",
  label,
  className,
  style,
  ...rest
}: {
  size?: number;
  glyphe?: number;
  trait?: number;
  ombre?: keyof typeof OMBRES | false;
  label?: string;
  className?: string;
  style?: CSSProperties;
} & AttributsLibres) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-ok", className)}
      style={{ width: size, height: size, backgroundImage: "var(--gloss)", boxShadow: ombre ? OMBRES[ombre] : undefined, ...style }}
      {...rest}
    >
      <Icon name="check" size={glyphe} color="#FFFFFF" stroke={trait} />
    </span>
  );
}

/* ———— La note avec son icône ———— */

/**
 * Une note discrète : une petite icône grise, puis le texte (la confidentialité, l’effacement, le tableau de bord).
 * `couleur` : le gris de l’icône, plus foncé (#6B6862, le gris du texte) ou plus doux (#8A8780) ; `serree` : l’icône
 * plus près du texte (une note centrée). `className` : la taille du texte, l’interligne et la marge de l’écran.
 */
export function NoteIcone({
  icone,
  children,
  taille = 16,
  couleur = "#6B6862",
  serree = false,
  className,
}: {
  icone: IconName;
  children: ReactNode;
  taille?: number;
  couleur?: "#6B6862" | "#8A8780";
  serree?: boolean;
  className?: string;
}) {
  return (
    <p className={cn("m-0 flex items-start font-extrabold text-grey", serree ? "gap-1.5" : "gap-2", className)}>
      <Icon name={icone} size={taille} color={couleur} stroke={2.2} style={{ marginTop: 1 }} />
      <span>{children}</span>
    </p>
  );
}

/* ———— BLUSH travaille ———— */

/**
 * Trois points animés (« en train d’écrire ») : deux de la couleur du texte (currentColor), le dernier en perle.
 * `color` : la couleur des deux premiers ; sans elle, le gris doux (muted) ; "currentColor" pour suivre le texte autour
 * (le blanc d’un bouton principal). `label` : les points disent ce qui se passe aux lecteurs d’écran.
 */
export function TypingDots({ color, size = 6, label }: { color?: string; size?: number; label?: string }) {
  const point = { width: size, height: size };
  return (
    <span
      data-dots=""
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center", !color && "text-muted")}
      style={{ gap: size * 0.66, color }}
    >
      <span className="inline-block rounded-full bg-current" style={point} />
      <span className="inline-block rounded-full bg-current" style={point} />
      <span className="inline-block rounded-full" style={{ ...point, background: "var(--degrade-perle)" }} />
    </span>
  );
}
