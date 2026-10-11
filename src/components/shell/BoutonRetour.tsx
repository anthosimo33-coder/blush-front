"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cheminDe, pagePrecedente } from "@/lib/navigation";
import { Icon } from "@/components/ui/icons";

/*
 * Les boutons « Retour » des écrans, seule partie de Screen qui tourne dans le navigateur (l’historique) : un écran
 * sans autre interaction (la confidentialité, l’histoire réunie) reste un composant serveur.
 */

/**
 * Où mène un « Retour ». Une adresse : la page d’où l’on vient si c’est elle (en arrière), sinon le lien l’ouvre.
 * `{ repli }` : la page d’avant, quelle qu’elle soit, et `repli` quand on arrive d’ailleurs (un lien, un nouvel onglet),
 * où revenir en arrière quitterait BLUSH. Une fonction : l’écran décide (un composant client seulement).
 */
export type BackTarget = string | { repli: string } | (() => void);

/** L’API Navigation, là où le navigateur l’a (pas encore partout : sans elle, on s’en tient à la page d’avant). */
type HistoriqueNavigation = { currentEntry: { index: number } | null };

/**
 * L’entrée d’avant dans l’historique est-elle à BLUSH ? `pagePrecedente` est la dernière page de BLUSH vue, pas l’entrée
 * d’avant : arrivé par un lien, un « Retour » (le repli, poussé) puis le retour du système ramènent sur la page avec une
 * page d’avant, alors que l’entrée d’avant est le site d’où l’on vient. L’API Navigation ne liste que les entrées de
 * BLUSH (même origine) : un index au-dessus de 0 dit qu’en arrière, on reste chez nous. Sans l’API (des navigateurs
 * plus anciens), cette limite reste : le repli ne protège que la première arrivée.
 */
function entreeDAvantDansBlush() {
  const historique = (window as Window & { navigation?: HistoriqueNavigation }).navigation;
  const entree = historique?.currentEntry;
  return entree ? entree.index > 0 : true;
}

/**
 * Le toucher d’un lien « Retour » : en arrière quand c’est la bonne page d’avant (l’historique reste propre, et le
 * retour suivant mène bien plus loin) ; sinon, le lien s’ouvre. Un clic modifié (nouvel onglet) reste au lien.
 */
function useRetour(target: Exclude<BackTarget, () => void>) {
  const router = useRouter();
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const avant = pagePrecedente();
    if (typeof target === "string" ? avant === cheminDe(target) : avant && entreeDAvantDansBlush()) {
      e.preventDefault();
      router.back();
    }
  };
}

/** Un lien « Retour » (une adresse, ou la page d’avant avec son repli), ou un bouton quand l’écran décide. */
function Retour({ target, className, children, label }: { target: BackTarget; className: string; children: ReactNode; label?: string }) {
  if (typeof target === "function")
    return (
      <button type="button" aria-label={label} className={className} onClick={target}>
        {children}
      </button>
    );
  return <LienRetour target={target} className={className} label={label}>{children}</LienRetour>;
}

function LienRetour({ target, className, children, label }: { target: Exclude<BackTarget, () => void>; className: string; children: ReactNode; label?: string }) {
  const retour = useRetour(target);
  return (
    <Link href={typeof target === "string" ? target : target.repli} onClick={retour} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Le « Retour » de la barre du haut mobile : la flèche seule, 44 px. */
export function BoutonRetour({ target }: { target: BackTarget }) {
  return (
    <Retour target={target} label="Retour" className="flex size-11 items-center justify-center">
      <Icon name="back" size={24} color="#121214" stroke={2.6} />
    </Retour>
  );
}

/** Le lien « Retour » au-dessus du titre (desktop), sa zone tactile de 44 px sans changer la mise en page. */
export function LienRetourDesktop({ target, label = "Retour" }: { target: BackTarget; label?: string }) {
  const cls = "back-nudge relative inline-flex items-center gap-1.5 text-[14px] font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";
  return (
    <Retour target={target} className={cls}>
      <Icon name="back" size={18} color="#4B4A47" stroke={2.6} />
      {label}
    </Retour>
  );
}
