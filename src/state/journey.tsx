"use client";

/*
 * État du parcours côté interface (choix, fichiers, devinette…).
 * Gardé dans sessionStorage : il survit au rechargement de la page.
 */
import { useSyncExternalStore } from "react";
import { ecrireJson, lireJson } from "@/lib/stockage";
import { APPLIS, EXPORTS, GOALS, GUESSES, PRONOMS, type AppKind, type ExportApp, type Goal, type Guess, type Pronom } from "@/types";
import { CLE_PARCOURS } from "./cles";

export type JourneyState = {
  /** Appli choisie à l’écran 01 */
  app: AppKind | null;
  exportApp: ExportApp;
  exportFileName: string | null;
  /** Des captures ont été ajoutées après l’export : l’histoire est réunie (écran 05). */
  capturesAdded: boolean;
  me: string | null;
  /** Tu es un garçon (il) ou une fille (elle) : les prompts en ont besoin ; l’autre est l’opposé. */
  pronom: Pronom | null;
  /** Des captures : son prénom (il n’y apparaît que comme « Moi »). */
  prenom: string;
  /** Des captures dont la lecture n’a pas lu le nom de l’autre : son prénom, demandé par « Qui es-tu ? ». */
  prenomAutre: string;
  guess: Guess | null;
  goal: Goal | null;
  email: string;
};

const JOURNEY_DEFAULTS: JourneyState = {
  app: null,
  exportApp: "whatsapp",
  exportFileName: null,
  capturesAdded: false,
  me: null,
  pronom: null,
  prenom: "",
  prenomAutre: "",
  guess: null,
  goal: null,
  email: "",
};

const dans =
  <T extends string>(liste: readonly T[]) =>
  (v: unknown): v is T =>
    (liste as readonly unknown[]).includes(v);
const estApp = (v: unknown): v is AppKind => typeof v === "string" && Object.hasOwn(APPLIS, v);
const estTexte = (v: unknown): v is string => typeof v === "string";
const ouNull =
  <T,>(est: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || est(v);

/* Ce que chaque champ peut valoir : un champ d’une autre forme (une ancienne version, une main dans les outils du navigateur) reprend sa valeur par défaut */
const CHAMPS: { [K in keyof JourneyState]: (v: unknown) => v is JourneyState[K] } = {
  app: ouNull(estApp),
  exportApp: dans(EXPORTS),
  exportFileName: ouNull(estTexte),
  capturesAdded: (v): v is boolean => typeof v === "boolean",
  me: ouNull(estTexte),
  pronom: ouNull(dans(PRONOMS)),
  prenom: estTexte,
  prenomAutre: estTexte,
  guess: ouNull(dans(GUESSES)),
  goal: ouNull(dans(GOALS)),
  email: estTexte,
};

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** L’état gardé dans l’onglet, champ par champ : ce qui manque, ou n’a pas la bonne forme, prend sa valeur par défaut. */
function valider(brut: Record<string, unknown>): JourneyState {
  const champ = <K extends keyof JourneyState>(k: K): JourneyState[K] => {
    const v = brut[k];
    return CHAMPS[k](v) ? v : JOURNEY_DEFAULTS[k];
  };
  return {
    app: champ("app"),
    exportApp: champ("exportApp"),
    exportFileName: champ("exportFileName"),
    capturesAdded: champ("capturesAdded"),
    me: champ("me"),
    pronom: champ("pronom"),
    prenom: champ("prenom"),
    prenomAutre: champ("prenomAutre"),
    guess: champ("guess"),
    goal: champ("goal"),
    email: champ("email"),
  };
}

let state: JourneyState = JOURNEY_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  /* Rien, un JSON abîmé, ou le stockage refusé : le parcours part de zéro */
  const brut = lireJson(CLE_PARCOURS, estObjet, null, "session");
  if (brut) state = valider(brut);
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
  /* Refusé : le parcours vaut pour la page */
  ecrireJson(CLE_PARCOURS, state, "session");
  listeners.forEach((l) => l());
}

export function resetJourney() {
  setJourney(JOURNEY_DEFAULTS);
}

/* Rien à écouter : « hydraté » ne change qu’une fois, au passage du rendu serveur au navigateur */
const sansAbonnement = () => () => {};

/** Vrai une fois l’état du navigateur lu (après hydratation) : seul le composant qui le demande se re-rend. */
export function useHydrated() {
  return useSyncExternalStore(
    sansAbonnement,
    () => true,
    () => false,
  );
}

export function useJourney(): [JourneyState, typeof setJourney] {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [s, setJourney];
}

/** Seulement « qui est toi » : l’écran qui ne lit que lui ne se re-rend pas après l’hydratation, ni quand le reste du parcours change. */
export function useJourneyMe(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().me,
    () => JOURNEY_DEFAULTS.me,
  );
}
