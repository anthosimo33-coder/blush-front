"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lireLeRepereDuTournage } from "@/services/api";

/*
 * Le repère du mode tournage, sur les écrans de l’import (posé par les layouts de /importer, /qui et /lecture) : pour un
 * compte de BLUSH_ADMINS dont le navigateur garde le cookie d’un lien de tournage, ouvert pour essayer. Sans lui, rien ne
 * dit que ses captures ne seront pas lues et que la lecture rejouera la conv du lien (src/server/tournage.ts). Il nomme
 * le lien et mène à /tournage, où on quitte le mode. Le serveur seul décide (GET /api/tournage/repere) : une créatrice ou
 * un visiteur sans compte y reçoivent null, et rien ne s’affiche sur les écrans qu’elles filment.
 * Une pastille blanche, comme « Mon compte », avec le point rouge d’un enregistrement : posée en haut de la page, au milieu
 * de la barre du haut (vide sur ces écrans), elle défile avec elle, sans jamais couvrir le contenu. Hors de l’arbre de
 * l’écran (un portail), elle ne dépend pas de sa mise en page.
 */
export function RepereTournage() {
  const [nom, setNom] = useState<string | null>(null);

  useEffect(() => {
    const arret = new AbortController();
    lireLeRepereDuTournage(arret.signal).then(
      ({ nom }) => setNom(nom),
      /* Repli voulu : sans réponse (le réseau, l’écran quitté), pas de repère ; l’écran, lui, marche comme d’habitude */
      () => {},
    );
    return () => arret.abort();
  }, []);

  if (!nom) return null;
  return createPortal(
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[60px] items-center justify-center px-[68px] lg:h-[84px]">
      <Link
        href="/tournage"
        aria-label={`Mode tournage\u00a0: ${nom}. Ouvrir la page du mode tournage`}
        title={`Mode tournage\u00a0: ${nom}`}
        className="lift lift-sm pointer-events-auto inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 text-legende font-black text-ink no-underline shadow-soft"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
        {/* « Tournage » seul sur mobile : la place va au nom du lien */}
        <span className="shrink-0">
          <span className="hidden lg:inline">Mode tournage</span>
          <span className="lg:hidden">Tournage</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-pale">
          ·
        </span>
        <span className="min-w-0 truncate text-grey">{nom}</span>
      </Link>
    </div>,
    document.body,
  );
}
