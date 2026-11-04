import { DELAI_MAX_H, jour, jourCompte, type Message } from "@prompts/lib/conv";
import type { TendanceDuPaywall } from "@/types";

/*
 * La tendance du haut du paywall : ses messages (ceux de l’autre) ont chuté à une date, et ne sont pas remontés depuis.
 * Calculée par le code sur les heures des messages, jamais par le modèle : « Depuis le 12 mars, Lucas t’écrit 2 fois
 * moins ». Une semaine va de 5 h à 5 h, sept jours après le premier message (jourCompte, comme les autres chiffres : un
 * message daté sans heure compte le jour de son repère) ; la dernière, souvent entamée, compte ses jours à elle.
 *
 * Elle ne compte que ce qui suit la conv jour après jour (novembre 2026, PR 5 du chantier lecture) : un export, un
 * enregistrement d’écran, jamais des captures photo (MorceauxContinus : leurs messages disent combien d’écrans ont été
 * pris, pas combien elle écrit) ; ni un message dont le jour est deviné (Message.jourDevine : le haut de captures sans
 * repère, des captures sans aucune date), ni un message que la réunion des morceaux a changé de jour (le jour d’une
 * ancre n’est pas un repère). D’une conv en morceaux (src/server/morceaux.ts), seulement les jours qu’un morceau couvre,
 * de son premier à son dernier message compté, doublons compris (son étendue : deux morceaux qui se recouvrent, un
 * export court puis entier, une vidéo qui reprend la fin d’un export, couvrent le silence de leur jointure) : un trou
 * entre deux morceaux n’est pas un silence.
 */

const H = 3600e3;
const J = 24 * H;

/** Les seuils de la chute : assez d’histoire avant et depuis, une vraie baisse, et pas de remontée depuis. */
const SEUILS_TENDANCE = {
  /** Ses messages, au moins : en dessous, une semaine creuse suffit à faire une « chute ». */
  messages: 60,
  /** Les semaines d’avant et de depuis, au moins, parmi celles qui comptent (joursCouverts). */
  semainesAvant: 4,
  semainesApres: 3,
  /**
   * Les jours d’une semaine qu’un morceau couvre, au moins : en dessous, elle sort du calcul. La dernière, entamée (un
   * jour creux ferait la « chute »), comme une semaine prise dans le trou entre deux morceaux (ce qu’elle compte ne dit
   * rien de son rythme).
   */
  joursCouverts: 3,
  /** « Avant » : la moyenne des 8 semaines d’avant la chute, au plus (une conv d’un an ne compare pas avec son début). */
  semainesDeReference: 8,
  /** Assez de messages avant pour qu’une baisse se voie : 3 par jour. */
  parJourAvant: 3,
  /** Depuis : 60 % d’avant, au plus (une baisse de 40 %). */
  chute: 0.6,
  /** Et aucune semaine depuis au-dessus de 80 % d’avant : la chute dure, ce n’est pas une semaine de vacances. */
  remontee: 0.8,
  /** La courbe : les 16 dernières semaines au plus. */
  courbe: 16,
  /** Son délai de réponse : 5 réponses au moins de chaque côté de la chute, 1,5 fois plus long depuis, et 2 min au moins. */
  reponses: 5,
  delaiPlusLong: 1.5,
  delaiMin: 2 * 60e3,
} as const;

/**
 * Les morceaux d’une conv que la tendance compte, dans l’ordre de sa conv brute (Message.morceau) : `true` pour un
 * morceau qui suit la conv jour après jour (un export, un enregistrement d’écran), `false` pour des captures photo. Une
 * conv d’un seul morceau (ses messages sans `morceau`) : un seul élément. Lus dans la meta (morceauxContinus,
 * src/server/histoires.ts) ; un message d’un morceau qu’ils ne disent pas ne compte pas.
 */
export type MorceauxContinus = readonly boolean[];

/** Une conv d’un seul morceau qui suit la conv : un export, ou une vidéo (la lecture partielle, src/server/lecture-partielle.ts). */
export const UN_MORCEAU_CONTINU: MorceauxContinus = [true];

/**
 * L’étendue d’un morceau : son premier et son dernier jour comptés (messagesDates), en jours depuis 1970, doublons
 * compris (ses messages tels que la réunion les date, `parMorceau` de lectureReunie, src/server/morceaux.ts). null sans
 * aucun jour compté. Une conv en morceaux en a une par morceau, dans l’ordre de sa conv brute (Etendues).
 */
export type Etendue = { de: number; a: number };
/** Les étendues des morceaux d’une conv (etendue), dans l’ordre de sa conv brute ; aucune pour une conv d’un seul morceau. */
export type Etendues = readonly (Etendue | null)[];

/** Un jour AAAA-MM-JJ en jours depuis 1970 : relu, il tombe à minuit UTC (un nombre entier, y compris avant 1970). */
const numero = (j: string) => Date.parse(j) / J;
/** Le jour d’un message (jourCompte, prompts/lib/conv.ts), en jours depuis 1970. */
const jourDe = (m: Message) => numero(jourCompte(m));

/**
 * Les messages que la tendance compte, chacun avec son jour (jourDe) : ceux des morceaux continus, sans les jours
 * devinés (jourDevine), ni ceux que la réunion des morceaux a changés de jour (leur jour lu, `tLu`, n’est pas celui de la
 * conv réunie : il vient d’une ancre, par prudence on ne le compte pas). La lecture partielle d’une longue vidéo
 * (decider) compte les mêmes.
 */
export function messagesDates(messages: Message[], continus: MorceauxContinus = UN_MORCEAU_CONTINU): { m: Message; j: number }[] {
  const dates: { m: Message; j: number }[] = [];
  for (const m of messages) {
    if (continus[m.morceau ?? 0] !== true || m.jourDevine) continue;
    const j = jourCompte(m);
    if (m.tLu !== undefined && jourCompte({ t: m.tLu, approx: m.approx }) !== j) continue;
    dates.push({ m, j: numero(j) });
  }
  return dates;
}

/**
 * L’étendue des messages d’un morceau (Etendue) : le plus petit et le plus grand de leurs jours comptés (messagesDates :
 * ni un jour deviné, ni un jour que la réunion a changé). Ses messages n’ont pas de `morceau` (parMorceau) : tous comptent.
 */
export function etendue(messages: Message[]): Etendue | null {
  let e: Etendue | null = null;
  for (const { j } of messagesDates(messages)) e = e ? { de: Math.min(e.de, j), a: Math.max(e.a, j) } : { de: j, a: j };
  return e;
}

function mediane(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Arrondi à une décimale sous 10 (« 4,5 messages par jour »), à l’unité au-dessus. */
const arrondi = (x: number) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x));

/**
 * La chute de ses messages, s’il y en a une : la semaine où la baisse est la plus forte, parmi celles qui gardent assez
 * d’histoire de chaque côté, qui tombe à 60 % d’avant au plus et n’en remonte pas. null : pas de chute nette (ou une
 * conv trop courte, des captures photo, ou des captures dont on ne lit aucun jour). `continus` : les morceaux qu’elle
 * compte ; par défaut, une conv d’un seul morceau qui suit la conv (un export). `etendues` : ce que chaque morceau couvre,
 * doublons compris (etendue, une conv en morceaux) ; sans elles, de son premier à son dernier message gardé.
 */
export const tendance = (messages: Message[], continus: MorceauxContinus = UN_MORCEAU_CONTINU, etendues?: Etendues): TendanceDuPaywall | null =>
  chuteDe(messages, continus, etendues)?.tendance ?? null;

/**
 * Combien de semaines la conv a avant sa chute (celle de tendance), ou null sans chute. Moins que les semaines de
 * référence (SEUILS_TENDANCE.semainesDeReference) : son « avant » ne se compare pas à tout ce qui la précède. La lecture
 * partielle d’une longue vidéo (src/server/lecture-partielle.ts, une conv d’un seul morceau) lit alors plus loin, sinon
 * la chute serait mal datée.
 */
export function semainesAvantLaChute(messages: Message[]): number | null {
  return chuteDe(messages, UN_MORCEAU_CONTINU)?.k ?? null;
}

/** Les semaines de référence de « avant » : la lecture partielle les veut toutes avant de s’arrêter sur une chute. */
export const SEMAINES_DE_REFERENCE = SEUILS_TENDANCE.semainesDeReference;

function chuteDe(messages: Message[], continus: MorceauxContinus, etendues: Etendues = []): { tendance: TendanceDuPaywall; k: number } | null {
  const S = SEUILS_TENDANCE;
  const dates = messagesDates(messages, continus);
  const siens = dates.filter((d) => d.m.role === "autre");
  if (siens.length < S.messages) return null;
  /*
   * Ce que couvre chaque morceau : de son premier à son dernier jour compté (une conv d’un seul morceau : tous ses
   * jours). En min et max, sans lire l’ordre des messages : une conv réunie peut en ranger un hors de sa place
   */
  const plages = new Map<number | undefined, { de: number; a: number }>();
  for (const { m, j } of dates) {
    const p = plages.get(m.morceau);
    if (!p) plages.set(m.morceau, { de: j, a: j });
    else {
      p.de = Math.min(p.de, j);
      p.a = Math.max(p.a, j);
    }
  }
  let premier = Infinity;
  let dernier = -Infinity;
  for (const p of plages.values()) {
    premier = Math.min(premier, p.de);
    dernier = Math.max(dernier, p.a);
  }
  const nbJours = dernier - premier + 1;
  const couvert = Array<boolean>(nbJours).fill(false);
  for (const p of plages.values()) couvert.fill(true, p.de - premier, p.a - premier + 1);
  /*
   * Chaque morceau continu couvre toute son étendue, doublons compris : ses messages repris d’un autre morceau ne sont
   * plus dans la conv réunie, mais il montre bien les deux bords du silence qui les suit. Entre le premier et le dernier
   * jour comptés, sans couvrir un jour qui a un message de captures photo (ce qu’elles comptent ne dit rien du rythme)
   */
  const photo = new Set(messages.filter((m) => continus[m.morceau ?? 0] !== true).map(jourDe));
  etendues.forEach((e, k) => {
    if (!e || continus[k] !== true) return;
    for (let j = Math.max(e.de, premier); j <= Math.min(e.a, dernier); j++) if (!photo.has(j)) couvert[j - premier] = true;
  });
  /* Ses messages, par semaine de sept jours depuis le premier */
  const parSemaine = Array<number>(Math.ceil(nbJours / 7)).fill(0);
  for (const { j } of siens) parSemaine[Math.floor((j - premier) / 7)]!++;
  /*
   * Les semaines qui comptent, celles qu’un morceau couvre 3 jours au moins (joursCouverts), chacune avec ses jours
   * couverts (ses messages par jour se comptent sur eux) et le premier d’entre eux (sa date sur la courbe)
   */
  const jours: number[] = [];
  const comptes: number[] = [];
  const debuts: number[] = [];
  parSemaine.forEach((n, w) => {
    const semaine = couvert.slice(7 * w, 7 * w + 7);
    const couverts = semaine.filter(Boolean).length;
    if (couverts < S.joursCouverts) return;
    jours.push(couverts);
    comptes.push(n);
    debuts.push(premier + 7 * w + semaine.indexOf(true));
  });
  const nbSemaines = jours.length;
  if (nbSemaines < S.semainesAvant + S.semainesApres) return null;
  const parJour = comptes.map((c, w) => c / jours[w]!);
  const somme = (xs: number[], de: number, a: number) => xs.slice(de, a).reduce((s, x) => s + x, 0);

  let meilleure: { k: number; avant: number; apres: number } | null = null;
  for (let k = S.semainesAvant; k <= nbSemaines - S.semainesApres; k++) {
    const de = Math.max(0, k - S.semainesDeReference);
    const avant = somme(comptes, de, k) / somme(jours, de, k);
    const apres = somme(comptes, k, nbSemaines) / somme(jours, k, nbSemaines);
    if (avant < S.parJourAvant || apres > S.chute * avant) continue;
    if (parJour.slice(k).some((x) => x > S.remontee * avant)) continue;
    /* La plus forte baisse ; à baisse égale, la plus ancienne (le début de la chute) */
    if (!meilleure || avant * meilleure.apres > meilleure.avant * apres) meilleure = { k, avant, apres };
  }
  if (!meilleure) return null;

  /* Son délai de réponse, de chaque côté du premier jour de la chute (les mêmes réponses que chiffrer, prompts/lib/conv.ts) */
  const coupureJour = debuts[meilleure.k]!;
  const delais = { avant: [] as number[], apres: [] as number[] };
  const exacts = messages.filter((m) => !m.approx);
  for (let i = 1; i < exacts.length; i++) {
    const avant = exacts[i - 1]!;
    const m = exacts[i]!;
    if (m.role !== "autre" || avant.role !== "toi" || m.t - avant.t >= DELAI_MAX_H * H) continue;
    delais[jourDe(m) < coupureJour ? "avant" : "apres"].push(m.t - avant.t);
  }
  const delai = delais.avant.length >= S.reponses && delais.apres.length >= S.reponses ? { avant: mediane(delais.avant), apres: mediane(delais.apres) } : null;

  const debutCourbe = Math.max(0, nbSemaines - S.courbe);
  return {
    k: meilleure.k,
    tendance: {
      depuis: jour(coupureJour * J),
      avant: arrondi(meilleure.avant),
      apres: arrondi(meilleure.apres),
      semaines: parJour.slice(debutCourbe).map(arrondi),
      coupure: meilleure.k - debutCourbe,
      debuts: debuts.slice(debutCourbe).map((d) => jour(d * J)),
      delai: delai && delai.apres >= S.delaiMin && delai.apres >= S.delaiPlusLong * delai.avant ? delai : null,
    },
  };
}
