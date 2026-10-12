"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { revenirVers, useRetourSinon } from "@/lib/navigation";
import { Icon } from "@/components/ui/icons";

/*
 * Les boutons « Retour » des écrans, seule partie de Screen qui tourne dans le navigateur (l’historique) : un écran
 * sans autre interaction (la confidentialité, l’histoire réunie) reste un composant serveur.
 */

/**
 * Où mène un « Retour ». Une adresse : la page d’où l’on vient si c’est elle et qu’en arrière on reste dans BLUSH
 * (revenirVers), sinon le lien l’ouvre.
 * `{ repli, scroll }` : la page d’avant, quelle qu’elle soit, et `repli` quand revenir en arrière quitterait BLUSH (la
 * règle de useRetourSinon, src/lib/navigation.ts) ; `scroll` : celui du lien (false vers l’accueil). Une fonction :
 * l’écran décide (un composant client seulement).
 */
export type BackTarget = Route | { repli: Route; scroll?: boolean } | (() => void);

/** Un clic gauche simple : un clic modifié (nouvel onglet) reste au lien. */
const clicSimple = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0);

type ProprietesLien = { className: string; children: ReactNode; label?: string };

/**
 * Le lien vers une adresse : en arrière quand c’est la page d’avant et qu’en arrière on reste dans BLUSH (revenirVers :
 * l’historique reste propre, et le retour suivant mène bien plus loin) ; sinon, le lien s’ouvre.
 */
function LienVersAdresse({ href, className, children, label }: { href: Route } & ProprietesLien) {
  const router = useRouter();
  const retour = (e: MouseEvent) => {
    if (!clicSimple(e) || !revenirVers(href)) return;
    e.preventDefault();
    router.back();
  };
  return (
    <Link href={href} onClick={retour} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Le lien vers la page d’avant, ou son repli : le toucher passe par useRetourSinon ; le lien (son repli) reste pour un nouvel onglet. */
function LienRetourSinon({ repli, scroll, className, children, label }: { repli: Route; scroll?: boolean } & ProprietesLien) {
  const retourSinon = useRetourSinon(repli, { scroll });
  const retour = (e: MouseEvent) => {
    if (!clicSimple(e)) return;
    e.preventDefault();
    retourSinon();
  };
  return (
    <Link href={repli} scroll={scroll} onClick={retour} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Un lien « Retour » (une adresse, ou la page d’avant avec son repli), ou un bouton quand l’écran décide. */
function Retour({ target, className, children, label }: { target: BackTarget; className: string; children: ReactNode; label?: string }) {
  if (typeof target === "function")
    return (
      <button type="button" aria-label={label} className={className} onClick={target}>
        {children}
      </button>
    );
  if (typeof target === "string")
    return (
      <LienVersAdresse href={target} className={className} label={label}>
        {children}
      </LienVersAdresse>
    );
  return (
    <LienRetourSinon repli={target.repli} scroll={target.scroll} className={className} label={label}>
      {children}
    </LienRetourSinon>
  );
}

/** Le « Retour » de la barre du haut mobile : la flèche seule, 44 px. */
export function BoutonRetour({ target }: { target: BackTarget }) {
  return (
    <Retour target={target} label="Retour" className="flex size-11 items-center justify-center">
      <Icon name="back" size={24} stroke={2.6} className="text-ink" />
    </Retour>
  );
}

/** Le lien « Retour » au-dessus du titre (desktop), sa zone tactile de 44 px sans changer la mise en page. */
export function LienRetourDesktop({ target, label = "Retour" }: { target: BackTarget; label?: string }) {
  const cls =
    "back-nudge relative inline-flex items-center gap-1.5 text-note font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";
  return (
    <Retour target={target} className={cls}>
      <Icon name="back" size={18} stroke={2.6} className="text-soft" />
      {label}
    </Retour>
  );
}
