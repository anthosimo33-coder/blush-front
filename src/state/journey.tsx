"use client";

/**
 * État du parcours côté interface (choix, fichiers, devinette…).
 * Gardé dans sessionStorage : il survit au rechargement de la page.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import type { AppKind, Goal, Guess } from "@/types";

export type JourneyState = {
  /** Appli choisie à l’écran 01 */
  app: AppKind | null;
  exportApp: "whatsapp" | "imessage" | "instagram";
  exportFileName: string | null;
  captureNames: string[];
  captureApp: AppKind | null;
  /** Des captures ont été ajoutées après l’export : l’histoire est réunie (écran 05). */
  capturesAdded: boolean;
  me: string | null;
  /** Tu es un garçon (il) ou une fille (elle) : les prompts en ont besoin ; l’autre est l’opposé. */
  pronom: "il" | "elle" | null;
  /** Des captures : son prénom (il n’y apparaît que comme « Moi »). */
  prenom: string;
  guess: Guess | null;
  goal: Goal | null;
  email: string;
  jobId: string | null;
  /** La relance du samedi n’est proposée qu’une seule fois. */
  ficheCaptureName: string | null;
};

export const JOURNEY_DEFAULTS: JourneyState = {
  app: null,
  exportApp: "whatsapp",
  exportFileName: null,
  captureNames: [],
  captureApp: null,
  capturesAdded: false,
  me: null,
  pronom: null,
  prenom: "",
  guess: null,
  goal: null,
  email: "",
  jobId: null,
  ficheCaptureName: null,
};

const KEY = "blush.journey.v1";
let state: JourneyState = JOURNEY_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) state = { ...JOURNEY_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible */
  }
}

function getSnapshot() {
  load();
  return state;
}

/** L’état du parcours tel qu’il est maintenant (hors rendu : dans un effet, avant la fin de l’hydratation). */
export const readJourney = getSnapshot;

function getServerSnapshot() {
  return JOURNEY_DEFAULTS;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setJourney(patch: Partial<JourneyState> | ((s: JourneyState) => Partial<JourneyState>)) {
  load();
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignoré */
  }
  listeners.forEach((l) => l());
}

export function resetJourney() {
  setJourney(JOURNEY_DEFAULTS);
}

/* Rien à écouter : « hydraté » ne change qu’une fois, au passage du rendu serveur au navigateur */
const sansAbonnement = () => () => {};

/*
 * Le parcours vit hors de React (sessionStorage, useJourney) : ce fournisseur ne transmet rien. Il ne doit surtout pas
 * changer de valeur à l’hydratation : un contexte qui change à la racine fait rendre de zéro, côté navigateur, toute
 * frontière Suspense pas encore hydratée (l’écran de chargement d’une page, dont le contenu attend encore d’être
 * dévoilé), au lieu de l’hydrater. Le contenu envoyé par le serveur reste alors un moment en double, caché.
 */
export function JourneyProvider({ children }: { children: ReactNode }) {
  return children;
}

/** Vrai une fois l’état du navigateur lu (après hydratation) : seul le composant qui le demande se re-rend. */
export function useHydrated() {
  return useSyncExternalStore(sansAbonnement, () => true, () => false);
}

export function useJourney(): [JourneyState, typeof setJourney] {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [s, setJourney];
}

/** Seulement « qui est toi » : l’écran qui ne lit que lui ne se re-rend pas après l’hydratation, ni quand le reste du parcours change. */
export function useJourneyMe(): string | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().me, () => JOURNEY_DEFAULTS.me);
}
