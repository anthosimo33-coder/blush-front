import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "secondary" | "link";

const base = "inline-flex select-none items-center justify-center no-underline disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  /* Le bouton principal : encre en relief, un seul par écran. Il s’enfonce d’1 px et son ombre se resserre. */
  primary:
    "lift lift-ink lift-sm h-[60px] w-full gap-2.5 rounded-[30px] px-[22px] text-[18px] font-black text-white [background:var(--btn-ink-bg)] shadow-ink aria-disabled:pointer-events-none aria-disabled:![background:#D9D6CF] aria-disabled:!text-grey aria-disabled:!shadow-none disabled:![background:#D9D6CF] disabled:!text-grey disabled:!shadow-none",
  /* Secondaire : blanc, bordé, il s’efface devant le principal. */
  secondary:
    "lift lift-sm h-[60px] w-full gap-2.5 rounded-[30px] bg-white px-[22px] text-[18px] font-black text-ink shadow-soft",
  /* Lien : texte doux, zone tactile de 44 px. */
  link: "min-h-11 px-1 text-[15px] font-black text-soft transition-colors hover:text-ink",
};

type CommonProps = {
  variant?: Variant;
  arrow?: boolean;
  icon?: IconName;
  className?: string;
  children: ReactNode;
};

function Content({ arrow, icon, variant, children }: Pick<CommonProps, "arrow" | "icon" | "variant" | "children">) {
  const color = variant === "primary" ? "#FFFFFF" : "currentColor";
  return (
    <>
      {icon && <Icon name={icon} size={18} color={color} stroke={2.4} />}
      {children}
      {arrow && <Icon name="arrow" size={18} color={color} stroke={1.9} />}
    </>
  );
}

export function Button({
  variant = "primary",
  arrow,
  icon,
  className,
  children,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button type="button" className={cn(base, variants[variant], className)} {...rest}>
      <Content arrow={arrow && !rest.disabled} icon={icon} variant={variant}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  arrow,
  icon,
  className,
  children,
  href,
  disabled,
  ...rest
}: CommonProps & { href: string; disabled?: boolean } & Omit<ComponentPropsWithoutRef<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(base, variants[variant], className)}
      {...rest}
    >
      <Content arrow={arrow} icon={icon} variant={variant}>
        {children}
      </Content>
    </Link>
  );
}

/** Bouton icône 44 × 44 (retour, fermer, compte). */
export function IconButton({
  icon,
  label,
  href,
  onClick,
  plain = false,
  iconSize = 22,
  className,
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: () => void;
  plain?: boolean;
  iconSize?: number;
  className?: string;
}) {
  const cls = cn(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
    plain ? "" : "lift lift-sm lift-card bg-white shadow-card",
    className,
  );
  const glyph = <Icon name={icon} size={iconSize} color="#121214" stroke={icon === "user" ? 2.2 : 2.6} />;
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        {glyph}
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {glyph}
    </button>
  );
}
