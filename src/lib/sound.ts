"use client";

import { useEffect, useRef } from "react";
import { appliquerSession, audioContextDisponible, creerAudioContext } from "./audio";
import { auRepos } from "./repos";
import { tracer } from "./tracer";
import { drapeauLocal, useDrapeau } from "./stockage";

/*
 * Le son de BLUSH (v2, « sobre ») : des touchers courts et ronds, tirés des trois perles du logo, en Ré pentatonique.
 * Tout est synthétisé par le navigateur (Web Audio) : aucun fichier à charger, une note se change en une ligne.
 * - Un son suit toujours un geste, ou BLUSH qui te répond. Jamais pour attirer ton attention.
 * - Il se mélange à ta musique sans la couper, et l’interrupteur silencieux le coupe (session audio « ambient »).
 *   Seule la révélation du verdict, quand on touche son bouton son, joue même en silencieux (« playback »,
 *   prendreSonForce dans audio.ts, qui tient aussi la session de Safari).
 * - Le mode sobre (une alerte de danger) ne sonne pas : la scène n’existe pas.
 * - Chaque son qui suit un geste a sa vibration. Un seul réglage pour les deux : « Sons et vibrations », dans Mon compte.
 * Partitions et essais à l’oreille : https://claude.ai/artifact/5hiJBPv1egEEpVbwqY2WC5
 */

/* ———— Le réglage ———— */

/* Allumé tant qu’on ne l’a pas coupé (et quand le navigateur ne sait pas le dire) */
const REGLAGE = drapeauLocal("blush.sons.v1", { defaut: true });
const enabled = REGLAGE.lire;

export function setSoundsEnabled(on: boolean) {
  REGLAGE.poser(on);
  /* Réactivé d’un toucher : le son se réveille tout de suite, pour la confirmation qui suit */
  if (on) wake();
}

export function useSoundsEnabled() {
  return useDrapeau(REGLAGE);
}

/* ———— Le moteur ———— */

type Chain = { ac: AudioContext; dry: GainNode; send: GainNode; noise: AudioBuffer; room: ConvolverNode };
let chain: Chain | null = null;

/*
 * Les échantillons de la pièce (1,1 s de réverbération en stéréo) et du bruit : une centaine de milliers de calculs.
 * Faits au repos après le chargement, pas dans le premier toucher (qui passe avant les gestionnaires de la page).
 * Pour 48 kHz, la fréquence de l’iPhone ; refaits hors du geste si la sortie en a une autre.
 */
type Echantillons = { sr: number; piece: [Float32Array, Float32Array]; bruit: Float32Array };
let prets: Echantillons | null = null;

function piece(sr: number, sec: number) {
  const len = Math.floor(sr * sec);
  const pre = Math.floor(sr * 0.012);
  const d = new Float32Array(len);
  let y = 0;
  for (let i = pre; i < len; i++) {
    y += 0.4 * ((Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) - y);
    d[i] = y;
  }
  return d;
}

function bruit(sr: number) {
  const d = new Float32Array(sr);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return d;
}

const echantillons = (sr: number): Echantillons => (prets?.sr === sr ? prets : (prets = { sr, piece: [piece(sr, 1.1), piece(sr, 1.1)], bruit: bruit(sr) }));

/** La sortie : une petite pièce (les sons restent près de toi), un filtre doux, un compresseur qui retient les accords. */
function build(ac: AudioContext): Chain {
  const out = ac.createGain();
  out.gain.value = 1.25;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 12000;
  lp.connect(comp).connect(out).connect(ac.destination);
  const dry = ac.createGain();
  dry.connect(lp);
  /* La pièce reçoit sa réverbération juste après le geste (remplirLaPiece) : le tout premier son peut partir sec */
  const room = ac.createConvolver();
  const wet = ac.createGain();
  wet.gain.value = 0.7;
  const send = ac.createGain();
  send.connect(room).connect(wet).connect(lp);
  /* Le bruit sert dès le premier son (souffle, grain) : recopié tout de suite, s’il est prêt (sinon un calcul bref) */
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  noise.getChannelData(0).set(prets?.sr === ac.sampleRate ? prets.bruit : bruit(ac.sampleRate));
  return { ac, dry, send, noise, room };
}

/* Hors du geste : la réverbération (sa préparation par le navigateur est synchrone, quelques ms) */
function remplirLaPiece(c: Chain) {
  if (c.room.buffer) return;
  const {
    sr,
    piece: [g, d],
  } = echantillons(c.ac.sampleRate);
  const b = c.ac.createBuffer(2, g.length, sr);
  b.getChannelData(0).set(g);
  b.getChannelData(1).set(d);
  c.room.buffer = b;
}

/** Réveille le son pendant un geste : Safari garde une page muette tant qu’on ne l’a pas touchée. */
function wake() {
  if (!enabled() || !audioContextDisponible()) return;
  appliquerSession();
  if (!chain) {
    const ac = creerAudioContext({ latencyHint: "interactive" });
    if (!ac) return;
    const c = (chain = build(ac));
    /* iPhone : un son vide joué dans le geste ouvre la sortie */
    const s = ac.createBufferSource();
    s.buffer = ac.createBuffer(1, 1, 22050);
    s.connect(ac.destination);
    s.start(0);
    auRepos(() => remplirLaPiece(c), 100);
  }
  if (chain.ac.state !== "running") chain.ac.resume().catch((e: unknown) => tracer("son:reprise", e));
}

let booted = false;
/** À appeler une fois, au montage de l’app : chaque toucher garde le son éveillé (Safari le suspend après un appel, par exemple). */
export function bootSound() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) window.addEventListener(type, wake, { capture: true, passive: true });
  /* Les échantillons se calculent pendant que la page est au repos, avant le premier toucher */
  auRepos(() => {
    if (enabled()) echantillons(48000);
  });
}

/* ———— Les instruments ———— */

type Note =
  | { k: "toucher"; t: number; m: number; v?: number; d?: number; br?: number; opale?: boolean }
  | { k: "pop"; t: number; m: number; v?: number }
  | { k: "clic"; t: number; f: number; v?: number }
  | { k: "souffle"; t: number; f0: number; f1: number; d: number; v?: number }
  | { k: "accord"; t: number; ms: number[]; d: number; v?: number; a?: number; cut?: number };

type Out = { ac: AudioContext; c: Chain; nodes: AudioScheduledSourceNode[] };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function osc({ ac, nodes }: Out, type: OscillatorType, f: number, t: number, end: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(end);
  nodes.push(o);
  return o;
}

function env({ ac }: Out, t: number, peak: number, attack: number, decay: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function route(o: Out, node: AudioNode, pan: number, send: number) {
  let last = node;
  if (pan && o.ac.createStereoPanner) {
    const p = o.ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    last = p;
  }
  last.connect(o.c.dry);
  if (send) {
    const g = o.ac.createGain();
    g.gain.value = send;
    last.connect(g).connect(o.c.send);
  }
}

/** Un grain de bruit très bref : le contact du doigt. */
function grain(o: Out, t: number, into: AudioNode, f: number, peak: number, d: number) {
  const src = o.ac.createBufferSource();
  src.buffer = o.c.noise;
  const bp = o.ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f;
  bp.Q.value = 0.8;
  src
    .connect(bp)
    .connect(env(o, t, peak, 0.0006, d))
    .connect(into);
  src.start(t, Math.random() * 0.5);
  src.stop(t + d + 0.02);
  o.nodes.push(src);
}

/** Un toucher : une note très courte qui tombe en place, filtrée, avec un grain de contact. L’opale ajoute une octave à peine présente. */
function toucher(o: Out, t: number, n: Extract<Note, { k: "toucher" }>) {
  const f = mtof(n.m);
  const v = n.v ?? 0.5;
  const d = n.d ?? 0.12;
  const br = n.br ?? 1;
  const lp = o.ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(8000, f * (2.5 + 2.5 * br));
  lp.Q.value = 0.4;
  const c = osc(o, "sine", f * 1.5, t, t + d + 0.1);
  c.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  c.connect(env(o, t, 0.42 * v, 0.002, d)).connect(lp);
  const tr = osc(o, "triangle", f, t, t + d * 0.6 + 0.05);
  tr.connect(env(o, t, 0.08 * v * br, 0.002, d * 0.5)).connect(lp);
  if (n.opale)
    osc(o, "sine", f * 2.004, t, t + d * 1.6 + 0.1)
      .connect(env(o, t, 0.05 * v, 0.006, d * 1.6))
      .connect(lp);
  grain(o, t, lp, 2500, 0.05 * v * br, 0.006);
  route(o, lp, Math.max(-0.2, Math.min(0.2, (n.m - 74) / 40)), 0.08);
}

/** Un pop : une bulle ronde, courte, sans glissade. */
function pop(o: Out, t: number, n: Extract<Note, { k: "pop" }>) {
  const f = mtof(n.m);
  const lp = o.ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3000;
  const c = osc(o, "sine", f * 0.7, t, t + 0.16);
  c.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.035);
  c.connect(env(o, t, 0.38 * (n.v ?? 0.5), 0.003, 0.085)).connect(lp);
  route(o, lp, -0.05, 0.06);
}

/** Un clic : mat, comme le cran d’une molette. */
function clic(o: Out, t: number, n: Extract<Note, { k: "clic" }>) {
  const v = n.v ?? 0.5;
  const bus = o.ac.createGain();
  const c = osc(o, "sine", n.f * 1.4, t, t + 0.04);
  c.frequency.exponentialRampToValueAtTime(n.f, t + 0.006);
  c.connect(env(o, t, 0.22 * v, 0.0008, 0.018)).connect(bus);
  grain(o, t, bus, 3000, 0.08 * v, 0.006);
  route(o, bus, 0, 0.03);
}

/** Un souffle feutré : du bruit filtré dont la hauteur glisse (vers le haut quand ça part, vers le bas quand ça se range). */
function souffle(o: Out, t: number, n: Extract<Note, { k: "souffle" }>) {
  const src = o.ac.createBufferSource();
  src.buffer = o.c.noise;
  const bp = o.ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(n.f0, t);
  bp.frequency.exponentialRampToValueAtTime(n.f1, t + n.d);
  const lp = o.ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3500;
  const g = o.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime((n.v ?? 0.4) * 0.7, t + n.d * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
  src.connect(bp).connect(lp).connect(g);
  src.start(t, Math.random() * 0.4);
  src.stop(t + n.d + 0.05);
  o.nodes.push(src);
  route(o, g, 0, 0.05);
}

/** Un accord chaud : toutes les notes ensemble, qui s’ouvrent et s’éteignent. Sans arpège. */
function accord(o: Out, t: number, n: Extract<Note, { k: "accord" }>) {
  const a = n.a ?? 0.035;
  const cut = n.cut ?? 2200;
  const lp = o.ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(cut * 0.6, t);
  lp.frequency.exponentialRampToValueAtTime(cut, t + a);
  lp.frequency.exponentialRampToValueAtTime(cut * 0.4, t + n.d);
  const g = o.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime((0.17 * (n.v ?? 0.5)) / Math.sqrt(n.ms.length), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
  n.ms.forEach((m, i) => {
    const f = mtof(m);
    const s = osc(o, "sine", f, t, t + n.d + 0.1);
    s.detune.value = i % 2 ? 3 : -3;
    s.connect(lp);
    const tr = osc(o, "triangle", f, t, t + n.d + 0.1);
    const gt = o.ac.createGain();
    gt.gain.value = 0.25;
    tr.connect(gt).connect(lp);
  });
  lp.connect(g);
  route(o, g, 0, 0.3);
}

/* ———— Les partitions (les notes en MIDI : 62 Ré4, 64 Mi4, 66 Fa♯4, 69 La4, 74 Ré5, 76 Mi5, 78 Fa♯5, 81 La5) ———— */

const T = (t: number, m: number, o: Partial<Extract<Note, { k: "toucher" }>> = {}): Note => ({ k: "toucher", t, m, v: 0.5, d: 0.12, ...o });
const chord = (t: number, ms: number[], d: number, o: Partial<Extract<Note, { k: "accord" }>> = {}): Note => ({ k: "accord", t, ms, d, v: 0.5, ...o });
const RISE = [74, 76, 78, 81, 83] as const;

/** La signature : La, Fa♯, puis Ré en opale, comme les trois perles du logo qui sautent l’une après l’autre. */
const signature = (t = 0, gap = 0.075, shift = 0): Note[] => [
  T(t, 69 + shift, { v: 0.36 }),
  T(t + gap, 78 + shift, { v: 0.34 }),
  T(t + 2 * gap, 74 + shift, { v: 0.44, opale: true, d: 0.45 }),
];
const envoi = (): Note[] => [{ k: "souffle", t: 0, f0: 500, f1: 1500, d: 0.13, v: 0.4 }, T(0.11, 74, { v: 0.3, d: 0.09 })];
/** L’emoji du verdict touche le sol à 0,69 s (vDrop dans globals.css) : l’accord tombe avec lui. */
const LAND = 0.69;
const breath = (): Note => chord(0, [50, 57], 2, { v: 0.45, a: 0.6, cut: 600 });

type Haptic = "leger" | "succes" | "erreur" | "cran";
type Score = { notes: Note[]; haptic?: Haptic; hapticAt?: number };

const SCORES = {
  /** L’identité. `gap` : l’écart entre les perles (0,11 s à l’arrivée, pour tomber avec leur « coucou »). */
  signature: (at = 0, gap = 0.075): Score => ({ notes: signature(at, gap) }),
  /** Ton message part : un souffle avec ta bulle, un toucher quand elle se pose. Même son pour une pastille. */
  envoi: (): Score => ({ notes: envoi(), haptic: "leger" }),
  /** La réponse remplace les perles : un pop. */
  reponse: (): Score => ({ notes: [{ k: "pop", t: 0, m: 74, v: 0.85 }] }),
  copier: (): Score => ({ notes: [{ k: "clic", t: 0, f: 1500, v: 0.6 }, T(0.05, 81, { v: 0.38, d: 0.14 })], haptic: "succes" }),
  vocalDebut: (): Score => ({ notes: [T(0, 74, { v: 0.36, d: 0.09 }), T(0.06, 81, { v: 0.36, d: 0.12 })], haptic: "leger" }),
  vocalEnvoye: (): Score => ({ notes: envoi() }),
  vocalJete: (): Score => ({
    notes: [T(0, 69, { v: 0.34, d: 0.1, br: 0.6 }), { k: "souffle", t: 0.03, f0: 1200, f1: 400, d: 0.16, v: 0.26 }, T(0.07, 62, { v: 0.32, d: 0.14, br: 0.5 })],
  }),
  /** Glisse pour creuser : le cran au seuil, puis la réponse qui se cale au-dessus du champ. */
  cran: (): Score => ({ notes: [{ k: "clic", t: 0, f: 1300, v: 0.7 }], haptic: "cran" }),
  creuser: (): Score => ({ notes: [{ k: "souffle", t: 0, f0: 1100, f1: 450, d: 0.12, v: 0.22 }, T(0.06, 62, { v: 0.38, d: 0.14, br: 0.6 })] }),
  /** Sa fiche : un toucher par info rangée, chacune un cran plus haut. « Annuler » les rejoue à l’envers, plus vite. */
  ficheRangee: (count: number): Score => {
    const n = Math.max(1, Math.min(RISE.length, count));
    return { notes: RISE.slice(0, n).map((m, i) => T(i * 0.17, m, { v: 0.3, d: i === n - 1 ? 0.12 : 0.09 })), haptic: "leger", hapticAt: (n - 1) * 0.17 };
  },
  ficheAnnulee: (count: number): Score => {
    const n = Math.max(1, Math.min(RISE.length, count));
    return {
      notes: RISE.slice(0, n)
        .reverse()
        .map((m, i) => T(i * 0.06, m, { v: 0.26, d: 0.08 })),
    };
  },
  oui: (): Score => ({ notes: [T(0, 74, { v: 0.4, d: 0.1 }), T(0.09, 81, { v: 0.44, d: 0.3, opale: true })], haptic: "succes" }),
  /** Une erreur se dit doucement : deux touchers sourds qui redescendent, sans buzzer. */
  non: (): Score => ({ notes: [T(0, 64, { v: 0.38, d: 0.11, br: 0.3 }), T(0.13, 62, { v: 0.34, d: 0.16, br: 0.25 })], haptic: "erreur" }),
  /** L’analyse : chaque découverte, un toucher discret, un cran plus haut que la précédente. */
  decouverte: (i: number): Score => ({ notes: [T(0, RISE[i % RISE.length] ?? RISE[0], { v: 0.3, d: 0.1 })] }),
  analyseFinie: (): Score => ({ notes: [chord(0, [62, 66, 69, 74], 1.6, { v: 0.55 }), ...signature(0)], haptic: "succes" }),
  /** Le verdict : un souffle grave, puis un seul accord quand l’emoji se pose. Le son ne ment pas. */
  verdict: (emoji: "🔥" | "🤏" | "🤔" | "🧊"): Score => {
    const notes: Record<typeof emoji, Note[]> = {
      /* Partant·e : il s’ouvre en grand */
      "🔥": [chord(LAND, [62, 66, 69, 74, 76], 1.8, { v: 0.6, cut: 2600 }), T(LAND, 74, { v: 0.4, d: 0.4, opale: true })],
      /* À deux doigts : sa dernière note attend un instant */
      "🤏": [chord(LAND, [62, 69, 76], 1.6, { v: 0.55 }), T(LAND + 0.35, 78, { v: 0.32, d: 0.4, opale: true })],
      /* Hésite : en suspens, sans conclure */
      "🤔": [chord(LAND, [57, 64, 71], 1.5, { v: 0.5, cut: 1600 })],
      /* S’éloigne : grave et feutré, sans drame */
      "🧊": [chord(LAND, [50, 57, 64], 1.9, { v: 0.5, cut: 900, a: 0.08 })],
    };
    return { notes: [breath(), ...notes[emoji]], haptic: "leger", hapticAt: LAND };
  },
  /** Un cap de plus : la signature sur un accord chaud. En couple, la température qui monte : le même, plus grave. */
  niveau: (temperature: boolean): Score =>
    temperature
      ? { notes: [chord(0, [50, 57, 66], 1.6, { v: 0.5, cut: 1500, a: 0.06 }), ...signature(0.02, 0.075, -12)], haptic: "succes" }
      : { notes: [chord(0, [62, 66, 69], 1.4, { v: 0.45 }), ...signature(0)], haptic: "succes" },
  /** Le paiement : le double clic d’une serrure, puis la signature sur un accord ouvert. Une seule fois. */
  debloque: (): Score => ({
    notes: [{ k: "clic", t: 0, f: 1100, v: 0.55 }, { k: "clic", t: 0.08, f: 1500, v: 0.5 }, chord(0.2, [62, 66, 69, 74], 1.8, { v: 0.55 }), ...signature(0.2)],
    haptic: "succes",
    hapticAt: 0.2,
  }),
} satisfies Record<string, (...args: never[]) => Score>;

export type SoundName = keyof typeof SCORES;

/**
 * Joue un son. Rien ne sonne si le réglage est coupé, si la page est cachée, ou si Safari n’a pas encore eu de toucher
 * (ouverte à froid, l’app reste muette : un son ne part jamais en retard au premier geste).
 */
export function play<K extends SoundName>(name: K, ...args: Parameters<(typeof SCORES)[K]>) {
  if (typeof window === "undefined" || !enabled() || document.visibilityState !== "visible") return;
  const score = (SCORES[name] as (...a: Parameters<(typeof SCORES)[K]>) => Score)(...args);
  if (score.haptic) haptic(score.haptic, score.hapticAt);
  const c = chain;
  if (!c) return;
  const inGesture = navigator.userActivation?.isActive ?? false;
  if (c.ac.state !== "running") {
    if (!inGesture) return;
    c.ac.resume().catch((e: unknown) => tracer("son:reprise", e));
  }
  const o: Out = { ac: c.ac, c, nodes: [] };
  const t0 = c.ac.currentTime + 0.02;
  for (const n of score.notes) {
    const t = t0 + n.t;
    if (n.k === "toucher") toucher(o, t, n);
    else if (n.k === "pop") pop(o, t, n);
    else if (n.k === "clic") clic(o, t, n);
    else if (n.k === "souffle") souffle(o, t, n);
    else accord(o, t, n);
  }
}

/** Un son joué une fois, à l’arrivée sur un écran (juste après le geste qui y mène). */
export function useSoundOnce<K extends SoundName>(name: K, ...args: Parameters<(typeof SCORES)[K]>) {
  const done = useRef(false);
  const later = useRef(() => play(name, ...args));
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    later.current();
  }, []);
}

/* ———— Les vibrations ———— */

const PATTERNS: Record<Haptic, { android: number[]; ios: number[] }> = {
  leger: { android: [10], ios: [0] },
  succes: { android: [10, 70, 14], ios: [0, 90] },
  erreur: { android: [12, 50, 12, 50, 12], ios: [0, 70, 140] },
  cran: { android: [18], ios: [0] },
};

/**
 * Android : l’API de vibration. iPhone : Safari n’en a pas ; son interrupteur (`<input type="checkbox" switch>`) vibre quand on le bascule,
 * et c’est le seul moyen. Apple peut fermer ce contournement à une mise à jour : la vibration reste un bonus, jamais une information.
 */
function haptic(kind: Haptic, at = 0) {
  if (!("ontouchstart" in window)) return;
  const p = PATTERNS[kind];
  const run = () => {
    if (typeof navigator.vibrate === "function") navigator.vibrate(p.android);
    else p.ios.forEach((ms) => (ms ? window.setTimeout(switchTick, ms) : switchTick()));
  };
  if (at > 0) window.setTimeout(run, at * 1000);
  else run();
}

function switchTick() {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  /* Le clic ne remonte pas : aucune feuille ni aucun menu ne croit qu’on a touché à côté */
  label.addEventListener("click", (e) => e.stopPropagation());
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  label.click();
  label.remove();
}
