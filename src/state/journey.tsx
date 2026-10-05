"use client";

/**
 * État du parcours côté interface (choix, fichiers, devinette…).
 * Gardé dans sessionStorage : il survit au rechargement de la page.
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { AppKind, Goal, Guess } from "@/types";

export type JourneyState = {
  /** Appli choisie à l’écran 01 */
  app: AppKind | null;
  exportApp: "whatsapp" | "imessage";
  exportFileName: string | null;
  captureNames: string[];
  captureApp: AppKind | null;
  /** Des captures ont été ajoutées après l’export : l’histoire est réunie (écran 05). */
  capturesAdded: boolean;
  me: string | null;
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
  guess: null,
  goal: null,
  email: "",
  jobId: null,
  ficheCaptureName: null,
};

const KEY = "crush.journey.v1";
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

const HydratedContext = createContext(false);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <HydratedContext.Provider value={hydrated}>{children}</HydratedContext.Provider>;
}

/** Vrai une fois l’état du navigateur lu (après hydratation). */
export function useHydrated() {
  return useContext(HydratedContext);
}

export function useJourney(): [JourneyState, typeof setJourney] {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [s, setJourney];
}
