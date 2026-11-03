import "server-only";
import { lire, type Format, type Histoire, type Lecture, type Message } from "@prompts/lib/conv";
import { idMessage } from "@prompts/lib/ligne";
import { accordDesNoms, aplatir, estUnSurnom, memeCle, prenomDe } from "@prompts/lib/noms";
import {
  AUTREMENT_MAX,
  BOUT_COMPTE,
  bout,
  CLE_PLEINE,
  cleDuMessage,
  distinctif,
  heureDuMessage,
  intervalle,
  numeroDuJour,
  pleinDuMessage,
  preuve,
  seRecoupent,
  type Heure,
} from "@prompts/lib/reconnaitre";
import { nomLu } from "@/lib/participants";
import { ErreurPublique } from "./erreurs";
import type { CodeErreur } from "@/types/erreurs-api";
import { norm } from "./video";

/*
 * Une conv en plusieurs morceaux : un export, puis des captures (ou une vidéo), puis un autre export avec la même
 * personne. Chaque morceau garde son texte tel qu’importé, dans son format (la conv brute, chiffrée) ; ils se
 * réunissent à chaque lecture : chacun lu dans son format, un message vu dans deux morceaux gardé une fois (celui d’un
 * export d’abord : son heure est exacte ; des captures ne reprennent un message que dans une suite de messages repris),
 * puis rangés par date. Les messages venus de captures gardent leur heure approximative, que la lecture sait déjà dire
 * (« ~21:05 », « --:-- ») et qu’elle ne compte pas dans les délais ; ils se rangent à côté des messages qu’ils reprennent,
 * et des captures où l’on ne voit aucune date prennent le jour de ceux qui les encadrent, quand ils sont du même jour.
 * « Moi », sur des captures, est toujours celui qui importe : « Qui es-tu ? » le relie au bon nom de l’export (meta.moi).
 * Avant, sa place est devinée (le nom de l’autre, les messages en commun), seulement pour ce que montrent les écrans.
 * Ici, rien ne touche la base : histoires.ts garde les morceaux (ajouterMorceau) et la chaîne les relit (analyse.ts).
 */

/** Le nom de celui qui importe des captures (versTexteCaptures, prompts/lib/captures.ts) : « Moi », à droite de l’écran. */
export const MOI = "Moi";
/** Au plus 5 morceaux par conv : l’écran ne propose plus d’en ajouter, le serveur refuse (« trop »). */
export const MORCEAUX_MAX = 5;
/** Les messages en commun qui prouvent que deux morceaux sont la même conv, quels que soient les noms. */
const COMMUNS_MIN = 3;

/** Un morceau de la conv, tel que la conv brute le garde : son texte importé, dans son format, et qui y parle. */
export type Morceau = {
  format: Format;
  texte: string;
  /**
   * Les noms de ses deux participants dans son texte, rangés comme ceux de la conv (meta.participants) : le premier est
   * le participant 0. Des captures : « Moi » et l’autre ; avant « Qui es-tu ? », la place de « Moi » est devinée (relier).
   */
  noms: [string, string];
  /** L’empreinte de son texte : le même fichier ajouté deux fois ne fait pas un morceau de plus. */
  empreinte: string;
  /** La clé de son envoi (des captures) : un nouvel essai après une coupure retrouve le morceau déjà ajouté. */
  cle?: string;
};

/** La conv brute d’une conv en plusieurs morceaux (stories.conv), ses morceaux dans l’ordre de leur import. */
export type ConvEnMorceaux = { morceaux: Morceau[] };

/** Un morceau reçu, pas encore relié à la conv : ses noms dans son texte (le plus bavard d’abord ; des captures, « Moi » d’abord). */
export type MorceauRecu = Omit<Morceau, "noms"> & {
  noms: [string, string];
  /** Le nom qui désigne l’autre dans ce morceau, quand un nom le dit : le haut des captures, le nom du fichier WhatsApp. */
  contact?: string;
};

/** Un ajout refusé : un morceau avec quelqu’un d’autre, sans aucun message nouveau, de trop, ou des captures sans date qu’on ne saurait où ranger. */
export class ErreurMorceau extends ErreurPublique<Extract<CodeErreur, "autre_conv" | "rien_de_neuf" | "trop" | "sans_date">> {}

/* ———— Les noms ———— */

/** Un vrai nom, lu : ni « Moi », ni « Elle » (pas lu), ni un numéro, ni un compte supprimé. */
const vraiNom = (nom: string) => nom !== MOI && nomLu(nom);
/**
 * Un nom qui dit un prénom : un vrai nom, et pas un surnom (« Bébé ❤️ », « Mon amour »). Deux prénoms différents disent
 * deux personnes différentes ; un surnom face à un prénom, non : le même contact peut être « Bébé » dans un téléphone et
 * « Léa » sur Instagram.
 */
const prenomSur = (nom: string) => vraiNom(nom) && !estUnSurnom(nom);
/** Deux noms du même prénom (deux vrais noms, memeCle) : « Léa 🌸 » sur WhatsApp, « Léa Dupont » sur Instagram, « Anne Sophie » et « Anne-Sophie ». */
export const memePrenom = (a: string, b: string) => vraiNom(a) && vraiNom(b) && memeCle(a, b);
/** Le prénom de deux vrais noms, accordé : `2` les mêmes mots, `1` le même début (« Marie » et « Marie-Lou »), `0` non. */
const accordDuPrenom = (a: string, b: string) => (vraiNom(a) && vraiNom(b) ? accordDesNoms(a, b) : 0);
/**
 * La place du nom (parmi deux) qui a ce prénom : celle qui a ses mots, sinon son début (« Marie-Lou » face à « Marie » et
 * « Marie-Lou 🌸 » : la seconde) ; aucune si les deux l’ont autant (deux Léa), ou aucun.
 */
const placeDuPrenom = (noms: readonly [string, string], nom: string) => {
  const [a, b] = [accordDuPrenom(noms[0], nom), accordDuPrenom(noms[1], nom)];
  return a === b ? undefined : a > b ? 0 : 1;
};

/**
 * Le nom que le fichier d’un export WhatsApp désigne : « Discussion WhatsApp avec Léa.txt », « WhatsApp Chat - Léa
 * 🌸.zip » nomment le contact, l’autre personne. Un seul des deux noms, parmi les mots du fichier ; sinon, rien.
 */
export function contactDuFichier(fichier: string, noms: readonly string[]): string | undefined {
  const mots = new Set(aplatir(fichier).split(/[^\p{L}\p{N}]+/u));
  /* Tous les mots de son prénom (« Marie-Lou » : marie et lou), pour ne pas désigner Marie-Claire */
  const nommes = noms.filter(
    (n) =>
      vraiNom(n) &&
      aplatir(prenomDe(n))
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .every((m) => mots.has(m)),
  );
  return nommes.length === 1 ? nommes[0] : undefined;
}

/* ———— Lire et réunir ———— */

/** Ce qui compare deux messages : leur texte sans accents, ponctuation ni espaces (ses 300 premiers caractères), ou un média. */
const texteCompare = (m: Message) => (m.media ? "#" : norm(m.texte.slice(0, 1200)).slice(0, 300) || m.texte.replace(/\s+/g, "").slice(0, 60));
/* À la minute près : un export Android n’a pas les secondes d’un export iPhone */
const cleExacte = (m: Message) => `${m.role}|${Math.floor(m.t / 60e3)}|${texteCompare(m)}`;

/** Un message seul suffit, le même jour, s’il est distinctif et long : 25 caractères, comme deux lots d’une vidéo (src/server/video.ts). */
const SEUL_LONG = 25;
/** Au-delà, pour un morceau, on garde les suites déjà trouvées : un envoi forgé (le même message des milliers de fois) ne bloque pas la lecture. */
const COMPARAISONS_MAX = 4_000_000;

/** Un morceau lu : ses messages, dans l’ordre de son texte, et si leurs heures sont exactes (un export). */
type MorceauLu = { messages: Message[]; exact: boolean };

/** Un morceau de captures où l’on ne voit aucune date : tous ses messages sont au jour inconnu (Message.jourDevine). */
const sansDate = (l: MorceauLu) => !l.exact && l.messages.length > 0 && l.messages.every((m) => m.jourDevine === "inconnu");

/** Le jour le moins sûr de deux : « inconnu » l’emporte sur « au plus tard », qui l’emporte sur un jour lu (aucun). */
const pire = (a: Message["jourDevine"], b: Message["jourDevine"]): Message["jourDevine"] => (a === "inconnu" || b === "inconnu" ? "inconnu" : (a ?? b));

/**
 * Un message gardé de la conv réunie : son morceau (`k`) et sa place dans ce morceau (`i`) ; et ce qui le range à heure
 * égale : le rang où son morceau a été réuni (`r`), puis une place (`place` : la sienne, ou celle du message qu’il suit).
 */
type Garde = { m: Message; k: number; i: number; r: number; place: number };
const avant = (a: Garde, b: Garde) => a.m.t - b.m.t || a.r - b.r || a.place - b.place;

/**
 * Ce que reunir regarde d’un message, calculé une fois par message (un export de 40 000 messages sert à chaque morceau) :
 * sa clé, et son texte entier quand elle est pleine (`plein`, où chercher le bout coupé d’une bulle longue : bout).
 */
type Fiche = { cle: string; plein?: string; long: number; t: number; heure: Heure; devine: boolean; coupe: boolean; distinctif: boolean };
const FICHES = new WeakMap<Message, Fiche>();
function ficheDe(m: Message): Fiche {
  let f = FICHES.get(m);
  if (!f) {
    const cle = cleDuMessage(m);
    const long = cle.length - cle.indexOf("|") - 1;
    f = {
      cle,
      ...(long >= CLE_PLEINE ? { plein: pleinDuMessage(m) } : {}),
      long,
      t: m.t,
      heure: heureDuMessage(m),
      devine: !!m.jourDevine,
      coupe: !!m.coupe,
      distinctif: distinctif(m),
    };
    FICHES.set(m, f);
  }
  return f;
}
/** Qui a écrit un message, lu dans sa clé. */
const auteur = (f: Fiche) => f.cle.slice(0, f.cle.indexOf("|"));

/**
 * Une suite de paires qui se suivent des deux côtés (une diagonale), à partir de C[i0] et K[j0], sur `n` places : ce
 * qu’elle reprend (`comptes`, dont `distinctifs`, dont `uniques` : un message distinctif qui n’a qu’une place possible
 * dans K), si elle tient à l’heure stricte, avec la preuve de ses messages courts, et si l’un d’eux est long.
 */
type Suite = { i0: number; j0: number; n: number; comptes: number; distinctifs: number; uniques: number; strict: boolean; preuve: boolean; long: boolean };

/**
 * Les messages d’un morceau de captures (C) que la conv déjà réunie (K, rangée) a déjà : pour chacun, sa place dans K, ou
 * -1. Un message n’y est repris que dans une suite qui vaut (vaut) ; le jumeau gardé prend ce que le doublon dit de
 * mieux (son texte entier, sa date). `r` : le rang de ce morceau ; `parMorceau` : les messages de chaque morceau, datés.
 */
function apparier(C: Message[], K: Garde[], r: number, parMorceau: Message[][]): number[] {
  const n = C.length;
  const p = K.length;
  const fC = C.map(ficheDe);
  const fK = K.map((g) => ficheDe(g.m));
  /* La table : clé → places dans K, par familles (le jour d’un message daté, toute la conv pour un jour deviné) */
  const table = new Map<string, number[]>();
  const ranger = (c: string, j: number) => {
    const l = table.get(c);
    if (l) l.push(j);
    else table.set(c, [j]);
  };
  fK.forEach((f, j) => {
    ranger(`C|${f.cle}`, j);
    if (f.coupe) ranger(`X|${auteur(f)}`, j);
    if (f.devine) {
      ranger(`dC|${f.cle}`, j);
      if (f.coupe) ranger(`dX|${auteur(f)}`, j);
    } else {
      ranger(`c|${f.cle}|${numeroDuJour(f.t)}`, j);
      if (f.coupe) ranger(`x|${auteur(f)}|${numeroDuJour(f.t)}`, j);
    }
  });
  const de = (c: string) => table.get(c) ?? [];
  /*
   * Les graines d’une suite : un message distinctif, à un jour près (ses jours possibles, et un de chaque côté : un
   * repère de l’autre côté court un jour de plus), ou n’importe quand pour un jour deviné ; un message court, seulement
   * le même jour (sa suite n’ira qu’à l’heure stricte). Un bout coupé n’en est jamais une : une suite le prend en passant.
   */
  const graines = (i: number): number[] => {
    const f = fC[i]!;
    if (f.coupe) return [];
    if (f.distinctif) {
      if (f.devine) return [...de(`C|${f.cle}`), ...de(`X|${auteur(f)}`)];
      const [a, b] = intervalle(f, true);
      const l: number[] = [];
      for (let d = numeroDuJour(a) - 1; d <= numeroDuJour(b) + 1; d++) l.push(...de(`c|${f.cle}|${d}`), ...de(`x|${auteur(f)}|${d}`));
      return [...l, ...de(`dC|${f.cle}`), ...de(`dX|${auteur(f)}`)];
    }
    if (f.devine) return [];
    const d = numeroDuJour(f.t);
    return [...de(`c|${f.cle}|${d}`), ...de(`x|${auteur(f)}|${d}`)];
  };
  const dedans = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < p;
  /* Une paire : le même texte (ou un bout coupé dans l’autre), des heures qui se recoupent à un jour près */
  const paire = (i: number, j: number) => {
    if (!dedans(i, j)) return false;
    const x = fC[i]!;
    const y = fK[j]!;
    return (x.cle === y.cle || ((x.coupe || y.coupe) && bout(x, y) !== null)) && seRecoupent(x, y, true);
  };
  /* Un message transcrit autrement : le même auteur, pas loin dans le temps, et suivi d’une paire */
  const autrement = (i: number, j: number) => dedans(i, j) && auteur(fC[i]!) === auteur(fK[j]!) && seRecoupent(fC[i]!, fK[j]!, true) && paire(i + 1, j + 1);
  /* Jusqu’où chaque diagonale (j − i) est déjà parcourue : les graines viennent dans l’ordre de C */
  const finDeDiagonale = new Map<number, number>();
  let comparaisons = 0;
  const prolonger = (i0: number, j0: number): Suite => {
    const s: Suite = { i0, j0, n: 0, comptes: 0, distinctifs: 0, uniques: 0, strict: true, preuve: true, long: false };
    let autrements = 0;
    for (;;) {
      const i = i0 + s.n;
      const j = j0 + s.n;
      comparaisons++;
      if (paire(i, j)) {
        const x = fC[i]!;
        const y = fK[j]!;
        if (x.cle === y.cle || bout(x, y)!.length >= BOUT_COMPTE) s.comptes++;
        if (x.distinctif && y.distinctif) s.distinctifs++;
        if (Math.max(x.long, y.long) >= SEUL_LONG) s.long = true;
        s.strict &&= !x.devine && !y.devine && seRecoupent(x, y, false);
        s.preuve &&= x.heure === "repere" && preuve(x, y);
      } else if (s.n > 0 && autrements < AUTREMENT_MAX && autrement(i, j)) {
        autrements++;
        s.strict &&= !fC[i]!.devine && !fK[j]!.devine && seRecoupent(fC[i]!, fK[j]!, false);
      } else break;
      s.n++;
    }
    finDeDiagonale.set(j0 - i0, i0 + s.n - 1);
    return s;
  };
  /* Un message distinctif qui n’a qu’une place possible dans K (une seule paire parmi ses graines) : une ancre sûre, là où un rituel du soir en a des dizaines */
  const unique = C.map(() => false);
  const suites: Suite[] = [];
  semer: for (let i = 0; i < n; i++) {
    /* Ses places possibles, comptées jusqu’à la deuxième (une place peut venir de deux familles de la table) */
    let places = 0;
    let premiere = -1;
    for (const j of graines(i)) {
      if (++comparaisons > COMPARAISONS_MAX) break semer;
      const parcourue = (finDeDiagonale.get(j - i) ?? -1) >= i;
      if ((parcourue && places > 1) || !paire(i, j)) continue;
      if (j !== premiere) {
        places++;
        if (premiere < 0) premiere = j;
      }
      if (parcourue) continue;
      /* Le début de sa diagonale : la suite part du premier message repris */
      let a = i;
      let b = j;
      while (paire(a - 1, b - 1)) {
        a--;
        b--;
        comparaisons++;
      }
      suites.push(prolonger(a, b));
    }
    unique[i] = fC[i]!.distinctif && places === 1;
  }
  /* Les ancres sûres de chaque suite, une fois chaque message de C compté */
  for (const s of suites) for (let t = 0; t < s.n; t++) if (unique[s.i0 + t] && fK[s.j0 + t]!.distinctif && paire(s.i0 + t, s.j0 + t)) s.uniques++;
  /*
   * Une suite vaut : avec un message distinctif, dès 2 messages, à l’heure stricte ou avec une ancre sûre (un rituel du
   * soir revient tous les soirs) ; sinon à l’heure stricte (le même jour, après le repère, aucun jour deviné), dès 3
   * messages, ou 2 sous un repère à l’heure avec leur preuve, ou un seul, distinctif et long
   */
  const vaut = (s: Suite) =>
    (s.distinctifs > 0 && s.comptes >= 2 && (s.strict || s.uniques > 0)) ||
    (s.strict && (s.comptes >= 3 || (s.comptes >= 2 && s.preuve) || (s.comptes === 1 && s.long && s.distinctifs > 0)));
  const jumeau = C.map(() => -1);
  const pris = new Set<number>();
  /* La suite qui reprend le plus d’abord, puis la plus distinctive, puis la plus récente ; une suite dont une place est déjà prise est écartée */
  for (const s of suites.filter(vaut).sort((a, b) => b.comptes - a.comptes || b.distinctifs - a.distinctifs || b.j0 - a.j0 || a.i0 - b.i0)) {
    let libre = true;
    for (let t = 0; t < s.n && libre; t++) libre = jumeau[s.i0 + t]! < 0 && !pris.has(s.j0 + t);
    if (!libre) continue;
    for (let t = 0; t < s.n; t++) {
      jumeau[s.i0 + t] = s.j0 + t;
      pris.add(s.j0 + t);
    }
  }
  /* Le jumeau gardé prend ce que le doublon dit de mieux : son texte entier (G9), sa date (un jour deviné), et alors sa place au tri */
  jumeau.forEach((j, i) => {
    if (j < 0 || !paire(i, j)) return;
    const x = C[i]!;
    const g = K[j]!;
    let y = g.m;
    if (y.coupe && !x.coupe && fC[i]!.cle !== fK[j]!.cle) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- écartée : le message est entier
      const { coupe, ...reste } = y;
      y = { ...reste, texte: x.texte, ...(x.media ? { media: x.media } : {}) };
    }
    if (y.jourDevine && !x.jourDevine) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- écarté : le jour est lu sur le doublon
      const { jourDevine, ...reste } = y;
      y = { ...reste, t: x.t, approx: x.approx, tLu: y.tLu ?? y.t };
      g.r = r;
      g.place = i;
    }
    if (y === g.m) return;
    g.m = y;
    parMorceau[g.k]![g.i] = y;
  });
  return jumeau;
}

/**
 * Les morceaux lus, réunis. Les exports d’abord, puis les captures datées, puis celles où l’on ne voit aucune date
 * (sansDate), chacun dans l’ordre de son import. Entre deux exports, un message déjà vu (même auteur, même texte, même
 * minute) n’est pas gardé deux fois, autant de fois qu’il est écrit. Un morceau de captures se compare à la conv déjà
 * réunie par suites de paires (apparier) ; chaque message gardé s’ancre sur ses doublons : après le plus récent de
 * ceux qui le précèdent, le même jour (règle A) ; avant le premier, le même jour, pour un message sans heure (règle B) ;
 * sans doublon, un message sans heure du jour où finit un export passe après sa fin (règle C). Un jour deviné
 * (Message.jourDevine) se range de même, quel que soit le jour de ses doublons, mais ne prend leur jour qu’entre deux
 * doublons du même jour ; avant le premier, il a été écrit ce jour-là au plus tard ; après le dernier (ou entre deux
 * jours), il reste inconnu. Son heure lue reste dans `tLu`. Puis tout se range par date (et, à heure égale, par rang de
 * réunion et par place), et se renumérote ; chaque message garde le rang de son morceau (`morceau`), dont le premier
 * message ne compte pas dans les chiffres (chiffrer, prompts/lib/conv.ts). Rend aussi les messages de chaque morceau
 * datés comme dans la conv réunie (`parMorceau` : un doublon prend la date de son jumeau).
 */
export function reunir(lus: MorceauLu[]): { messages: Message[]; doublons: number; gardes: number[]; parMorceau: Message[][] } {
  const rang = (l: MorceauLu) => (l.exact ? 0 : sansDate(l) ? 2 : 1);
  const ordre = lus.map((_, k) => k).sort((a, b) => rang(lus[a]!) - rang(lus[b]!) || a - b);
  const exactes = new Map<string, number>();
  /* La fin de chaque export, par jour : la règle C */
  const fins = new Map<number, number>();
  const gardes = lus.map(() => 0);
  const parMorceau = lus.map((l) => l.messages.slice());
  const tous: Garde[] = [];
  let doublons = 0;
  ordre.forEach((k, r) => {
    const { messages, exact } = lus[k]!;
    if (exact) {
      const pris = new Map<string, number>();
      const nouveaux: Message[] = [];
      messages.forEach((m, i) => {
        const c = cleExacte(m);
        if ((pris.get(c) ?? 0) < (exactes.get(c) ?? 0)) {
          pris.set(c, (pris.get(c) ?? 0) + 1);
          return void doublons++;
        }
        nouveaux.push(m);
        tous.push({ m, k, i, r, place: i });
        gardes[k]!++;
      });
      /* Indexés une fois le morceau lu : un morceau ne se compare pas à lui-même (deux « ok » de suite y restent deux) */
      for (const m of nouveaux) exactes.set(cleExacte(m), (exactes.get(cleExacte(m)) ?? 0) + 1);
      const fin = messages.reduce((x, m) => Math.max(x, m.t), -Infinity);
      if (messages.length) fins.set(numeroDuJour(fin), Math.max(fins.get(numeroDuJour(fin)) ?? -Infinity, fin));
      return;
    }
    tous.sort(avant);
    const jumeau = apparier(messages, tous, r, parMorceau);
    const premier = jumeau.findIndex((j) => j >= 0);
    /* Le jumeau du doublon qui suit chaque message dans son morceau (null après le dernier) : ce qui borne un jour deviné */
    const suivant: (Message | null)[] = [];
    for (let i = messages.length - 1, y: Message | null = null; i >= 0; i--) {
      suivant[i] = y;
      if (jumeau[i]! >= 0) y = tous[jumeau[i]!]!.m;
    }
    /* Le plus récent des doublons déjà passés dans ce morceau */
    let ancreA: Message | null = null;
    messages.forEach((x, i) => {
      const j = jumeau[i]!;
      if (j >= 0) {
        const y = tous[j]!.m;
        if (!ancreA || y.t > ancreA.t) ancreA = y;
        doublons++;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- remplacé par celui du jumeau
        const { jourDevine, ...reste } = x;
        parMorceau[k]![i] = { ...reste, t: y.t, ...(y.jourDevine ? { jourDevine: y.jourDevine } : {}) };
        return;
      }
      const { jourDevine, ...reste } = x;
      const a: Message | null = ancreA;
      const b = suivant[i] ?? null;
      let t = x.t;
      let jour = jourDevine;
      let rangDeTri = r;
      let place = i;
      /* Règle B : juste avant le premier doublon, dans leur ordre */
      const avantLePremier = () => {
        const g = tous[jumeau[premier]!]!;
        t = g.m.t;
        rangDeTri = g.r;
        place = g.place - (premier - i) / (premier + 1);
      };
      if (jourDevine) {
        if (a) {
          /* Après le plus récent des doublons qui le précèdent (règle A) ; son jour n’est sûr qu’entre deux doublons du même jour */
          t = a.t;
          jour = b && numeroDuJour(b.t) === numeroDuJour(a.t) ? pire(a.jourDevine, b.jourDevine) : "inconnu";
        } else if (b) {
          /* Avant le premier doublon : écrit son jour, ou avant */
          avantLePremier();
          jour = pire("auPlusTard", b.jourDevine);
        }
      } else if (a && numeroDuJour(a.t) === numeroDuJour(x.t)) {
        /* Règle A : après le plus récent des doublons qui le précèdent, le même jour */
        t = Math.max(x.t, a.t);
      } else if (premier > i && x.approx === "jour" && numeroDuJour(b!.t) === numeroDuJour(x.t)) {
        /* Règle B : un message sans heure avant le premier doublon du même jour */
        avantLePremier();
      } else {
        /* Règle C : sans ancre, un message sans heure du jour où finit un export passe après sa fin (un export a tout jusque-là) */
        const fin = fins.get(numeroDuJour(x.t));
        if (x.approx === "jour" && fin !== undefined) t = Math.max(x.t, fin);
      }
      const garde: Message = { ...reste, t, ...(t !== x.t ? { tLu: x.t } : {}), ...(jour ? { jourDevine: jour } : {}) };
      parMorceau[k]![i] = garde;
      tous.push({ m: garde, k, i, r: rangDeTri, place });
      gardes[k]!++;
    });
  });
  tous.sort(avant);
  return { messages: tous.map(({ m, k }, n) => ({ ...m, id: idMessage(n + 1), ligne: n + 1, morceau: k })), doublons, gardes, parMorceau };
}

/** Qui est toi dans la conv réunie : le participant `k` ; `connu`, « Qui es-tu ? » l’a dit (« Moi », sur des captures, est alors lui). */
export type QuiLit = { k: 0 | 1; connu: boolean };

/**
 * Un morceau lu dans son format, ses deux participants nommés comme ceux de la conv (`h`) : « toi » est le participant
 * `qui.k`. Un nom qui n’est pas l’un des deux reste du texte (un message collé d’un autre), comme à l’import.
 */
function lireMorceau(m: Pick<Morceau, "format" | "texte" | "noms">, h: Pick<Histoire, "utilisateur" | "autre">, qui: QuiLit): MorceauLu {
  let toi = m.noms[qui.k];
  let autre = m.noms[qui.k === 0 ? 1 : 0];
  if (qui.connu && m.format === "captures") [toi, autre] = [MOI, m.noms.find((n) => n !== MOI) ?? autre];
  const lu = lire(m.texte, { utilisateur: { ...h.utilisateur, nomExport: toi }, autre: { ...h.autre, nomExport: autre }, format: m.format }, { autresEnTexte: true });
  return {
    messages: lu.messages.map((x) => ({ ...x, nom: x.role === "toi" ? h.utilisateur.nomExport : h.autre.nomExport })),
    exact: m.format !== "captures",
  };
}

/**
 * La conv réunie, comme la lecture d’un seul texte (rendre, prompts/lib/conv.ts, la reçoit telle quelle) : ses messages
 * rangés et renumérotés, ses deux participants, et ses captures (leur nombre, lu en tête de chaque morceau de captures).
 * `doublons` : les messages vus deux fois ; `gardes` : ce que chaque morceau apporte ; `parMorceau` : les messages de
 * chaque morceau, datés comme dans la conv réunie (le jour d’un morceau de captures sans date est celui de ses ancres).
 */
export function lectureReunie(
  conv: ConvEnMorceaux,
  h: Pick<Histoire, "utilisateur" | "autre">,
  qui: QuiLit,
): Lecture & { doublons: number; gardes: number[]; parMorceau: Message[][] } {
  const lus = conv.morceaux.map((m) => lireMorceau(m, h, qui));
  const { messages, doublons, gardes, parMorceau } = reunir(lus);
  const captures = conv.morceaux.reduce((n, m) => n + (m.format === "captures" ? +(m.texte.match(/^# captures · [^\n]* · (\d+) captures?/)?.[1] ?? 0) : 0), 0);
  return {
    messages,
    /* Ce que la lecture de chaque morceau a noté ou jeté reste à son import : la conv réunie ne le redit pas */
    problemes: [],
    inconnues: { lignes: 0, forme: null },
    participants: [...new Set(messages.map((m) => m.nom))],
    captures: captures || null,
    doublons,
    gardes,
    parMorceau,
  };
}

/* ———— Relier un morceau à la conv ———— */

/** Ce qu’on sait de qui est qui dans la conv : les noms de ses participants, celui qui importe (des captures seules), l’autre (quand un nom l’a désigné). */
export type Identite = { noms: [string, string]; moi?: 0 | 1; contact?: 0 | 1 };

/** Deux noms rangés tels quels, ou croisés. */
const croiser = ([a, b]: [string, string], croise: boolean): [string, string] => (croise ? [b, a] : [a, b]);
/** Un morceau lu, toi et l’autre échangés : ses noms croisés. */
const inverser = (l: MorceauLu): MorceauLu => ({ ...l, messages: l.messages.map((m) => ({ ...m, role: m.role === "toi" ? "autre" : m.role === "autre" ? "toi" : m.role })) });
/** Des captures, « Moi » au participant `k` : elles rejoignent les noms d’un export. */
const placerMoi = (m: Morceau, k: 0 | 1): Morceau => ({ ...m, noms: croiser([MOI, m.noms.find((n) => n !== MOI) ?? m.noms[1]], k === 1) });
/* Les noms ne servent qu’à lire qui parle : pour compter ce qu’ils ont en commun, deux personnes neutres suffisent */
const NEUTRES: Pick<Histoire, "utilisateur" | "autre"> = { utilisateur: { prenom: "0", pronom: "il", nomExport: "0" }, autre: { prenom: "1", pronom: "il", nomExport: "1" } };

/**
 * Le nouveau morceau relié à la conv : la place de ses noms parmi ceux de ses participants, et ce que la conv sait
 * désormais de qui est qui. Refusé (« autre_conv ») quand c’est clairement quelqu’un d’autre et qu’aucun message n’est
 * en commun : deux noms qui désignent l’autre (le haut des captures, le nom du fichier WhatsApp) sans être le même
 * prénom, ou un export dont aucun nom ne se retrouve, ou un seul, quand l’autre côté est (peut-être) l’autre personne.
 * Un nom illisible (un numéro, « Elle »), un surnom d’un seul côté, ne bloquent pas : le doute profite à l’ajout.
 * Refusé aussi (« sans_date ») : des captures où l’on ne voit aucune date, sans aucun message en commun avec une conv qui
 * a des dates : on ne saurait où les ranger (il faut celle où l’on voit le jour). Quelqu’un d’autre (« autre_conv »)
 * passe avant.
 */
export function relier(conv: ConvEnMorceaux, id: Identite, recu: MorceauRecu): { morceaux: Morceau[]; identite: Identite } {
  const { contact: designe, ...morceau } = recu;
  /* Chaque morceau lu une fois, toi au participant 0 : ce qu’ils ont en commun se compte en croisant les rôles, sans relire */
  const existants = conv.morceaux.map((m) => lireMorceau(m, NEUTRES, { k: 0, connu: false }));
  const nouveau = lireMorceau(recu, NEUTRES, { k: 0, connu: false });
  const base = reunir(existants).doublons;
  /* Chaque réunion une fois : les messages en commun, rôles croisés ou non (et les existants retournés : `avec`, toujours les mêmes) */
  const vus = new Map<string, number>();
  const communs = (croise: boolean, avec = existants) => {
    const c = `${croise}|${avec === existants}`;
    const n = vus.get(c) ?? reunir([...avec, croise ? inverser(nouveau) : nouveau]).doublons - base;
    vus.set(c, n);
    return n;
  };
  /* Des captures où l’on ne voit aucune date, sans aucun message en commun avec une conv qui a des dates : on ne saurait où les ranger */
  const sansAncre = (croise: boolean) => sansDate(nouveau) && existants.some((l) => l.messages.some((m) => m.jourDevine !== "inconnu")) && communs(croise) === 0;
  const autreConv = () => new ErreurMorceau("autre_conv");
  const capturesSeules = conv.morceaux.every((m) => m.format === "captures");
  const ajoute = (noms: [string, string]) => [...conv.morceaux, { ...morceau, noms }];

  if (recu.format === "captures") {
    const autre = recu.noms[1];
    /* Des captures de plus, sur des captures : « Moi » y est le participant 0. Deux noms lus de deux prénoms : quelqu’un d’autre */
    if (capturesSeules) {
      const lu = id.noms[1];
      if (prenomSur(lu) && prenomSur(autre) && !memePrenom(lu, autre) && communs(false) < COMMUNS_MIN) throw autreConv();
      if (sansAncre(false)) throw new ErreurMorceau("sans_date");
      return { morceaux: ajoute([MOI, autre]), identite: { noms: [MOI, vraiNom(lu) ? lu : autre], moi: 0, contact: 1 } };
    }
    /* Des captures, sur des exports : l’autre est celui qu’un nom a désigné, sinon le même prénom (s’il n’est qu’à un des deux), sinon celui des messages en commun, sinon le second */
    const parNom = placeDuPrenom(id.noms, autre);
    const k = id.contact ?? parNom ?? (communs(true) > communs(false) ? 0 : 1);
    const noms = croiser([MOI, autre], k === 0);
    if (id.contact !== undefined && prenomSur(autre) && prenomSur(id.noms[k]) && !memePrenom(autre, id.noms[k]) && communs(k === 0) < COMMUNS_MIN) throw autreConv();
    if (sansAncre(k === 0)) throw new ErreurMorceau("sans_date");
    return { morceaux: ajoute(noms), identite: { ...id, ...(parNom === undefined ? {} : { contact: id.contact ?? parNom }) } };
  }

  const [a, b] = recu.noms;
  const parFichier = designe === undefined ? undefined : ([0, 1] as const).find((k) => recu.noms[k] === designe);
  /* Un premier export, sur des captures : ses noms deviennent ceux de la conv, « Moi » va à celui qui n’est pas l’autre */
  if (capturesSeules) {
    const lu = id.noms[1];
    const parNom = placeDuPrenom(recu.noms, lu);
    if (parNom !== undefined && parFichier !== undefined && parNom !== parFichier) throw autreConv();
    if (
      parNom === undefined &&
      parFichier !== undefined &&
      prenomSur(lu) &&
      prenomSur(recu.noms[parFichier]) &&
      !memePrenom(lu, recu.noms[parFichier]) &&
      communs(false, parFichier === 0 ? existants.map(inverser) : existants) < COMMUNS_MIN
    )
      throw autreConv();
    const contact = parNom ?? parFichier;
    /* Rien ne dit qui est l’autre : les messages en commun, sinon le second, comme sur les écrans */
    const moi = contact !== undefined ? (contact === 0 ? 1 : 0) : communs(false, existants.map(inverser)) > communs(false) ? 1 : 0;
    return {
      morceaux: [...conv.morceaux.map((m) => placerMoi(m, moi)), { ...morceau, noms: [a, b] }],
      identite: { noms: [a, b], ...(contact === undefined ? {} : { contact }) },
    };
  }

  /* Un export de plus : ses noms à la place des mêmes (le même nom, sinon le même prénom), puis du nom du fichier, puis des messages en commun */
  const points = (croise: boolean) => {
    const noms = croiser([a, b], croise);
    const egal = (k: 0 | 1) => (noms[k] === id.noms[k] ? 3 : accordDuPrenom(noms[k], id.noms[k]));
    const fichier = designe === undefined || id.contact === undefined ? 0 : noms[id.contact] === designe ? 2 : -2;
    return egal(0) + egal(1) + fichier;
  };
  const [tels, croises] = [false, true].map((c) => ({ points: points(c), communs: communs(c) })) as [{ points: number; communs: number }, { points: number; communs: number }];
  const croise = croises.points > tels.points || (croises.points === tels.points && croises.communs > tels.communs);
  const noms = croiser([a, b], croise);
  const k = parFichier === undefined ? undefined : croise ? (parFichier === 0 ? 1 : 0) : parFichier;
  if ((croise ? croises : tels).communs < COMMUNS_MIN) {
    const memes = ([0, 1] as const).filter((j) => noms[j] === id.noms[j] || memePrenom(noms[j], id.noms[j]));
    /* Aucun nom ne se retrouve : une autre conv */
    if (!memes.length) throw autreConv();
    /*
     * Un seul : l’autre côté a changé de nom. Si c’est l’autre personne (d’après la conv, sinon le nom du fichier), ou que
     * rien ne dit qui elle est, c’est quelqu’un d’autre ; si c’est celui qui importe, il a changé de nom
     */
    const change = ([0, 1] as const).find((j) => !memes.includes(j));
    if (change !== undefined && prenomSur(noms[change]) && prenomSur(id.noms[change]) && (id.contact ?? k ?? change) === change) throw autreConv();
    /* Les deux fichiers désignent l’autre, chacun à une place différente : l’un des deux parle avec quelqu’un d’autre */
    if (k !== undefined && id.contact !== undefined && k !== id.contact) throw autreConv();
  }
  return { morceaux: ajoute(noms), identite: { ...id, ...(id.contact === undefined && k !== undefined ? { contact: k } : {}) } };
}
