import "server-only";
import { createHash } from "node:crypto";
import { versTexteCaptures } from "@prompts/lib/captures";
import { chiffrer, lire, MIN_MESSAGES_CAPTURES, type Message } from "@prompts/lib/conv";
import type { Captures } from "@prompts/lib/schemas";
import { genreDuHaut, type GenreDuHaut } from "@/contenu/haut-du-paywall";
import { LECTEURS_DE_LOTS } from "@/lib/limites";
import type { BrasDeLaLecture, Contrefactuel } from "@/types";
import { apercuDuPaywall } from "./ecrans/haut-du-paywall";
import { SEMAINES_DE_REFERENCE, semainesAvantLaChute } from "./ecrans/tendance";
import { env } from "./env";
import { MOI } from "./morceaux";
import { fusionnerLots } from "./video";

/*
 * La lecture partielle d’une longue vidéo (#3 de l’audit des coûts, 26 octobre 2026). Avant l’achat, BLUSH ne lit mot
 * pour mot que la partie la plus récente d’un long enregistrement d’écran : assez d’écrans pour les chiffres du haut du
 * paywall. Le reste de ses écrans est gardé, chiffré (src/server/ecrans-gardes.ts), et lu après le paiement, avant le
 * verdict (src/server/suite-video.ts) ; effacé si rien n’est payé tant que la conv peut l’être (11 jours après le
 * paywall, le temps des relances). Le rapport, la mémoire et le chat d’un acheteur lisent toute la conv,
 * comme avant. Ce que le modèle lit pour un écran ne change pas : seulement quand.
 *
 * Ce module dit, sans modèle ni base : si une vidéo est longue et dans quelle moitié de l’A/B elle tombe (brasDe), son
 * plan (planDeLecture), s’il faut lire plus loin avant l’achat (decider), et ce qu’aurait montré le haut du paywall d’une
 * vidéo lue en entier sur sa seule partie récente (leContrefactuel).
 *
 * Pourquoi la partie récente suffit : une conv qui ne vient que d’une vidéo n’a aucun message à l’heure exacte (chaque
 * message prend l’heure ou le jour de son repère), et les chiffres du haut du paywall qui en demandent (qui ouvre, qui
 * reprend, qui relance, les délais) y valent zéro. Il ne lui reste que deux titres : la tendance, ou « sans assez de
 * chiffres ». La tendance se lit sur les semaines les plus récentes, avec ses huit semaines de référence : decider lit
 * jusqu’à les avoir, ou jusqu’à ce qu’une tendance soit impossible sur toute la vidéo.
 */

/** Le mode de la lecture partielle (BLUSH_LECTURE_PARTIELLE) : éteinte, mesurée sans rien changer, ou en A/B. */
export type ModeDeLaLecture = "0" | "mesure" | "ab";
export const modeDeLaLecture = (): ModeDeLaLecture => env().BLUSH_LECTURE_PARTIELLE;

/** Une longue vidéo : plus de lots qu’un seul tour de lecteurs (LECTEURS_DE_LOTS). En dessous, tout part d’un coup, pour 0,40 $ au plus. */
export const estLongue = (lots: number) => lots > LECTEURS_DE_LOTS;

/**
 * La moitié d’une longue vidéo dans l’A/B : d’après l’empreinte de son lot le plus récent (`video`, que le navigateur
 * calcule sur ses images et son appli, sans le jour), jamais au hasard d’un essai à l’autre. La même vidéo renvoyée, le
 * jour même ou le lendemain, tombe dans la même moitié ; une valeur forgée ne fait que choisir l’un des deux
 * comportements, tous deux permis.
 */
export function brasDe(video: string): BrasDeLaLecture {
  return createHash("sha256").update(`ab:lecture_partielle:${video}`).digest()[0]! % 2 ? "partielle" : "entiere";
}

/** Ce qu’on sait d’un enregistrement avant de le lire : ses lots, l’empreinte de son lot le plus récent, son sens, et d’où il vient. */
export type VideoAPlanifier = { lots: number; video: string | null; sensSur: boolean; ajout: boolean; tournage: boolean };

/**
 * La moitié d’une vidéo dans l’A/B, si elle y entre : en mode « ab », une longue vidéo d’un premier import (pas un
 * morceau ajouté, pas une prise du mode tournage) dont le navigateur a l’empreinte. Son sens douteux ne la sort pas de
 * l’A/B : sa moitié partielle la lit alors en entier (decider), c’est ce que la moitié coûte. null : hors de l’A/B.
 */
export function brasDeLaVideo(v: VideoAPlanifier): BrasDeLaLecture | null {
  if (modeDeLaLecture() !== "ab" || v.ajout || v.tournage || !v.video || !estLongue(v.lots)) return null;
  return brasDe(v.video);
}

/** Le plan d’un enregistrement : lu en entier avant l’achat (comme avant), ou d’abord sa partie la plus récente. */
export const planDeLecture = (v: VideoAPlanifier): BrasDeLaLecture => (brasDeLaVideo(v) === "partielle" && v.sensSur ? "partielle" : "entiere");

/* ———— La règle d’arrêt ———— */

const J = 86400e3;
/** Une conv lue sur 24 semaines datées : les 8 de référence et les 16 de la courbe du haut du paywall. Au-delà, on s’arrête (une chute plus ancienne est perdue : decider). */
const SEMAINES_ASSEZ = 24;
/** La tendance du haut du paywall demande 7 semaines au moins (4 avant la chute, 3 depuis) : en dessous, elle est impossible. */
const SEMAINES_D_UNE_TENDANCE = 7;
/** La marge de l’estimation de la durée de toute la vidéo (ses écrans ne couvrent pas tous autant de jours). */
const MARGE_DUREE = 1.5;

/** Où en est la lecture d’une longue vidéo avant l’achat : ses lots plus anciens pas encore lus, tous ses écrans, son appli, le jour de l’import, son sens. */
export type OuEnEst = { restants: number; ecrans: number; appli: string; jour: string; sensSur: boolean };

/**
 * Faut-il lire plus loin avant l’achat ? `lus` : les lots les plus récents de la vidéo, déjà lus, dans son ordre (du plus
 * ancien au plus récent). « assez » : la partie lue donne presque toujours les mêmes chiffres au haut du paywall que
 * toute la vidéo (pas toujours : voir les 24 semaines, plus bas, et le contrefactuel qui le mesure) ; « encore » : un
 * tour de plus (les lots juste avant) ; « tout » : on lit tout, comme avant. Dans l’ordre :
 * - plus rien à lire : « assez » ;
 * - le sens douteux (le navigateur le dit, ou des dates qui reculent d’un lot au suivant, ou après le jour de l’import) :
 *   « tout » (on garderait peut-être des écrans récents) ;
 * - moins de messages lus qu’une conv de captures n’en demande (MIN_MESSAGES_CAPTURES) : « tout » (la partie récente
 *   ferait une conv « courte », qui demanderait un morceau de plus, quand toute la vidéo n’en demanderait pas) ;
 * - une chute trouvée : « assez » avec ses huit semaines de référence (les mêmes chiffres que sur toute la conv), sinon
 *   « encore » (elle serait mal datée) ;
 * - aucun message daté à l’heure : « assez » (une tendance est impossible sur toute la vidéo, la même appli) ;
 * - 24 semaines datées lues : « assez ». Une chute plus ancienne (il en faut 4 avant elle dans la partie lue, soit plus
 *   d’une vingtaine de semaines avant l’import), que tendance() trouverait sur toute la conv, est alors perdue : le titre
 *   devient « Sans assez de chiffres ». Le cas des longues convs qui se sont refroidies, celles des ex : le contrefactuel
 *   le compte (« tendance perdue »), à regarder pendant la mesure, avant de relever SEMAINES_ASSEZ ;
 * - toute la vidéo, d’après la durée lue par écran (et une marge), dure moins de 7 semaines : « assez » ;
 * - sinon, « encore ».
 * Sans modèle : quelques millisecondes, les mêmes fonctions que le haut du paywall.
 */
export function decider(lus: Captures[], o: OuEnEst): "assez" | "encore" | "tout" {
  if (o.restants <= 0) return "assez";
  if (!o.sensSur || !datesDansLOrdre(lus, o.jour)) return "tout";
  const f = fusionnerLots(lus, o.appli);
  const { messages } = lecture(f, o.jour);
  /*
   * Presque rien de lisible dans la partie récente (des écrans hors sujet, des photos) : rien ne dit ce qu’il y a avant,
   * et la conv serait trop courte pour sa lecture (erreurImport) ; on lit tout
   */
  if (messages.length < MIN_MESSAGES_CAPTURES) return "tout";
  const k = semainesAvantLaChute(messages);
  if (k !== null) return k >= SEMAINES_DE_REFERENCE ? "assez" : "encore";
  const dates = messages.filter((m) => m.approx !== "jour");
  const [premier] = dates;
  const dernier = dates.at(-1);
  if (!premier || !dernier) return "assez";
  const jours = (dernier.t - premier.t) / J;
  if (jours >= SEMAINES_ASSEZ * 7) return "assez";
  const ecransLus = Math.max(1, f.captures.length);
  if (jours * (o.ecrans / ecransLus) * MARGE_DUREE < SEMAINES_D_UNE_TENDANCE * 7) return "assez";
  return "encore";
}

/** Une date de repère lisible (AAAA-MM-JJ), comme celles que versTexteCaptures garde. */
const dateDe = (r: Captures["blocs"][number]["repere"]) => (r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date)) ? Date.parse(r.date) : null);

/**
 * Les dates des repères vont-elles dans le sens de la vidéo ? D’un lot au suivant, la première date ne recule pas de plus
 * d’un jour sous la dernière du lot d’avant, et aucune ne dépasse le jour de l’import. Faux : la vidéo a peut-être été
 * filmée dans l’autre sens, ou en aller-retour.
 */
function datesDansLOrdre(lus: Captures[], jour: string): boolean {
  const limite = Date.parse(jour) + J;
  let derniere: number | null = null;
  for (const lot of lus) {
    const dates = lot.blocs.map((b) => dateDe(b.repere)).filter((d): d is number => d !== null);
    const [premiere] = dates;
    if (premiere === undefined) continue;
    if (dates.some((d) => d > limite)) return false;
    if (derniere !== null && premiere < derniere - J) return false;
    derniere = Math.max(...dates);
  }
  return true;
}

/** Une personne de la lecture d’une conv de captures, comme à l’import (src/server/histoires.ts, importerCaptures). */
const personne = (nom: string) => ({ prenom: nom, pronom: "il" as const, nomExport: nom });

/** Les messages d’une lecture rassemblée, comme les lit le haut du paywall (son texte au format « captures », relu), et le nom de l’autre. */
function lecture(c: Captures, jour: string): { messages: Message[]; autre: string } {
  const t = versTexteCaptures(c, { aujourdhui: jour });
  if (!t.messages) return { messages: [], autre: t.autre };
  return { messages: lire(t.texte, { utilisateur: personne(MOI), autre: personne(t.autre), format: "captures" }).messages, autre: t.autre };
}

/* ———— Le contrefactuel ———— */

/** Le titre du haut du paywall d’une lecture (les lots rassemblés), et la date de sa chute s’il en a une. */
function hautDe(lots: Captures[], appli: string, jour: string): { genre: GenreDuHaut; depuis: string | null } {
  const { messages, autre } = lecture(fusionnerLots(lots, appli), jour);
  if (!messages.length) return { genre: "aucun", depuis: null };
  const a = apercuDuPaywall(chiffrer({ utilisateur: personne(MOI), autre: personne(autre) }, messages), messages);
  return { genre: genreDuHaut(a), depuis: a.tendance?.depuis ?? null };
}

/**
 * Une longue vidéo lue en entier (le mode « mesure », la moitié entière de l’A/B) : ce que la lecture partielle aurait
 * fait, rejoué sur ses lots (decider, du plus récent au plus ancien, un tour de LECTEURS_DE_LOTS à la fois), et ce
 * qu’aurait montré le haut de son paywall sur la partie qu’elle aurait lue. `epargnables` : les lots qu’elle aurait
 * laissés pour après le paiement. Code pur, quelques millisecondes : /admin compte les titres perdus avant tout A/B.
 */
export function leContrefactuel(lots: Captures[], o: Omit<OuEnEst, "restants">): { contrefactuel: Contrefactuel; epargnables: number } {
  let lus = Math.min(LECTEURS_DE_LOTS, lots.length);
  for (;;) {
    const restants = lots.length - lus;
    const d = decider(lots.slice(restants), { ...o, restants });
    if (d === "encore") {
      lus = Math.min(lots.length, lus + LECTEURS_DE_LOTS);
      continue;
    }
    if (d === "tout" || !restants) return { contrefactuel: "pareil", epargnables: 0 };
    const entiere = hautDe(lots, o.appli, o.jour);
    const partielle = hautDe(lots.slice(restants), o.appli, o.jour);
    return { contrefactuel: comparer(entiere, partielle), epargnables: restants };
  }
}

/** Le titre de la partie lue, face à celui de toute la vidéo : le même, la tendance perdue, sa date à plus de 7 jours de la vraie, ou un autre. */
function comparer(entiere: ReturnType<typeof hautDe>, partielle: ReturnType<typeof hautDe>): Contrefactuel {
  if (entiere.genre === "tendance" && partielle.genre !== "tendance") return "tendance_perdue";
  if (entiere.genre !== partielle.genre) return "autre_titre";
  if (entiere.depuis && partielle.depuis && Math.abs(Date.parse(entiere.depuis) - Date.parse(partielle.depuis)) > 7 * J) return "date_decalee";
  return "pareil";
}
