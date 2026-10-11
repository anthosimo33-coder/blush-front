"use client";

import { useSyncExternalStore } from "react";

/*
 * Le stockage du navigateur (localStorage, sessionStorage), lu et écrit sans jamais lever. Ce qu’on y garde n’est
 * qu’une commodité (où tu t’étais arrêté, un bouton déjà ouvert, un réglage) : un stockage refusé (navigation privée,
 * Safari qui le bloque, quota plein), une valeur abîmée ou d’une autre forme, ou le rendu serveur, donnent la valeur
 * par défaut, et l’écran continue.
 */

type Zone = "local" | "session";

/** Le stockage de la zone, ou null : côté serveur, ou refusé (y toucher lève, dans certains navigateurs). */
function stockage(zone: Zone): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return zone === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** Ce qu’il y a sous `cle` : la valeur, null si elle est absente, undefined si le stockage est indisponible. */
function lireBrut(cle: string, zone: Zone): string | null | undefined {
  try {
    const s = stockage(zone);
    return s ? s.getItem(cle) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Le stockage de la zone répond-il ? Faux côté serveur, ou refusé. Pour une valeur dont l’absence (« jamais ») et le
 * refus (« on ne peut pas savoir ») ne disent pas la même chose, que lire et lireJson confondent.
 */
export function stockageDisponible(zone: Zone = "local"): boolean {
  return lireBrut("blush.sonde", zone) !== undefined;
}

/** La valeur sous `cle`, ou null : absente, ou stockage indisponible. */
export function lire(cle: string, zone: Zone = "local"): string | null {
  return lireBrut(cle, zone) ?? null;
}

/**
 * La valeur JSON sous `cle`, si elle a la forme attendue (`estValide`) ; sinon `defaut` : absente, JSON abîmé, d’une
 * autre forme (une ancienne version, une main dans les outils du navigateur), ou stockage indisponible.
 */
export function lireJson<T>(cle: string, estValide: (v: unknown) => v is T, defaut: T, zone: Zone = "local"): T {
  const brut = lire(cle, zone);
  if (brut === null) return defaut;
  try {
    const v: unknown = JSON.parse(brut);
    return estValide(v) ? v : defaut;
  } catch {
    return defaut;
  }
}

/** Écrit `valeur` sous `cle`. Rend false si le stockage refuse (indisponible, ou plein) : la valeur vaut pour la visite. */
export function ecrire(cle: string, valeur: string, zone: Zone = "local"): boolean {
  try {
    const s = stockage(zone);
    if (!s) return false;
    s.setItem(cle, valeur);
    return true;
  } catch {
    return false;
  }
}

/** Écrit `valeur` en JSON sous `cle` (voir ecrire). */
export function ecrireJson(cle: string, valeur: unknown, zone: Zone = "local"): boolean {
  return ecrire(cle, JSON.stringify(valeur), zone);
}

/** Un drapeau retenu sur cet appareil (localStorage, « 1 » ou « 0 ») : voir drapeauLocal. */
export type DrapeauLocal = {
  /** Sa valeur : lue une fois dans le navigateur, puis gardée en mémoire (et changée par poser). */
  lire: () => boolean;
  /** Le pose, et prévient les écrans qui le suivent (useDrapeau). Si le navigateur refuse de l’écrire, il vaut pour la visite. */
  poser: (valeur: boolean) => void;
  /** Suit ses changements (le `subscribe` de useSyncExternalStore). */
  abonner: (f: () => void) => () => void;
  /** Sa valeur côté serveur, et à l’hydratation d’une page du serveur. */
  serveur: boolean;
};

/**
 * Un drapeau retenu sur cet appareil, sous `cle` : « 1 » vrai, « 0 » faux, toute autre valeur (ou rien) `defaut`.
 * `indisponible` : sa valeur quand le navigateur refuse le stockage (par défaut `defaut`) ; `serveur` : sa valeur au rendu
 * du serveur (par défaut `defaut`). Pour un drapeau qui fait bouger l’écran tant qu’il n’est pas posé (un bouton qui
 * s’agite), `indisponible` et `serveur` à vrai le gardent calme quand on ne peut pas savoir.
 */
export function drapeauLocal(cle: string, { defaut, indisponible = defaut, serveur = defaut }: { defaut: boolean; indisponible?: boolean; serveur?: boolean }): DrapeauLocal {
  const abonnes = new Set<() => void>();
  let memo: boolean | null = null;
  const lu = (): boolean => {
    const brut = lireBrut(cle, "local");
    if (brut === undefined) return indisponible;
    return brut === "1" ? true : brut === "0" ? false : defaut;
  };
  return {
    lire: () => (memo ??= lu()),
    poser: (valeur) => {
      ecrire(cle, valeur ? "1" : "0");
      memo = valeur;
      abonnes.forEach((f) => f());
    },
    abonner: (f) => {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
    serveur,
  };
}

/** La valeur d’un drapeau retenu sur cet appareil, et l’écran se re-rend quand il change. */
export function useDrapeau(drapeau: DrapeauLocal): boolean {
  return useSyncExternalStore(drapeau.abonner, drapeau.lire, () => drapeau.serveur);
}
