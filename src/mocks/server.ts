/**
 * Faux back-end : l’état « serveur » des mocks, gardé dans sessionStorage.
 * Seul src/services/api.ts l’utilise (et DemoParams pour les états de démo).
 */
import type { FicheFact, Plan } from "@/types";
import { FICHE } from "./daily";

export type MockServerState = {
  plan: Plan;
  verdict: "normal" | "difficile";
  email: string | null;
  analysisStartedAt: number | null;
  questionAsked: string | null;
  paused: boolean;
  cancelled: boolean;
  ficheFacts: FicheFact[];
  storyDeleted: boolean;
};

const KEY = "crush.mock-server.v1";

const DEFAULTS: MockServerState = {
  plan: "gratuit",
  verdict: "normal",
  email: null,
  analysisStartedAt: null,
  questionAsked: null,
  paused: false,
  cancelled: false,
  ficheFacts: FICHE.facts,
  storyDeleted: false,
};

let memory: MockServerState = DEFAULTS;

function read(): MockServerState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) memory = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible : on garde la mémoire vive */
  }
  return memory;
}

function write(next: MockServerState) {
  memory = next;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignoré */
  }
}

export const mockServer = {
  get: read,
  set(patch: Partial<MockServerState>) {
    write({ ...read(), ...patch });
  },
  reset(patch: Partial<MockServerState> = {}) {
    write({ ...DEFAULTS, ...patch });
  },
};

/** Latence simulée pour que les états de chargement existent. */
export function delay(ms: number) {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ms = Math.min(ms, 150);
  return new Promise<void>((r) => setTimeout(r, ms));
}
