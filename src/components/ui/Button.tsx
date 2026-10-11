import Link from "next/link";
import type { ComponentProps, ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AttributsLibres } from "./attributs";
import { EnRoute } from "./EnRoute";
import { TypingDots } from "./feedback";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "secondary" | "link";

const base = "inline-flex select-none items-center justify-center no-underline disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  /* Le bouton principal : encre en relief, un seul par écran. Il s’enfonce d’1 px et son ombre se resserre. */
  primary:
    "lift lift-ink lift-sm w-full font-black text-white [background:var(--btn-ink-bg)] shadow-ink aria-disabled:pointer-events-none aria-disabled:![background:#D9D6CF] aria-disabled:!text-grey aria-disabled:!shadow-none disabled:![background:#D9D6CF] disabled:!text-grey disabled:!shadow-none",
  /* Secondaire : blanc, bordé, il s’efface devant le principal. */
  secondary: "lift lift-sm w-full bg-white font-black text-ink shadow-soft",
  /* Lien : texte doux, zone tactile de 44 px. */
  link: "min-h-11 px-1 text-[15px] font-black text-soft transition-colors hover:text-ink",
};

/**
 * La taille des boutons pleins (le lien garde la sienne) : `lg`, le grand bouton de bas d’écran (60 px) ; `md`, le bouton
 * d’une carte ou d’une rangée de deux (52 px, comme ceux du verdict).
 */
export type TailleBouton = "lg" | "md";

const tailles: Record<TailleBouton, string> = {
  lg: "h-[60px] gap-2.5 rounded-[30px] px-[22px] text-[18px]",
  md: "h-[52px] gap-2 rounded-[26px] px-5 text-[16px]",
};

/* Les classes d’un bouton : sa variante, et sa taille s’il est plein */
const classes = (variant: Variant, size: TailleBouton) => cn(base, variants[variant], variant !== "link" && tailles[size]);

type CommonProps = {
  variant?: Variant;
  size?: TailleBouton;
  arrow?: boolean;
  icon?: IconName;
  className?: string;
  children: ReactNode;
};

/** `lien` : dans un lien, la flèche (ou l’icône) laisse place aux trois points tant que la page n’arrive pas. */
function Content({ arrow, icon, variant, children, lien = false }: Pick<CommonProps, "arrow" | "icon" | "variant" | "children"> & { lien?: boolean }) {
  const color = variant === "primary" ? "#FFFFFF" : "currentColor";
  const enRoute = (glyph: ReactNode) => (lien ? <EnRoute color={variant === "primary" ? "#FFFFFF" : undefined}>{glyph}</EnRoute> : glyph);
  return (
    <>
      {icon && enRoute(<Icon name={icon} size={18} color={color} stroke={2.4} />)}
      {children}
      {arrow && enRoute(<Icon name="arrow" size={18} color={color} stroke={1.9} />)}
    </>
  );
}

/**
 * Un bouton. `loading` : l’action est partie ; les trois points de BLUSH prennent la place du texte (le bouton prend
 * pour nom `loadingLabel`, ou garde son texte, caché à l’œil, sans lui), la flèche s’efface et un nouveau toucher ne fait rien (même un bouton d’envoi de
 * formulaire). Le bouton garde son allure : `disabled` en plus le grise, comme avant.
 */
export function Button({
  variant = "primary",
  size = "lg",
  arrow,
  icon,
  loading = false,
  loadingLabel,
  className,
  children,
  onClick,
  ...rest
}: CommonProps & { loading?: boolean; loadingLabel?: string } & ComponentPropsWithoutRef<"button">) {
  /* En route, le toucher est retenu : ni l’action, ni l’envoi du formulaire */
  const toucher = loading ? (e: MouseEvent<HTMLButtonElement>) => e.preventDefault() : onClick;
  return (
    <button type="button" className={cn(classes(variant, size), className)} onClick={toucher} {...rest} aria-busy={loading || rest["aria-busy"]}>
      <Content arrow={arrow && !rest.disabled && !loading} icon={loading ? undefined : icon} variant={variant}>
        {loading ? (
          <>
            <TypingDots color={variant === "primary" ? "#FFFFFF" : undefined} label={loadingLabel} />
            {/* Sans loadingLabel, le bouton garde son nom pour les lecteurs d’écran : son texte, caché à l’œil */}
            {!loadingLabel && <span className="sr-only">{children}</span>}
          </>
        ) : (
          children
        )}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "lg",
  arrow,
  icon,
  className,
  children,
  href,
  disabled,
  ...rest
}: CommonProps & { href: string; disabled?: boolean } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(classes(variant, size), className)}
      {...rest}
    >
      <Content arrow={arrow} icon={icon} variant={variant} lien>
        {children}
      </Content>
    </Link>
  );
}

/** Le fond d’un bouton icône : une carte blanche en relief, une carte plus douce (bordée, comme Chip), ou rien. */
export type FondIconButton = "carte" | "doux" | "nu";

const FONDS_ICONE: Record<FondIconButton, string> = {
  carte: "lift lift-sm lift-card bg-white shadow-card",
  doux: "lift lift-sm lift-card bg-white shadow-soft",
  nu: "",
};

/**
 * Bouton icône (retour, fermer, compte) : 44 × 44 (`md`), ou 40 × 40 (`sm`, dans un en-tête serré). `variant` : son fond
 * (`plain`, l’ancien nom de `nu`, reste compris). Un lien avec `href`, un bouton sinon ; `disabled`, les aria-* et les
 * data-* vont sur l’élément.
 */
export function IconButton({
  icon,
  label,
  href,
  onClick,
  plain = false,
  size = "md",
  variant = plain ? "nu" : "carte",
  iconSize = 22,
  disabled,
  className,
  ...rest
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: () => void;
  plain?: boolean;
  size?: "md" | "sm";
  variant?: FondIconButton;
  iconSize?: number;
  disabled?: boolean;
  className?: string;
} & AttributsLibres) {
  const cls = cn("inline-flex shrink-0 items-center justify-center rounded-full", size === "sm" ? "size-10" : "size-11", FONDS_ICONE[variant], className);
  const glyph = <Icon name={icon} size={iconSize} color="#121214" stroke={icon === "user" ? 2.2 : 2.6} />;
  if (href)
    return (
      <Link
        href={href}
        aria-label={label}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        /* Désactivé : ni clic, ni toucher, ni soulèvement au survol (un lien n’a pas de :disabled) ; un clic qui passerait
           quand même (un lecteur d’écran) ne navigue pas */
        onClick={disabled ? (e) => e.preventDefault() : undefined}
        className={cn(cls, "aria-disabled:pointer-events-none")}
        {...rest}
      >
        <EnRoute>{glyph}</EnRoute>
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cls} {...rest}>
      {glyph}
    </button>
  );
}
