"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { TypingDots } from "./feedback";

/**
 * Dans un lien, à la place de son icône (la flèche, le chevron) : les trois points de BLUSH tant que la page demandée
 * n’est pas là. Le toucher a été pris, même quand le serveur prend son temps. Seulement au-delà de 100 ms : une page
 * préchargée ou rapide ne clignote pas. Les points prennent la place de l’icône, rien ne bouge autour.
 */
export function EnRoute({ children, color, size = 5 }: { children: ReactNode; color?: string; size?: number }) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <span className="inline-flex" style={pending ? { animation: "fadeIn 0.12s ease-in 0.1s reverse both" } : undefined}>
        {children}
      </span>
      {pending && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center" style={{ animation: "fadeIn 0.12s ease-out 0.1s both" }}>
          <TypingDots size={size} color={color} />
        </span>
      )}
    </span>
  );
}
