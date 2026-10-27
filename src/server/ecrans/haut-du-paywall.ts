import type { Chiffres, Histoire, Message } from "@prompts/lib/conv";
import type { ApercuDuPaywall, SignalDuPaywall } from "@/types";
import { tendance } from "./tendance";

/*
 * Le haut du paywall : ce que le code a compté entre vous deux, sans le modèle (le paywall passe avant toute lecture).
 * Chaque déséquilibre dit qui y met le plus, quand l’écart est net ; le titre qu’on en tire, ses textes et la règle qui
 * le choisit vivent dans src/contenu/haut-du-paywall.ts. Les seuils suivent ceux des trouvailles de la lecture
 * (ecrans/trouvailles.ts), en un peu plus exigeant pour un titre : 65 % des jours, plutôt que 60.
 */

/** Les seuils d’un écart net. */
const SEUILS_SIGNAUX = {
  /** Qui ouvre la journée, qui reprend après un silence : 65 % des fois, sur 5 au moins. */
  part: 0.65,
  fois: 5,
  /** Qui relance sans réponse : 4 fois au moins, et 2 fois plus que l’autre (ou l’autre jamais). */
  relances: 4,
  relancesFois: 2,
  /**
   * Qui répond le plus vite : 2 fois plus vite, et 5 minutes d’écart au moins (2 min contre 3, c’est le hasard d’une
   * journée, pas un signe).
   */
  delaiFois: 2,
  delaiEcart: 5 * 60e3,
  /** Qui écrit le plus long : 1,8 fois plus de mots par message. */
  longueurFois: 1.8,
} as const;

/** Les déséquilibres de la conv, dans l’ordre des lignes de la carte : qui ouvre, reprend, relance, répond vite, écrit long. */
export function signaux(c: Chiffres): SignalDuPaywall[] {
  const S = SEUILS_SIGNAUX;
  const part = (id: "ouvre" | "reprend", toi: number, elle: number): SignalDuPaywall => {
    const total = toi + elle;
    const cote = total < S.fois ? "pareil" : toi / total >= S.part ? "toi" : elle / total >= S.part ? "elle" : "pareil";
    return { id, cote, toi, elle };
  };
  const { toi: rt, autre: ra } = c.relance;
  const plus = Math.max(rt, ra);
  const relanceNette = plus >= S.relances && (Math.min(rt, ra) === 0 || plus / Math.min(rt, ra) >= S.relancesFois);
  const liste: SignalDuPaywall[] = [
    part("ouvre", c.ouvre.toi, c.ouvre.autre),
    part("reprend", c.reprend.toi, c.reprend.autre),
    { id: "relance", cote: !relanceNette ? "pareil" : rt > ra ? "toi" : "elle", toi: rt, elle: ra },
  ];
  /* Le délai : seulement quand les deux répondent (des captures sans heures n’en ont pas) ; le plus rapide y met le plus */
  const { toi: dt, autre: da } = c.delai;
  if (dt != null && da != null) {
    const net = Math.abs(dt - da) >= S.delaiEcart && Math.max(dt, da) / Math.max(1, Math.min(dt, da)) >= S.delaiFois;
    liste.push({ id: "delai", cote: !net ? "pareil" : dt < da ? "toi" : "elle", toi: dt, elle: da });
  }
  const { toi: lt, autre: la } = c.motsMoyens;
  if (typeof lt === "number" && typeof la === "number" && lt > 0 && la > 0) {
    const net = Math.max(lt, la) / Math.min(lt, la) >= S.longueurFois;
    liste.push({ id: "longueur", cote: !net ? "pareil" : lt > la ? "toi" : "elle", toi: lt, elle: la });
  }
  return liste;
}

/**
 * Sans l’heure des messages (proposition du 27 octobre 2026) : les seuils d’un écart net sur ce qui se compte quand
 * même. Des captures ou une vidéo n’ont que des heures approximatives, que les chiffres du temps écartent (qui ouvre, qui
 * reprend, qui relance, les délais) : leur paywall tombait toujours sur le titre d’avant, celui qui vendait le moins
 * (/admin, « Le haut du paywall »).
 */
const SEUILS_SANS_HEURES = {
  /** Assez de messages pour en dire quelque chose : 10 en tout, 2 de chaque côté au moins. */
  messages: 10,
  parCote: 2,
  /** Qui écrit le plus : 1,5 fois plus de messages. */
  messagesFois: 1.5,
  /** Qui pose les questions : 3 au moins, et 2 fois plus que l’autre (ou l’autre jamais). */
  questions: 3,
  questionsFois: 2,
} as const;

/** Un message qui pose une question : un texte (pas un média) avec un point d’interrogation. */
const questionne = (m: Message) => !m.media && m.texte.includes("?");

/**
 * Ce qui se compte sans l’heure des messages, sur toute la conv : qui écrit le plus (des messages), qui pose les
 * questions, qui écrit le plus long (le signal « longueur », le même que pour les cinq titres). null : trop peu de
 * messages, ou un côté presque muet.
 */
export function signauxSansHeures(c: Chiffres, messages: Message[]): SignalDuPaywall[] | null {
  const S = SEUILS_SANS_HEURES;
  const { toi: mt, autre: ma } = c.total;
  if (mt + ma < S.messages || Math.min(mt, ma) < S.parCote) return null;
  const plusDeMessages = mt / ma >= S.messagesFois ? "toi" : ma / mt >= S.messagesFois ? "elle" : "pareil";
  const qt = messages.filter((m) => m.role === "toi" && questionne(m)).length;
  const qa = messages.filter((m) => m.role === "autre" && questionne(m)).length;
  const plus = Math.max(qt, qa);
  const questionsNettes = plus >= S.questions && (Math.min(qt, qa) === 0 || plus / Math.min(qt, qa) >= S.questionsFois);
  const longueur = signaux(c).find((s) => s.id === "longueur");
  return [
    { id: "messages", cote: plusDeMessages, toi: mt, elle: ma },
    { id: "questions", cote: !questionsNettes ? "pareil" : qt > qa ? "toi" : "elle", toi: qt, elle: qa },
    ...(longueur ? [longueur] : []),
  ];
}

/**
 * Le haut du paywall d’une conv : ses déséquilibres, et la chute de ses messages s’il y en a une ; avec `h` (une
 * proposition du 22 octobre 2026), ce que tu veux savoir, sur « Qui es-tu ? » (le 1er chapitre du paywall le dit). Et ce
 * qui se compte sans l’heure des messages (une proposition du 27 octobre 2026), quand il y a assez de messages.
 */
export function apercuDuPaywall(c: Chiffres, messages: Message[], h?: Pick<Histoire, "objectif">): ApercuDuPaywall {
  const sansHeures = signauxSansHeures(c, messages);
  const base = { signaux: signaux(c), tendance: tendance(messages), ...(sansHeures && { sansHeures }) };
  if (!h) return base;
  return { ...base, objectif: h.objectif };
}
