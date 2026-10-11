import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

/*
 * La note au cadenas des écrans : une promesse de confidentialité (src/contenu/confidentialite.ts), parfois suivie d’un
 * lien discret vers la page Confidentialité. Un seul dessin pour toutes, au lieu d’un paragraphe recopié écran par écran.
 */

/**
 * Une note de confidentialité : le cadenas, puis le texte. `petite` : dans une carte d’aide, un cran plus discrète
 * (12,5 px, un cadenas de 15 px un peu plus foncé pour rester lisible à cette taille). `className` : la marge et
 * l’interligne de l’écran qui la pose.
 */
export function NotePrivee({ children, petite = false, className }: { children: ReactNode; petite?: boolean; className?: string }) {
  return (
    <p className={cn("m-0 flex items-start gap-2 font-extrabold text-grey", petite ? "text-[12.5px]" : "text-[13px]", className)}>
      {petite ? <Icon name="lock" size={15} color="#6B6862" stroke={2.2} style={{ marginTop: 1 }} /> : <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />}
      <span>{children}</span>
    </p>
  );
}

/** Un lien discret dans un texte gris : à l’encre, souligné d’un trait léger (« Comment ça marche »). */
export function LienDiscret({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
      {children}
    </Link>
  );
}
