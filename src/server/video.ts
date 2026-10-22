import "server-only";
import type { Captures } from "@prompts/lib/schemas";

/*
 * Un enregistrement d’écran : le navigateur en a tiré des images de la conv (dans l’ordre du temps, qui se
 * recouvrent), envoyées par lots ; chaque lot a été lu par le prompt 01. Ici, on rassemble les lots en une seule
 * lecture : deux lots voisins partagent une image, donc leurs messages du bord sont là deux fois.
 */

type Msg = Captures["blocs"][number]["messages"][number];
type Ligne = { repere: Captures["blocs"][number]["repere"]; m: Msg };

/** Le texte d’un message, sans accents, ponctuation ni espaces : deux lectures du même écran ne diffèrent que par là (morceaux.ts compare ainsi deux morceaux). */
export const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/*
 * Ce qu’on compare d’un message : son texte normalisé, calculé une fois par message (la fusion compare chacun des
 * centaines de fois), et ses 300 premiers caractères seulement. Deux lectures d’un même long message se reconnaissent
 * à leur début ; un bout coupé en haut de l’écran qu’on n’y retrouve pas est sauté en tête de lot (recouvrement).
 */
const COMPARES = 300;
/* Le texte brut lu pour en tirer COMPARES caractères normalisés : la normalisation retire la ponctuation, les espaces et les accents, un texte brut quatre fois plus long suffit à en garder 300 */
const BRUTS_LUS = COMPARES * 4;
const CLES = new WeakMap<Msg, string>();
function cle(m: Msg): string {
  let c = CLES.get(m);
  if (c === undefined) CLES.set(m, (c = norm(m.texte.slice(0, BRUTS_LUS)).slice(0, COMPARES)));
  return c;
}

/** Le même message, lu deux fois : même auteur, même média, même texte (ou l’un coupé au bord de l’écran). */
function memeMessage(a: Msg, b: Msg): boolean {
  if (a.de !== b.de || (a.media ?? null) !== (b.media ?? null)) return false;
  const x = cle(a);
  const y = cle(b);
  if (x === y) return true;
  return (a.coupe || b.coupe) && Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x));
}

const aplatir = (c: Captures): Ligne[] => c.blocs.flatMap((b) => b.messages.map((m, k) => ({ repere: k === 0 ? b.repere : null, m })));

/* Le recouvrement de deux lots, au plus : 80 messages, et 3 bouts coupés au bord de chaque côté */
const RECOUVREMENT_MAX = 80;
const BOUTS_COUPES_MAX = 3;
/* recouvrement ne lit de `a` que sa fin : la fusion ne lui donne qu’elle */
const FIN_REGARDEE = RECOUVREMENT_MAX + BOUTS_COUPES_MAX;

/**
 * Où la suite reprend : le plus long recouvrement entre la fin de `a` et le début de `b`. On tolère, au bord,
 * quelques messages coupés par l’écran (en fin de `a`, ou en tête de `b`), qu’une seule des deux lectures a gardés.
 * Rend le nombre de messages de `a` à garder, le nombre de messages de `b` à sauter, et la longueur du recouvrement.
 */
export function recouvrement(a: Msg[], b: Msg[]): { garderA: number; sauterB: number; long: number } {
  let mieux = { long: 0, garderA: a.length, sauterB: 0 };
  for (let finA = a.length; finA >= Math.max(0, a.length - BOUTS_COUPES_MAX); finA--) {
    /* Les messages laissés en fin de `a` doivent être des bouts coupés au bord de l’écran */
    if (a.slice(finA).some((m) => !m.coupe)) break;
    for (let debutB = 0; debutB <= Math.min(BOUTS_COUPES_MAX, b.length - 1); debutB++) {
      for (let n = Math.min(finA, b.length - debutB, RECOUVREMENT_MAX); n > mieux.long; n--) {
        let ok = true;
        for (let i = 0; i < n && ok; i++) {
          const x = a[finA - n + i];
          const y = b[debutB + i];
          ok = !!x && !!y && memeMessage(x, y);
        }
        if (ok) {
          mieux = { long: n, garderA: finA, sauterB: debutB + n };
          break;
        }
      }
    }
  }
  /* Un seul message en commun ne prouve rien, sauf s’il est long */
  const seul = mieux.long === 1 ? b[mieux.sauterB - 1] : undefined;
  if (seul && cle(seul).length < 25) return { garderA: a.length, sauterB: 0, long: 0 };
  return mieux;
}

/**
 * Les lots lus, rassemblés en une seule lecture : messages dans l’ordre, sans doublon au bord de deux lots. Chaque
 * lot ne se compare qu’à la fin de ce qui est déjà rassemblé, et s’y ajoute sans recopier le reste : le temps croît
 * comme le nombre de messages, pas comme son carré.
 */
export function fusionnerLots(lots: Captures[], appli: string): Captures {
  const lignes: Ligne[] = [];
  lots.forEach((lot, k) => {
    const suite = aplatir(lot);
    if (k === 0) {
      lignes.push(...suite);
      return;
    }
    const decalage = Math.max(0, lignes.length - FIN_REGARDEE);
    const fin = recouvrement(
      lignes.slice(decalage).map((l) => l.m),
      suite.map((l) => l.m),
    );
    const { sauterB, long } = fin;
    const garderA = decalage + fin.garderA;
    /* Un message coupé d’un côté et entier de l’autre : on garde l’entier */
    for (let i = 0; i < long; i++) {
      const a = lignes[garderA - long + i];
      const b = suite[sauterB - long + i];
      if (a && b && a.m.coupe && !b.m.coupe) a.m = b.m;
    }
    lignes.length = garderA;
    for (const l of suite.slice(sauterB)) lignes.push(l);
  });

  /* Les blocs se reforment là où un repère (une date) commence */
  const blocs: Captures["blocs"] = [];
  for (const l of lignes) {
    if (l.repere || !blocs.length) blocs.push({ repere: l.repere, messages: [] });
    blocs.at(-1)!.messages.push(l.m);
  }
  /* L’image partagée par deux lots ne compte qu’une fois */
  const captures = lots.flatMap((l, k) => (k === 0 ? l.captures : l.captures.slice(1))).map((c, i) => ({ ...c, numero: i + 1, place: i + 1 }));
  const autres = lots.map((l) => l.autre).filter((a): a is string => !!a);
  const autre = autres.sort((x, y) => autres.filter((a) => a === y).length - autres.filter((a) => a === x).length)[0] ?? null;
  return {
    appli: lots.find((l) => l.appli)?.appli ?? appli,
    autre,
    captures,
    blocs,
    profil: [...new Set(lots.flatMap((l) => l.profil))],
    doutes: lots.flatMap((l) => l.doutes),
  };
}
