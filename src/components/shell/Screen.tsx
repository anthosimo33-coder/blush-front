"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cheminDe, pagePrecedente } from "@/lib/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/icons";
import { ProgressDots } from "@/components/ui/progress";

export type BackTarget = string | (() => void);

/**
 * Un « Retour » vers une adresse : si c’est la page d’où l’on vient, on revient en arrière (l’historique reste
 * propre, et le retour suivant mène bien plus loin) ; sinon, le lien l’ouvre.
 */
function useRetour(target: string) {
  const router = useRouter();
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (pagePrecedente() === cheminDe(target)) {
      e.preventDefault();
      router.back();
    }
  };
}

/* ———— Barre du haut mobile : retour · titre · progression ———— */
export function MobileTopBar({
  back,
  title,
  progress,
  right,
  className,
}: {
  back?: BackTarget;
  title?: string;
  progress?: number;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex h-[60px] shrink-0 items-center gap-2 px-4 lg:hidden", className)}>
      {back ? <BackButton target={back} /> : <span className="size-11" />}
      <span className="flex-1 text-center text-[14px] font-black text-grey">{title}</span>
      <span className="flex w-11 justify-end">{right ?? (progress !== undefined && <ProgressDots current={progress} />)}</span>
    </header>
  );
}

function BackButton({ target }: { target: BackTarget }) {
  const router = useRouter();
  const retour = useRetour(typeof target === "string" ? target : "");
  const glyph = <Icon name="back" size={24} color="#121214" stroke={2.6} />;
  const cls = "flex size-11 items-center justify-center";
  if (typeof target === "string")
    return (
      <Link href={target} onClick={retour} aria-label="Retour" className={cls}>
        {glyph}
      </Link>
    );
  return (
    <button type="button" aria-label="Retour" className={cls} onClick={target ?? (() => router.back())}>
      {glyph}
    </button>
  );
}

/* ———— En-tête desktop : logo à gauche, compte à droite ———— */
export function DesktopHeader({ right, className }: { right?: ReactNode; className?: string }) {
  return (
    <header className={cn("hidden h-[84px] shrink-0 lg:flex", className)}>
      {/* Même cadre que les colonnes : le logo s’aligne sur le contenu, « Mon compte » sur la colonne d’appoint */}
      <div className="mx-auto flex w-[min(100%_-_96px,var(--frame-w,1020px))] items-center justify-between">
        <Logo href="/" />
        {right}
      </div>
    </header>
  );
}

/** Lien « Retour » au-dessus du titre (desktop). */
function DesktopBack({ target, label = "Retour", trailing }: { target: BackTarget; label?: string; trailing?: string }) {
  const retour = useRetour(typeof target === "string" ? target : "");
  const content = (
    <>
      <Icon name="back" size={18} color="#4B4A47" stroke={2.6} />
      {label}
    </>
  );
  /* Zone tactile de 44 px sans changer la mise en page */
  const cls = "back-nudge relative inline-flex items-center gap-1.5 text-[14px] font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";
  return (
    /* Toujours 14 px entre « Retour » et le titre, quel que soit l’espacement du contenu */
    <div className="hidden items-center gap-4 lg:flex" style={{ marginBottom: "calc(14px - var(--gap))" }}>
      {typeof target === "string" ? (
        <Link href={target} onClick={retour} className={cls}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={target} className={cls}>
          {content}
        </button>
      )}
      {trailing && <span className="text-[14px] font-black text-grey">{trailing}</span>}
    </div>
  );
}

/** La pastille « Mon compte » sur ordinateur (écrans du quotidien) : l’initiale de ton email (le temps de la connaître, une silhouette). */
export function AccountPill({ initial }: { initial?: string }) {
  return (
    <Link
      href="/compte"
      className="lift lift-sm inline-flex h-11 items-center gap-2.5 rounded-[22px] bg-white pl-1.5 pr-3.5 text-[15px] font-black text-ink no-underline shadow-soft"
    >
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full text-[14px] font-black text-white"
        style={{ background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), #3D8BFF" }}
      >
        {initial ?? <Icon name="user" size={16} color="#FFFFFF" stroke={2.4} />}
      </span>
      Mon compte
    </Link>
  );
}

/* ———— Écran : une seule structure, deux mises en page ———— */
export function Screen({
  mobileTop,
  desktopHeaderRight,
  desktopBack,
  aside,
  footer,
  children,
  mainWidth = 560,
  asideWidth = 380,
  columnsGap = 80,
  contentGap = 14,
  footerWidth = 400,
  centered = false,
  desktopTopPad = 16,
  asideSide = "right",
  desktopLabel,
  stickyFooter = true,
  srTitle,
  asideOffset,
  head,
  mobileGap,
  frameWidth,
  className,
}: {
  /** Barre du haut mobile (MobileTopBar ou en-tête dédié). */
  mobileTop?: ReactNode;
  desktopHeaderRight?: ReactNode;
  desktopBack?: { target: BackTarget; label?: string; trailing?: string };
  /** Colonne d’appoint, desktop seulement. */
  aside?: ReactNode;
  /** Zone du bouton principal : collée en bas sur mobile, sous le contenu sur desktop. */
  footer?: ReactNode;
  children: ReactNode;
  mainWidth?: number;
  asideWidth?: number;
  columnsGap?: number;
  contentGap?: number;
  footerWidth?: number;
  centered?: boolean;
  desktopTopPad?: number;
  /** Le sommaire du rapport est à gauche, la colonne d’appoint du quotidien à droite. */
  asideSide?: "left" | "right";
  /** Libellé gris au-dessus du contenu en desktop (« Ton rapport »). */
  desktopLabel?: string;
  /** Bouton collé en bas sur mobile (écrans courts) ou placé en fin de contenu (rapport). */
  stickyFooter?: boolean;
  /** Titre de page pour les lecteurs d’écran quand l’écran n’a pas de titre visible. */
  srTitle?: string;
  /** Décalage optique de la colonne d’appoint pour l’aligner sur le titre (par défaut : ligne des capitales du h1, ou du « Retour »). */
  asideOffset?: number;
  /**
   * En-tête de l’écran (titre, intro). Quand il est fourni, la colonne d’appoint desktop
   * s’aligne sur le premier bloc de contenu, sous l’en-tête (sous-grille CSS, sans calcul JS).
   */
  head?: ReactNode;
  /** Espacement entre les blocs sur mobile seulement (par défaut : celui du desktop). */
  mobileGap?: number;
  /** Largeur du cadre desktop (en-tête et contenu), quand elle doit suivre un contenu plus étroit que 1020 px. */
  frameWidth?: number;
  className?: string;
}) {
  /* Un seul cadre pour l’en-tête et les colonnes, aussi large que les colonnes de la maquette */
  const frameW = frameWidth ?? (aside ? mainWidth + columnsGap + asideWidth : Math.max(1020, mainWidth));
  const asideMt = asideOffset ?? (desktopBack || desktopLabel ? 4 : 10);
  const grid = !!head && !!aside;
  const top = (
    <>
      {srTitle && <h1 className="sr-only">{srTitle}</h1>}
      {desktopBack && <DesktopBack {...desktopBack} />}
      {desktopLabel && !desktopBack && (
        <div className="hidden text-[14px] font-black text-grey lg:block" style={{ marginBottom: "calc(14px - var(--gap))" }}>
          {desktopLabel}
        </div>
      )}
    </>
  );
  return (
    <div
      className={cn("mx-auto flex min-h-dvh w-full flex-col md:max-w-[560px] lg:max-w-none", className)}
      style={{ "--main-w": `${mainWidth}px`, "--aside-w": `${asideWidth}px`, "--cols-gap": `${columnsGap}px`, "--gap": `${contentGap}px`, "--footer-w": `${footerWidth}px`, "--top-pad": `${desktopTopPad}px`, "--frame-w": `${frameW}px`, "--aside-mt": `${asideMt}px`, "--gap-m": `${mobileGap ?? contentGap}px` }}
    >
      {mobileTop}
      <DesktopHeader right={desktopHeaderRight} />
      <div
        className={cn(
          "flex flex-1 flex-col lg:mx-auto lg:w-[min(100%_-_96px,var(--frame-w))] lg:pb-12 lg:pt-[var(--top-pad)]",
          grid
            ? /* en-tête / contenu / bouton à gauche, colonne d’appoint calée sur la ligne du contenu */
              "lg:grid lg:grid-cols-[minmax(0,var(--main-w))_var(--aside-w)] lg:grid-rows-[auto_auto_1fr] lg:content-start lg:justify-between lg:gap-x-10 lg:gap-y-[var(--gap)]"
            : cn("lg:flex-row lg:items-start lg:gap-10", aside ? "lg:justify-between" : "lg:justify-center"),
        )}
      >
        {/* La colonne principale peut rétrécir (1024-1180 px) : rien ne déborde, les bords restent alignés */}
        <main
          className={cn(
            "relative flex flex-1 flex-col lg:min-w-0",
            grid ? "lg:row-span-3 lg:grid lg:grid-rows-subgrid" : "lg:flex-[0_1_var(--main-w)]",
            centered && "lg:items-center",
          )}
        >
          {head && (
            <div className="flex flex-col gap-[var(--gap-m)] px-[22px] pt-1 lg:gap-[var(--gap)] lg:p-0">
              {top}
              {head}
            </div>
          )}
          <div className={cn("flex flex-1 flex-col gap-[var(--gap-m)] px-[22px] lg:flex-none lg:gap-[var(--gap)] lg:p-0", head ? "mt-[var(--gap-m)] lg:mt-0" : "pt-1", !footer && "pb-6", centered && "lg:w-full")}>
            {!head && top}
            {children}
          </div>
          {footer && (
            <div
              className={cn(
                "z-10 mt-auto flex flex-col gap-2 px-[22px] pb-[max(24px,env(safe-area-inset-bottom))] pt-3",
                stickyFooter && "sticky bottom-0 bg-[linear-gradient(180deg,rgba(244,242,237,0)_0%,#F4F2ED_22%)]",
                "lg:static lg:w-[min(100%,var(--footer-w))] lg:bg-none lg:p-0",
                grid ? "lg:mt-2.5 lg:self-start" : "lg:mt-6",
              )}
            >
              {footer}
            </div>
          )}
        </main>
        {aside && (
          <aside
            className={cn(
              "hidden shrink-0 flex-col gap-4 lg:sticky lg:top-6 lg:flex lg:w-[var(--aside-w)] lg:self-start",
              grid ? "lg:col-start-2 lg:row-span-2 lg:row-start-2" : "lg:mt-[var(--aside-mt)]",
              asideSide === "left" && "lg:order-first",
            )}
          >
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Titre d’écran (h1) : 30 à 34 px, 900. */
export function ScreenTitle({ children, size = 32, desktopSize, className, id }: { children: ReactNode; size?: number; desktopSize?: number; className?: string; id?: string }) {
  return (
    <h1
      id={id}
      className={cn("m-0 mt-1.5 text-[length:var(--h1)] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance] lg:text-[length:var(--h1-lg)]", className)}
      style={{ "--h1": `${size}px`, "--h1-lg": `${desktopSize ?? size}px` }}
    >
      {children}
    </h1>
  );
}

/** Texte d’introduction sous le titre. */
export function Lead({ children, size = 16, weight = 700, className }: { children: ReactNode; size?: number; weight?: 700 | 800; className?: string }) {
  return (
    <p className={cn("m-0 leading-[1.45] text-soft", className)} style={{ fontSize: size, fontWeight: weight }}>
      {children}
    </p>
  );
}
