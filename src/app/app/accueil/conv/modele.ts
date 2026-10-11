/*
 * Le modèle de la conv de l’accueil, sans React : ses messages (`Msg`, chacun de son `type`), d’où viennent leurs
 * identifiants, l’historique et l’intro de BLUSH mis en messages, les heures et les jours, et les lignes de la conv
 * (`rowsOf`). Des données seulement : HomeScreen habille chaque message de ses bulles (bubblesOf), et la conv gardée
 * pendant la visite (../../garde.ts) lit les mêmes identifiants. Testé dans tests/unit/accueil-modele.test.ts.
 */
import type { BlushAnswer, BulleChat, LevelId } from "@/types";

/* ———— Les identifiants ———— */

/*
 * D’où vient un message, lu dans son identifiant :
 * - l’intro de BLUSH : −2 (ton prochain pas) et −1 (« elle vient de répondre ? ») ;
 * - l’aperçu (/apercu, des échanges sans identifiant) : −100 − 2 × le rang de l’échange pour ton message, − 1 pour la réponse ;
 * - l’historique du back-end : −1 000 000 − 2 × l’échange (l’id de ton message en base), − 1 pour la réponse de BLUSH ;
 * - la visite : 1, 2, 3… (PREMIER_ID_VISITE, puis HomeScreen les compte), qui continuent d’une visite à l’autre.
 * Rien n’est attribué entre les deux (0, −3 à −99). Un échange de l’historique a toujours les mêmes identifiants : d’un
 * chargement à l’autre, les morceaux plus anciens se posent devant sans doublon, et la conv gardée reconnaît ses messages.
 */
const HISTORIQUE = -1_000_000;
const APERCU = -100;

/** D’où vient un message (voir plus haut). */
type Origine = "intro" | "apercu" | "historique" | "visite";

/** Les deux messages de l’intro de BLUSH : ton prochain pas, puis « elle vient de répondre ? ». */
export const ID_INTRO = { next: -2, hint: -1 } as const;

/** Le premier message de la visite (ceux d’après se suivent, d’une visite à l’autre). */
export const PREMIER_ID_VISITE = 1;

/** L’identifiant d’un message de l’historique : ton message, ou la réponse de BLUSH. */
export const idHistorique = (echange: number, deBlush: boolean) => HISTORIQUE - 2 * echange - (deBlush ? 1 : 0);

/** L’identifiant d’un message de l’aperçu (le `rang`-ième échange de son script) : ton message, ou la réponse de BLUSH. */
const idApercu = (rang: number, deBlush: boolean) => APERCU - 2 * rang - (deBlush ? 1 : 0);

/** D’où vient le message `id` (`null` : un identifiant que rien n’attribue). */
export function origineDe(id: number): Origine | null {
  if (id >= PREMIER_ID_VISITE) return "visite";
  if (id <= HISTORIQUE) return "historique";
  if (id <= APERCU) return "apercu";
  if (id === ID_INTRO.next || id === ID_INTRO.hint) return "intro";
  return null;
}

/**
 * Dans la visite, ton message auquel répond « BLUSH écrit » (puis sa réponse, qui garde son identifiant) : celui d’avant,
 * pris dans le même geste (echanger, ./useConversation.ts). Dans l’historique, l’échange les relie (idHistorique).
 */
export const questionDe = (idReponse: number) => idReponse - 1;

/** L’échange d’un message de l’historique (back-end : l’id de ton message). */
export const echangeDe = (id: number) => Math.floor((HISTORIQUE - id) / 2);

/** La place d’un message de l’historique dans son échange : 0 ton message, 1 la réponse de BLUSH. */
export const rangDansLEchange = (id: number) => (HISTORIQUE - id) % 2;

/**
 * La clé d’une bulle (son `data-bubble`, et celle de son groupe quand elle l’ouvre) : son message et son rang. La bulle de
 * « BLUSH écrit » a la sienne : à la réponse, le groupe repart de zéro et ses bulles montent.
 */
export const cleBulle = (id: number, rang: number | "ecrit") => `${id}-${rang}`;

/**
 * La clé de la bulle `k` du message `m`, la seule règle : « BLUSH écrit » qui tape encore a la sienne (c’est sa seule
 * bulle). Un groupe prend celle de sa première bulle (rowsOf), et l’habillage des bulles la même (HomeScreen).
 */
export const cleDeBulle = (m: Msg, k: number) => cleBulle(m.id, tapeEncore(m) ? "ecrit" : k);

/** La clé de la date posée avant un message (un nouveau jour). */
const cleJour = (id: number) => `jour-${id}`;

/** Le groupe de l’intro et sa date : c’est eux que l’arrivée du jour écrit. */
export const CLE_INTRO = cleBulle(ID_INTRO.next, 0);
export const CLE_JOUR_INTRO = cleJour(ID_INTRO.next);

/* ———— Les messages ———— */

/**
 * `at` : l’heure du message. `seed` : pour l’intro et l’aperçu, un moment fixé par rapport à l’ouverture (hier soir). `answered` : la
 * réponse qui remplace « BLUSH écrit ». `vagues` : une réponse arrivée au fil de l’eau, où commence chaque arrivée de
 * bulles (chacune se déplie à son tour, ce qui est déjà posé ne bouge plus).
 */
export type Stamp = { at?: number; seed?: { day: number; h: number; m: number }; answered?: boolean; vagues?: number[] };

/**
 * Ton vocal dans la conv : son adresse (locale, révoquée au départ de l’accueil), sa durée en secondes, ses pics. Le
 * modèle le décrit lui-même : il ne dépend d’aucun composant (le lecteur, ../../voice.tsx, en lit la même forme).
 */
type VocalDuMessage = { url: string; seconds: number; peaks: number[] };

/**
 * Un message de la conv, de son `type` :
 * - `intro` : l’intro de BLUSH ; `ecrit` : BLUSH écrit encore (`recues`, ses bulles déjà arrivées ; `coupee`, le réseau a
 *   coupé avant la fin, « Réessayer ») ; `reponse` : sa réponse ; `mot` : un mot de BLUSH (pas de micro, rien entendu) ;
 * - `texte` : ton message (`about` : le point d’une réponse de BLUSH que tu creuses, glissé vers la droite) ; `images` :
 *   tes captures ; `fichier` : un export ; `vocal` : ton vocal ;
 * - `niveau` : un repère dans la conv (un niveau franchi).
 */
export type Msg = (
  | { type: "intro"; id: number; from: "blush"; intro: "next" | "hint" }
  | { type: "ecrit"; id: number; from: "blush"; reading: string; vocal?: boolean; recues?: BulleChat[]; coupee?: boolean }
  | { type: "reponse"; id: number; from: "blush"; result: BlushAnswer }
  | { type: "texte"; id: number; from: "toi"; text: string; about?: string }
  | { type: "images"; id: number; from: "toi"; images: string[] }
  | { type: "fichier"; id: number; from: "toi"; file: { name: string; size: number } }
  | { type: "vocal"; id: number; from: "toi"; voice: VocalDuMessage }
  | { type: "mot"; id: number; from: "blush"; notice: string }
  | { type: "niveau"; id: number; from: "event"; level: LevelId }
) &
  Stamp;

/** Un message qui fait des bulles : tous, sauf un niveau franchi (un repère au milieu de la conv). */
export type MsgABulles = Exclude<Msg, { type: "niveau" }>;

/** Un message sans son identifiant (il est attribué au moment de l’ajouter à la conv). */
export type NewMsg = Msg extends infer T ? (T extends Msg ? Omit<T, "id"> : never) : never;

/**
 * Le `default` d’un `switch` sur le `type` d’un message : un type oublié ne compile pas. L’erreur ne dit que le type :
 * le message porte le texte de la conv, qui ne va jamais dans les journaux.
 */
export function typeInconnu(m: never): never {
  throw new Error(`Message de la conv d’un type inconnu (${String((m as { type?: unknown }).type)})`);
}

/** « BLUSH écrit » sans bulle arrivée ni coupure : sa bulle qui tape, seule dans son message. */
export const tapeEncore = (m: Msg) => m.type === "ecrit" && !m.recues?.length && !m.coupee;

/** Un échange de l’historique (back-end : avec son id et sa vraie heure ; aperçu : sans). */
export type EchangeScript = { id?: number; mine?: string; answer: BlushAnswer; at?: number };

/**
 * Les échanges de l’historique, en messages de la conv. Avec un id (back-end), leurs identifiants en dérivent :
 * stables d’un chargement à l’autre, et les morceaux plus anciens se posent devant sans doublon.
 */
export function echangesEnMsgs(script: EchangeScript[]): Msg[] {
  return script.flatMap((ex, k): Msg[] => {
    const id = (deBlush: boolean) => (ex.id ? idHistorique(ex.id, deBlush) : idApercu(k, deBlush));
    return [
      /* L’historique du back-end a ses vraies heures ; l’aperçu, des heures posées hier soir */
      ...(ex.mine ? [{ type: "texte" as const, id: id(false), from: "toi" as const, text: ex.mine, ...(ex.at ? { at: ex.at } : { seed: { day: -1, h: 22, m: 2 * k } }) }] : []),
      { type: "reponse" as const, id: id(true), from: "blush" as const, result: ex.id ? { ...ex.answer, echange: ex.id } : ex.answer, ...(ex.at ? { at: ex.at + 1000 } : { seed: { day: -1, h: 22, m: 2 * k + 1 } }) },
    ];
  });
}

/**
 * L’intro de BLUSH (ton prochain pas, puis « elle vient de répondre ? ») : à l’heure où ta lecture s’est finie (`at`),
 * avant tout l’historique. Sans cette heure (l’aperçu) : hier soir, comme dans les maquettes.
 */
export const introDe = (at?: number): Msg[] => [
  { type: "intro", id: ID_INTRO.next, from: "blush", intro: "next", ...(at ? { at } : { seed: { day: -1, h: 21, m: 40 } }) },
  { type: "intro", id: ID_INTRO.hint, from: "blush", intro: "hint", ...(at ? { at: at + 60_000 } : { seed: { day: -1, h: 21, m: 41 } }) },
];

/* ———— Les heures et les jours ———— */

/**
 * L’heure d’un message, seulement dans le navigateur (`opened` est vide au rendu serveur) : le serveur est à l’heure
 * UTC, le téléphone à la sienne, et des heures différentes feraient refaire tout l’écran à l’hydratation.
 * Sans l’heure du verdict, l’intro se cale sur l’ouverture de l’écran.
 */
export function timeOf(m: Stamp, opened: number | null) {
  if (opened === null) return null;
  if (m.at) return m.at;
  if (!m.seed) return null;
  const d = new Date(opened);
  d.setDate(d.getDate() + m.seed.day);
  d.setHours(m.seed.h, m.seed.m, 0, 0);
  return d.getTime();
}

/** Minuit, le jour de `at`, à l’heure du téléphone. */
export function dayStart(at: number) {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* Des formateurs gardés : Safari recrée un formateur à chaque toLocaleTimeString, deux fois par bulle à chaque rendu de la conv */
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

/** L’heure d’un message (« 21:40 »). */
export const clock = (at: number) => HEURE.format(at);

/**
 * « Aujourd’hui », « Hier », le jour de la semaine, puis la date : la date posée au-dessus d’un nouveau jour. La règle
 * de `jourRelatif` (src/server/temps.ts, la liste des convs), mais à l’heure du téléphone, qui est aussi celle des
 * bulles, et en toutes lettres : le fuseau et le format diffèrent exprès. Le compte des jours, lui, est à mettre en
 * commun (src/lib) par la PR qui reprend temps.ts.
 */
export function dayLabel(at: number, now: number) {
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  if (days < 7) {
    const w = JOUR.format(at);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return DATE.format(at);
}

/* ———— Les lignes de la conv ———— */

/** Un message dans son groupe : son heure, `neuf` s’il est de cette visite (il fait son entrée), `fresh` une réponse qui vient d’arriver (elle se déplie). */
type MsgDuGroupe = { m: MsgABulles; at: number | null; neuf: boolean; fresh: boolean };

/**
 * Une ligne de la conv : la date d’un nouveau jour, un niveau franchi, ou un groupe de messages d’un même expéditeur
 * (l’heure dessous : celle du dernier). `echange` : la dernière réponse du groupe qui en a un, de quoi la partager en image.
 */
export type Row =
  | { kind: "day"; key: string; at: number | null }
  | { kind: "event"; key: string; level: LevelId; neuf: boolean }
  | { kind: "group"; key: string; from: MsgABulles["from"]; at: number | null; msgs: MsgDuGroupe[]; echange?: number };

/** Les lignes de la conv. `depuis` : le premier identifiant de cette visite (les messages d’avant sont déjà lus). */
export function rowsOf(msgs: readonly Msg[], opened: number | null, depuis: number) {
  const rows: Row[] = [];
  let prev: number | null | undefined;
  for (const m of msgs) {
    if (m.type === "niveau") {
      rows.push({ kind: "event", key: `niveau-${m.id}`, level: m.level, neuf: m.id >= depuis });
      continue;
    }
    const at = timeOf(m, opened);
    /* Chaque nouveau jour s’annonce par sa date, comme dans Messages */
    if (prev === undefined || (at !== null && prev !== null && dayStart(at) !== dayStart(prev))) rows.push({ kind: "day", key: cleJour(m.id), at });
    prev = at;
    const neuf = m.id >= depuis;
    const ligne = { m, at, neuf, fresh: !!m.answered && neuf };
    /* La réponse de BLUSH garde son échange : de quoi la partager en image */
    const echange = m.type === "reponse" ? m.result.echange : undefined;
    const last = rows[rows.length - 1];
    if (last?.kind === "group" && last.from === m.from) {
      last.msgs.push(ligne);
      last.at = at;
      if (echange) last.echange = echange;
    } else rows.push({ kind: "group", key: cleDeBulle(m, 0), from: m.from, at, msgs: [ligne], echange });
  }
  return rows;
}

/** « Aujourd’hui » se compte depuis le message le plus récent (une conv ouverte avant minuit reste juste). */
export const maintenantDe = (rows: readonly Row[], opened: number | null) => Math.max(opened ?? 0, ...rows.map((r) => (r.kind === "event" ? 0 : (r.at ?? 0))));

/**
 * 5 · Chaque arrivée de bulles se déplie depuis l’avatar, de sa dernière bulle à sa première : le délai (en secondes) de
 * la bulle `k` d’un message qui en a `n`. `vagues` : où commence chaque arrivée (au fil de l’eau, plusieurs).
 */
export const depli = (k: number, n: number, vagues: readonly number[] = [0]) => (Math.min(n, ...vagues.filter((v) => v > k)) - 1 - k) * 0.12;
