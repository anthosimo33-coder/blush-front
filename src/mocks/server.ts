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
  /** La question posée est une idée toute prête : son rang parmi les idées de l’histoire ouverte. */
  questionIdee: number | null;
  paused: boolean;
  cancelled: boolean;
  ficheFacts: FicheFact[];
  /** Quelque chose a été ajouté à sa fiche pendant la session (« mise à jour aujourd’hui »). */
  ficheUpdated: boolean;
  storyDeleted: boolean;
};

const KEY = "blush.mock-server.v1";

/*
 * L’état vit dans sessionStorage, que le serveur ne voit pas : il rendait le rapport en version gratuite, puis la relecture
 * du navigateur le basculait (tout sautait). Ce qui change l’affichage des pages serveur est donc recopié dans ce cookie,
 * lu par src/services/serveur.ts (voir avecEtat). Rien de ce qu’il a écrit (le cookie part vers le serveur à chaque
 * requête) : le plan, le verdict, l’abonnement, et s’il a donné son email ou posé sa question (le rang de l’idée, si
 * c’en est une toute prête).
 */
export const DEMO_COOKIE = "blush-demo";
type EtatRecopie = Pick<MockServerState, "plan" | "verdict" | "paused" | "cancelled" | "storyDeleted"> & { email: boolean; question: number | boolean };
const recopie = (s: MockServerState): EtatRecopie => ({
  plan: s.plan,
  verdict: s.verdict,
  paused: s.paused,
  cancelled: s.cancelled,
  storyDeleted: s.storyDeleted,
  email: s.email !== null,
  question: s.questionAsked === null ? false : (s.questionIdee ?? true),
});
/* Côté serveur, son email ou sa question à lui, restés dans le navigateur : la ligne est là, son texte arrive à la relecture */
export const RESTE_DANS_LE_NAVIGATEUR = "…";

const DEFAULTS: MockServerState = {
  plan: "gratuit",
  verdict: "normal",
  email: null,
  analysisStartedAt: null,
  questionAsked: null,
  questionIdee: null,
  paused: false,
  cancelled: false,
  ficheFacts: FICHE.facts,
  ficheUpdated: false,
  storyDeleted: false,
};

let memory: MockServerState = DEFAULTS;
/* Côté serveur : l’état du cookie, le temps d’un appel (avecEtat) ; sinon, l’état de départ */
let surLeServeur: MockServerState | null = null;

function read(): MockServerState {
  if (typeof window === "undefined") return surLeServeur ?? DEFAULTS;
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
  document.cookie = `${DEMO_COOKIE}=${encodeURIComponent(JSON.stringify(recopie(next)))}; path=/; samesite=lax`;
}

/** L’état recopié dans le cookie (la valeur brute), réduit à ce qu’il doit contenir. Rien d’utilisable : l’état de départ. */
export function etatDuCookie(valeur: string | undefined): Partial<MockServerState> {
  if (!valeur) return {};
  try {
    const brut = JSON.parse(decodeURIComponent(valeur)) as Record<string, unknown>;
    const etat: Partial<MockServerState> = {};
    if (brut.plan === "gratuit" || brut.plan === "rapport" || brut.plan === "blushplus") etat.plan = brut.plan;
    if (brut.verdict === "normal" || brut.verdict === "difficile") etat.verdict = brut.verdict;
    if (typeof brut.email === "boolean") etat.email = brut.email ? RESTE_DANS_LE_NAVIGATEUR : null;
    if (typeof brut.question === "boolean") etat.questionAsked = brut.question ? RESTE_DANS_LE_NAVIGATEUR : null;
    if (Number.isInteger(brut.question) && (brut.question as number) >= 0) {
      etat.questionAsked = RESTE_DANS_LE_NAVIGATEUR;
      etat.questionIdee = brut.question as number;
    }
    for (const k of ["paused", "cancelled", "storyDeleted"] as const) if (typeof brut[k] === "boolean") etat[k] = brut[k];
    return etat;
  } catch {
    return {};
  }
}

/**
 * Côté serveur (démo) : `lire` voit l’état du cookie au lieu de l’état de départ. L’état n’est posé que pendant la partie
 * synchrone de `lire` : les fonctions de démo de src/services/api.ts le lisent avant leur premier await.
 */
export function avecEtat<T>(etat: Partial<MockServerState>, lire: () => T): T {
  surLeServeur = { ...DEFAULTS, ...etat };
  try {
    return lire();
  } finally {
    surLeServeur = null;
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
