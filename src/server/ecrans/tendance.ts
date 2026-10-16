import { COUPURE_JOURNEE_H, DELAI_MAX_H, jour, type Message } from "@prompts/lib/conv";
import type { TendanceDuPaywall } from "@/types";

/*
 * La tendance du haut du paywall : ses messages (ceux de l’autre) ont chuté à une date, et ne sont pas remontés depuis.
 * Calculée par le code sur les heures des messages, jamais par le modèle : « Depuis le 12 mars, Lucas t’écrit 2 fois
 * moins ». Une semaine va de 5 h à 5 h, sept jours après le premier message (COUPURE_JOURNEE_H, comme les autres
 * chiffres) ; la dernière, souvent entamée, compte ses jours à elle.
 */

const H = 3600e3;
const J = 24 * H;

/** Les seuils de la chute : assez d’histoire avant et depuis, une vraie baisse, et pas de remontée depuis. */
const SEUILS_TENDANCE = {
  /** Ses messages, au moins : en dessous, une semaine creuse suffit à faire une « chute ». */
  messages: 60,
  /** Les semaines d’avant et de depuis, au moins (la dernière semaine compte si elle a ses 3 jours) */
  semainesAvant: 4,
  semainesApres: 3,
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

/** Le jour d’un message, en jours depuis 1970, coupé à 5 h (la nuit compte avec la veille). */
const jourDe = (t: number) => Math.floor((t - COUPURE_JOURNEE_H * H) / J);

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
 * conv trop courte, ou des captures sans les jours).
 */
export function tendance(messages: Message[]): TendanceDuPaywall | null {
  const S = SEUILS_TENDANCE;
  /* Les jours approximatifs (des captures sans date) ne se rangent dans aucune semaine */
  const dates = messages.filter((m) => m.approx !== "jour");
  const siens = dates.filter((m) => m.role === "autre");
  if (siens.length < S.messages || !dates.length) return null;
  const premier = jourDe(dates[0]!.t);
  const dernier = jourDe(dates.at(-1)!.t);
  const nbJours = dernier - premier + 1;
  /* La dernière semaine : gardée seulement si elle a 3 jours (sinon, un jour creux ferait la « chute ») */
  const reste = nbJours % 7;
  const nbSemaines = Math.floor(nbJours / 7) + (reste >= 3 ? 1 : 0);
  if (nbSemaines < S.semainesAvant + S.semainesApres) return null;
  const jours = Array.from({ length: nbSemaines }, (_, w) => (w === nbSemaines - 1 && reste >= 3 ? reste : 7));
  const comptes = Array<number>(nbSemaines).fill(0);
  for (const m of siens) {
    const w = Math.floor((jourDe(m.t) - premier) / 7);
    if (w < nbSemaines) comptes[w]!++;
  }
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
  const coupureJour = premier + 7 * meilleure.k;
  const delais = { avant: [] as number[], apres: [] as number[] };
  const exacts = messages.filter((m) => !m.approx);
  for (let i = 1; i < exacts.length; i++) {
    const avant = exacts[i - 1]!;
    const m = exacts[i]!;
    if (m.role !== "autre" || avant.role !== "toi" || m.t - avant.t >= DELAI_MAX_H * H) continue;
    delais[jourDe(m.t) < coupureJour ? "avant" : "apres"].push(m.t - avant.t);
  }
  const delai = delais.avant.length >= S.reponses && delais.apres.length >= S.reponses ? { avant: mediane(delais.avant), apres: mediane(delais.apres) } : null;

  const debutCourbe = Math.max(0, nbSemaines - S.courbe);
  return {
    depuis: jour(coupureJour * J + COUPURE_JOURNEE_H * H),
    avant: arrondi(meilleure.avant),
    apres: arrondi(meilleure.apres),
    semaines: parJour.slice(debutCourbe).map(arrondi),
    coupure: meilleure.k - debutCourbe,
    delai: delai && delai.apres >= S.delaiMin && delai.apres >= S.delaiPlusLong * delai.avant ? delai : null,
  };
}
