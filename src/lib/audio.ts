"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/*
 * L’audio du navigateur, écrit une fois : la session audio de Safari (le mode silencieux, le micro), le contexte Web
 * Audio, et le lecteur des vocaux (celui du rapport, ceux de BLUSH dans le chat, les tiens). Les sons de l’appli,
 * synthétisés, sont dans sound.ts.
 */

declare global {
  interface Window {
    /** Le contexte audio des anciens Safari (avant la 14.1), sous son ancien nom. */
    webkitAudioContext?: typeof AudioContext;
  }
}

/* ———— La session audio de Safari ———— */

type TypeDeSession = "auto" | "ambient" | "playback";
type NavigateurAvecSession = Navigator & { audioSession?: { type: string } };

/* Ceux qui demandent que le son s’entende même en silencieux (prendreSonForce), et l’enregistrement d’un vocal */
let forces = 0;
let enregistrement = false;

/**
 * Pose la session audio de Safari d’après ce qui se passe : « auto » pendant un vocal (Safari doit pouvoir ouvrir le
 * micro), « playback » tant que quelqu’un tient le son forcé (il s’entend même en silencieux, comme une story),
 * « ambient » sinon (les sons de l’appli se mélangent à ta musique, et l’interrupteur silencieux les coupe).
 */
export function appliquerSession() {
  if (typeof navigator === "undefined") return;
  const s = (navigator as NavigateurAvecSession).audioSession;
  if (!s) return;
  const type: TypeDeSession = enregistrement ? "auto" : forces > 0 ? "playback" : "ambient";
  try {
    if (s.type !== type) s.type = type;
  } catch {
    /* Ancien Safari : il garde son choix */
  }
}

/**
 * Le son s’entend même en mode silencieux (comme une story) tant qu’on le tient : la révélation du verdict, bouton son
 * touché, ou un vocal qui joue. Rend de quoi le lâcher ; lâcher deux fois ne compte qu’une. Un compteur, pas un
 * interrupteur : le vocal qui s’arrête ne coupe pas celui qui le remplace, ni le bouton son du verdict.
 */
export function prendreSonForce(): () => void {
  forces++;
  appliquerSession();
  let lache = false;
  return () => {
    if (lache) return;
    lache = true;
    forces--;
    appliquerSession();
  };
}

/** Pendant un vocal, Safari doit pouvoir ouvrir le micro : on lui rend la main, puis on revient en « ambient ». */
export function setRecording(on: boolean) {
  enregistrement = on;
  appliquerSession();
}

/* ———— Le contexte Web Audio ———— */

const classeAudioContext = () => (typeof window === "undefined" ? undefined : (window.AudioContext ?? window.webkitAudioContext));

/** Le navigateur sait-il faire un contexte audio (Web Audio) ? */
export const audioContextDisponible = () => !!classeAudioContext();

/**
 * Un contexte audio, ou null : pas de Web Audio, ou le navigateur en refuse un de plus. À créer pendant un toucher :
 * sur iPhone, sinon, il reste muet.
 */
export function creerAudioContext(options?: AudioContextOptions): AudioContext | null {
  const AC = classeAudioContext();
  if (!AC) return null;
  try {
    return new AC(options);
  } catch {
    return null;
  }
}

/* ———— Un seul vocal à la fois ———— */

/* Le vocal qui joue (de BLUSH ou le tien) : en lancer un autre l’arrête */
let enCours: HTMLAudioElement | null = null;

/** Arrête le vocal qui joue, s’il y en a un : on ne s’enregistre pas par-dessus. */
export function arreterLeVocal() {
  enCours?.pause();
}

/* ———— Le lecteur ———— */

/**
 * Le son préparé en mémoire avant le toucher (jamais sur le disque : l’audio reste « no-store ») : son adresse locale, à
 * rendre par URL.revokeObjectURL, ou null (réseau coupé, arrêté par `signal`). Au toucher, l’élément audio part de lui,
 * sans attendre le réseau.
 */
export async function chargerEnMemoire(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(url, { credentials: "same-origin", signal });
    const b = r.ok ? await r.blob() : null;
    return b && !signal.aborted ? URL.createObjectURL(b) : null;
  } catch {
    /* Rien en mémoire : le toucher lira le son sur le réseau */
    return null;
  }
}

type OptionsLecteur = {
  /**
   * L’adresse du son, lue à la naissance de l’élément audio (dans le toucher : sinon Safari refuse de jouer). `refait` :
   * l’élément d’avant est en erreur, on en refait un (le réseau est peut-être revenu).
   */
  source: (refait: boolean) => string;
  /** Comme une story : il s’entend même quand le téléphone est en silencieux, tant qu’il joue (prendreSonForce). */
  forcerSon?: boolean;
  /** `temps` suit l’audio quelques fois par seconde (timeupdate). Sans, il ne change qu’à la pause, aux sauts et par poserTemps. */
  suivreTemps?: boolean;
  /** Le son est allé au bout (après la pause qu’il a faite, qui a posé `temps` à la fin). */
  surFin?: (a: HTMLAudioElement) => void;
};

export type LecteurAudio = {
  /** L’élément audio, une fois né (au premier toucher) : null avant. */
  element: RefObject<HTMLAudioElement | null>;
  joue: boolean;
  /** Le son se charge (réseau lent) : rien ne doit « parler » dans le vide. */
  attente: boolean;
  /** Le son ne vient pas (réseau coupé) : jouer le relance. */
  coupe: boolean;
  /** Où en est l’écoute, en secondes (voir `suivreTemps`). */
  temps: number;
  /** La durée que l’élément connaît (null avant ses métadonnées, ou s’il ne la sait pas), lue avec `temps`. */
  duree: number | null;
  /** Lance le son (depuis `depuis` s’il est donné) et arrête celui qui jouait. Dans un toucher. */
  jouer: (depuis?: number) => void;
  /** Pause s’il joue, lecture sinon. Dans un toucher. */
  basculer: () => void;
  pause: () => void;
  /** Va à `t` secondes, sans changer pause ou lecture. */
  aller: (t: number) => void;
  /** Pose `temps` (une boucle qui suit l’audio à chaque image, la fin). */
  poserTemps: (t: number) => void;
};

/**
 * Un vocal à écouter : l’élément audio naît au premier toucher, un seul vocal joue à la fois dans la page, et le son
 * forcé (`forcerSon`) n’est tenu que pendant qu’il joue. Il s’arrête quand l’écran qui le montre s’en va.
 */
export function useLecteurAudio({ source, forcerSon = false, suivreTemps = false, surFin }: OptionsLecteur): LecteurAudio {
  const element = useRef<HTMLAudioElement | null>(null);
  const [joue, setJoue] = useState(false);
  const [attente, setAttente] = useState(false);
  const [coupe, setCoupe] = useState(false);
  const [temps, setTemps] = useState(0);
  const [duree, setDuree] = useState<number | null>(null);
  /* L’élément naît une fois et vit plus longtemps qu’un rendu : il lit les options du dernier ici */
  const options = useRef({ source, forcerSon, suivreTemps, surFin });
  useLayoutEffect(() => {
    options.current = { source, forcerSon, suivreTemps, surFin };
  });
  /* Le son forcé que ce lecteur tient, s’il en tient un */
  const sonForce = useRef<(() => void) | null>(null);
  const lacherLeSon = () => {
    sonForce.current?.();
    sonForce.current = null;
  };

  const lecteur = () => {
    const avant = element.current;
    /* Un élément en erreur ne repart pas : on en refait un */
    if (avant && !avant.error) return avant;
    const a = new Audio(options.current.source(!!avant));
    a.preload = "auto";
    a.onplay = () => setJoue(true);
    /* En pause (à la main, par un autre vocal, à la fin) : le temps se recale, et le mode silencieux reprend la main */
    a.onpause = () => {
      setJoue(false);
      setTemps(a.currentTime);
      lacherLeSon();
    };
    a.onwaiting = a.onstalled = () => setAttente(true);
    a.onplaying = () => setAttente(false);
    a.ontimeupdate = () => {
      if (!options.current.suivreTemps) return;
      setTemps(a.currentTime);
      setDuree(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null);
    };
    a.onerror = () => {
      setJoue(false);
      setAttente(false);
      setCoupe(true);
      lacherLeSon();
    };
    a.onended = () => {
      setJoue(false);
      lacherLeSon();
      options.current.surFin?.(a);
    };
    element.current = a;
    return a;
  };

  const jouer = (depuis?: number) => {
    setCoupe(false);
    const a = lecteur();
    if (depuis !== undefined) {
      a.currentTime = depuis;
      setTemps(depuis);
    }
    if (enCours && enCours !== a) enCours.pause();
    enCours = a;
    if (options.current.forcerSon) sonForce.current ??= prendreSonForce();
    a.play().catch(() => {
      /* Refusé, ou arrêté avant de partir : rien ne joue (un nouvel essai, parti depuis, garde sa lecture) */
      if (!a.paused) return;
      setJoue(false);
      lacherLeSon();
    });
  };

  const basculer = () => {
    const a = lecteur();
    if (a.paused) jouer();
    else a.pause();
  };

  const aller = (t: number) => {
    const a = lecteur();
    a.currentTime = t;
    setTemps(a.currentTime);
  };

  /* L’écran s’en va : son vocal s’arrête, et le son forcé est lâché */
  const quitter = useRef(() => {});
  useLayoutEffect(() => {
    quitter.current = () => {
      const a = element.current;
      a?.pause();
      if (enCours === a) enCours = null;
      lacherLeSon();
    };
  });
  useEffect(() => () => quitter.current(), []);

  return { element, joue, attente, coupe, temps, duree, jouer, basculer, pause: () => element.current?.pause(), aller, poserTemps: setTemps };
}
