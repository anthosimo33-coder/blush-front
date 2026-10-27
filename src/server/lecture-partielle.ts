import "server-only";
import { createHash } from "node:crypto";
import { versTexteCaptures } from "@prompts/lib/captures";
import { chiffrer, lire, MIN_MESSAGES_CAPTURES, type Message } from "@prompts/lib/conv";
import type { Captures } from "@prompts/lib/schemas";
import { genreDuHaut, varianteDuHaut, type GenreDuHaut } from "@/contenu/haut-du-paywall";
import { LECTEURS_DE_LOTS, LOTS_MIN_PARTIELLE, LOTS_PAR_TOUR } from "@/lib/limites";
import type { ArretDeLaRegle, BrasDeLaLecture, Contrefactuel } from "@/types";
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
 * La règle visée (le plan du 27 octobre 2026) l’étend à toutes les vidéos de LOTS_MIN_PARTIELLE lots ou plus : d’abord
 * leur lot le plus récent, puis LOTS_PAR_TOUR lots à la fois. Elle se mesure avant tout A/B : en « mesure », toute vidéo
 * de deux lots ou plus, lue en entier comme avant, note ce que la règle aurait lu, épargné et changé au paywall
 * (leContrefactuel, seMesure). L’A/B des longues vidéos garde, lui, son premier tour de LECTEURS_DE_LOTS lots.
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
 * Une vidéo lue en entier dont le contrefactuel se note (sauf éteinte, « 0 », et hors de la moitié partielle) : en
 * « mesure », toute vidéo de deux lots ou plus (LOTS_MIN_PARTIELLE, la règle visée) ; en « ab », une longue vidéo de la
 * moitié entière, comme avant.
 */
export const seMesure = (lots: number) => (modeDeLaLecture() === "mesure" ? lots >= LOTS_MIN_PARTIELLE : estLongue(lots));

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

/** Pourquoi la règle d’arrêt dit « tout » : le sens douteux que dit le navigateur, des dates de repère qui le disent, ou trop peu de messages lus. */
type RaisonDuTout = "sens" | "dates" | "court";

/** Ce que dit la règle d’arrêt (decider), et, pour « tout », pourquoi : le contrefactuel compte les « tout » à part, par raison. */
type Jugement = { suite: "assez" | "encore" } | { suite: "tout"; raison: RaisonDuTout };

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
export const decider = (lus: Captures[], o: OuEnEst): "assez" | "encore" | "tout" => juger(lus, o).suite;

/** La règle d’arrêt (decider), avec la raison d’un « tout ». */
function juger(lus: Captures[], o: OuEnEst): Jugement {
  const assez = { suite: "assez" } as const;
  const encore = { suite: "encore" } as const;
  if (o.restants <= 0) return assez;
  if (!o.sensSur) return { suite: "tout", raison: "sens" };
  if (!datesDansLOrdre(lus, o.jour)) return { suite: "tout", raison: "dates" };
  const f = fusionnerLots(lus, o.appli);
  const { messages } = lecture(f, o.jour);
  /*
   * Presque rien de lisible dans la partie récente (des écrans hors sujet, des photos) : rien ne dit ce qu’il y a avant,
   * et la conv serait trop courte pour sa lecture (erreurImport) ; on lit tout
   */
  if (messages.length < MIN_MESSAGES_CAPTURES) return { suite: "tout", raison: "court" };
  const k = semainesAvantLaChute(messages);
  if (k !== null) return k >= SEMAINES_DE_REFERENCE ? assez : encore;
  const dates = messages.filter((m) => m.approx !== "jour");
  const [premier] = dates;
  const dernier = dates.at(-1);
  if (!premier || !dernier) return assez;
  const jours = (dernier.t - premier.t) / J;
  if (jours >= SEMAINES_ASSEZ * 7) return assez;
  const ecransLus = Math.max(1, f.captures.length);
  if (jours * (o.ecrans / ecransLus) * MARGE_DUREE < SEMAINES_D_UNE_TENDANCE * 7) return assez;
  return encore;
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

/**
 * Le titre du haut du paywall d’une lecture (les lots rassemblés), sa forme (celle du titre « volume », varianteDuHaut ;
 * null pour les autres), et la date de sa chute s’il en a une.
 */
function hautDe(lots: Captures[], appli: string, jour: string): { genre: GenreDuHaut; variante: string | null; depuis: string | null } {
  const { messages, autre } = lecture(fusionnerLots(lots, appli), jour);
  if (!messages.length) return { genre: "aucun", variante: null, depuis: null };
  const a = apercuDuPaywall(chiffrer({ utilisateur: personne(MOI), autre: personne(autre) }, messages), messages);
  return { genre: genreDuHaut(a), variante: varianteDuHaut(a), depuis: a.tendance?.depuis ?? null };
}

/**
 * Ce que la règle visée aurait fait d’une vidéo lue en entier : le titre de la partie qu’elle aurait lue face au vrai
 * (`contrefactuel`), où elle se serait arrêtée (`arret`), et ce qu’elle aurait laissé pour après le paiement : des lots
 * (`epargnables`, les plus anciens) et leurs écrans (`ecransEpargnables`, sans l’image qu’ils partagent avec le lot
 * suivant, lu, comme imports.ecrans : /admin en tire les dollars épargnables, au prorata des écrans).
 */
export type MesureDeLaRegle = { contrefactuel: Contrefactuel; arret: ArretDeLaRegle; epargnables: number; ecransEpargnables: number };

/**
 * Une vidéo lue en entier (le mode « mesure », la moitié entière de l’A/B) : ce que la lecture partielle visée aurait
 * fait, rejouée sur ses lots, et ce qu’aurait montré le haut de son paywall sur la partie qu’elle aurait lue. La règle
 * visée, pas celle de l’A/B d’aujourd’hui : un premier tour de LOTS_PAR_TOUR lots (le plus récent, plein depuis la
 * découpe en partant de la fin), puis des tours de LOTS_PAR_TOUR lots, du plus récent au plus ancien, jusqu’à ce que
 * decider dise « assez » ; « tout » se compte à part, avec sa raison. Code pur, quelques millisecondes (un passage de
 * decider par tour, quinze au plus) : /admin compte les titres perdus et ce qu’on aurait épargné avant tout A/B.
 */
export function leContrefactuel(lots: Captures[], o: Omit<OuEnEst, "restants">): MesureDeLaRegle {
  let lus = Math.min(LOTS_PAR_TOUR, lots.length);
  let tours = 1;
  for (;;) {
    const restants = lots.length - lus;
    const j = juger(lots.slice(restants), { ...o, restants });
    if (j.suite === "encore") {
      lus = Math.min(lots.length, lus + LOTS_PAR_TOUR);
      tours++;
      continue;
    }
    if (j.suite === "tout") return { contrefactuel: "pareil", arret: `tout_${j.raison}`, epargnables: 0, ecransEpargnables: 0 };
    /* Plus rien à lire : la règle a tout lu, un tour après l’autre (un seul lot, aussi : rien à épargner) */
    if (!restants) return { contrefactuel: "pareil", arret: "jusqu_au_bout", epargnables: 0, ecransEpargnables: 0 };
    const entiere = hautDe(lots, o.appli, o.jour);
    const partielle = hautDe(lots.slice(restants), o.appli, o.jour);
    return {
      contrefactuel: comparer(entiere, partielle),
      arret: tours === 1 ? "premier_tour" : "plus_loin",
      epargnables: restants,
      /* Comme fusionnerLots : l’image partagée par deux lots voisins ne compte qu’une fois, dans le plus ancien des deux */
      ecransEpargnables: lots.slice(0, restants).reduce((n, l, k) => n + (k ? Math.max(0, l.captures.length - 1) : l.captures.length), 0),
    };
  }
}

/**
 * Le titre de la partie lue, face à celui de toute la vidéo : le même, la tendance perdue, sa date à plus de 7 jours de
 * la vraie, ou un autre (un autre genre, ou le titre « volume » sous une autre forme : une autre phrase en haut du
 * paywall, varianteDuHaut).
 */
function comparer(entiere: ReturnType<typeof hautDe>, partielle: ReturnType<typeof hautDe>): Contrefactuel {
  if (entiere.genre === "tendance" && partielle.genre !== "tendance") return "tendance_perdue";
  if (entiere.genre !== partielle.genre || entiere.variante !== partielle.variante) return "autre_titre";
  if (entiere.depuis && partielle.depuis && Math.abs(Date.parse(entiere.depuis) - Date.parse(partielle.depuis)) > 7 * J) return "date_decalee";
  return "pareil";
}
