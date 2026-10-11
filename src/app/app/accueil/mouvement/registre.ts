"use client";

import { useState } from "react";
import type { Box } from "@/lib/motion";

/*
 * Le registre de l’en-tête de l’accueil : ce qui en part ou s’y anime, vu d’ailleurs. La bulle de BLUSH (9 · elle vole
 * vers la feuille du contact, 11 · elle saute de joie), l’anneau de l’autre (11 · la fête d’un niveau) et son avatar
 * (9 · il vole vers la feuille). L’en-tête existe deux fois (mobile, et la barre de la fenêtre sur desktop) : chacun
 * s’inscrit à son montage par sa ref, et on prend celui qu’on voit. Avant, ils étaient cherchés dans toute la page par
 * leurs attributs (data-blush-logo, data-sophie, data-sophie-avatar), et tout ce qui les portait ailleurs aurait été pris.
 */

type Role = "logo" | "anneau" | "avatar";

/** Une ref à poser sur un élément de l’en-tête : il s’inscrit au montage et se retire au démontage. */
type Inscription = (el: HTMLElement | null) => (() => void) | undefined;

export type RegistreEntete = {
  /** La ref de chaque rôle : stable, posée telle quelle (`ref={entete.inscrire.logo}`). */
  inscrire: Record<Role, Inscription>;
  /** L’élément de ce rôle qu’on voit (mobile ou desktop), ou null. */
  visible: (role: Role) => HTMLElement | null;
};

export function creerRegistreEntete(): RegistreEntete {
  const inscrits: Record<Role, Set<HTMLElement>> = { logo: new Set(), anneau: new Set(), avatar: new Set() };
  const inscripteur =
    (role: Role): Inscription =>
    (el) => {
      if (!el) return;
      inscrits[role].add(el);
      return () => void inscrits[role].delete(el);
    };
  return {
    inscrire: { logo: inscripteur("logo"), anneau: inscripteur("anneau"), avatar: inscripteur("avatar") },
    visible: (role) => [...inscrits[role]].find((el) => el.getClientRects().length > 0) ?? null,
  };
}

/** Le registre de l’en-tête d’un accueil : le même pendant toute sa vie (ses refs ne changent jamais). */
export function useRegistreEntete() {
  const [registre] = useState(creerRegistreEntete);
  return registre;
}

/** 9 · Ce qui vole de l’en-tête vers la feuille du contact (la bulle de BLUSH, l’avatar de l’autre), et d’où. */
type Depart = { src: HTMLElement; from: Box };
export type Departs = { logo: Depart | null; av: Depart | null };

/** 9 · Relève d’où partent la bulle de BLUSH et l’avatar de l’autre (ceux qu’on voit, mobile ou desktop) : au toucher, quand la page est encore à jour. */
export function departs(entete: RegistreEntete): Departs {
  const de = (role: Role) => {
    const src = entete.visible(role);
    return src ? { src, from: src.getBoundingClientRect() } : null;
  };
  return { logo: de("logo"), av: de("avatar") };
}
