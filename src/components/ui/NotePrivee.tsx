import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NoteIcone } from "./feedback";

/*
 * La note de confidentialité des écrans : une promesse (src/contenu/confidentialite.ts), parfois suivie d’un lien discret
 * vers la page Confidentialité ou vers son détail. Un seul dessin pour toutes, au lieu d’un paragraphe recopié écran par
 * écran.
 */

/**
 * Une note de confidentialité : l’icône, puis le texte. `icone` : le cadenas des écrans du parcours, ou le bouclier du
 * rapport (un gris plus foncé, un trait plus épais). `petite` : dans une carte d’aide, un cran plus discrète (12,5 px,
 * un cadenas de 15 px un peu plus foncé pour rester lisible à cette taille). `className` : la marge et l’interligne de
 * l’écran qui la pose.
 */
export function NotePrivee({ children, icone = "lock", petite = false, className }: { children: ReactNode; icone?: "lock" | "shield"; petite?: boolean; className?: string }) {
  /* Le cadenas des écrans du parcours reste dans le gris doux ; le bouclier et le petit cadenas, dans le gris du texte */
  const doux = icone === "lock" && !petite;
  return (
    <NoteIcone icone={icone} taille={icone === "lock" && petite ? 15 : 16} ton={doux ? "muted" : "grey"} className={cn(petite ? "text-[12.5px]" : "text-legende", className)}>
      {children}
    </NoteIcone>
  );
}

const LIEN_DISCRET = "font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2";

/**
 * Un lien discret dans un texte gris : à l’encre, souligné d’un trait léger (« Comment ça marche »). Avec `href`, un lien ;
 * avec `onClick`, un bouton qui ouvre une feuille (« En savoir plus ») ou agit sur place (« Désactiver le lien »), sa
 * zone de toucher élargie au-delà du texte.
 */
export function LienDiscret(props: { href: Route; children: ReactNode } | { onClick: () => void; ouvreFeuille?: boolean; children: ReactNode }) {
  if ("href" in props)
    return (
      <Link href={props.href} className={LIEN_DISCRET}>
        {props.children}
      </Link>
    );
  return (
    <button type="button" onClick={props.onClick} aria-haspopup={props.ouvreFeuille ? "dialog" : undefined} className={cn("relative after:absolute after:-inset-2 after:content-['']", LIEN_DISCRET)}>
      {props.children}
    </button>
  );
}
