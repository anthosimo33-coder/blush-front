/*
 * La conv de l’accueil gardée pendant la visite, hors du composant, et sa fusion avec l’historique du serveur.
 * Revenu sur l’accueil (sa fiche, le compte, le rapport, le geste retour), Next remonte la page avec l’historique d’avant
 * la visite : l’accueil repart de la conv gardée (les échanges de la visite, les morceaux d’historique déjà chargés), et
 * l’historique frais s’y fond sans rien remplacer ni rien déplacer de ce qui est déjà là.
 *
 * Les identifiants (l’historique du back-end, l’intro et l’aperçu, la visite) et ce qu’ils disent d’un message :
 * accueil/conv/modele.ts.
 */
import { echangeDe, idHistorique, origineDe, questionDe, rangDansLEchange, type Msg } from "./accueil/conv/modele";

/** Une conv affichée : ses messages, et l’historique plus ancien à charger (`plusAncien` : l’échange le plus ancien affiché). */
export type Conv<M> = { msgs: M[]; plus: boolean; plusAncien: number | null };

const estHistorique = (m: { id: number }) => origineDe(m.id) === "historique";
const deLaVisite = (m: { id: number }) => origineDe(m.id) === "visite";
/** L’intro et l’aperçu : ils restent ceux de la conv affichée. */
const fixe = (m: { id: number }) => {
  const origine = origineDe(m.id);
  return origine === "intro" || origine === "apercu";
};

/** L’échange auquel appartient une réponse de BLUSH (back-end : l’id de ton message). */
const echangeRepondu = (m: Msg) => (m.type === "reponse" ? m.result.echange : undefined);

/** Ce qui ne remonte pas : « BLUSH écrit » (l’échange revient fini par l’historique), et ce qui montre un fichier local. */
const neRemontePas = (m: Msg) => m.type === "ecrit" || m.type === "images" || m.type === "vocal";

/**
 * La conv gardée, prête à remonter. Sans « BLUSH écrit » ni ton message qui l’attendait (l’échange, fini depuis, revient
 * par l’historique), ni ce qui montre un fichier local (ses adresses sont révoquées au départ de l’accueil). Rien n’y
 * rejoue son arrivée (`answered` : les réponses ne se déplient plus). Back-end : un échange de la visite prend
 * l’identifiant qu’il a dans l’historique, l’historique frais le reconnaît au lieu de le doubler.
 */
export function remonter(conv: Conv<Msg>): Conv<Msg> {
  const enAttente = new Set(conv.msgs.filter((m) => m.type === "ecrit").map((m) => questionDe(m.id)));
  const gardes = conv.msgs.filter((m) => !neRemontePas(m) && !(m.from === "toi" && deLaVisite(m) && enAttente.has(m.id)));
  const parId = new Map(gardes.map((m) => [m.id, m]));
  const renommes = new Map<number, number>();
  for (const m of gardes) {
    const e = deLaVisite(m) ? echangeRepondu(m) : undefined;
    if (e === undefined) continue;
    renommes.set(m.id, idHistorique(e, true));
    const question = questionDe(m.id);
    if (parId.get(question)?.from === "toi") renommes.set(question, idHistorique(e, false));
  }
  const msgs = gardes.map((m) => {
    const id = renommes.get(m.id) ?? m.id;
    return id === m.id && !m.answered ? m : { ...m, id, answered: false };
  });
  return { ...conv, msgs };
}

/**
 * La conv affichée `s`, où se fond une version plus fraîche (ou plus ancienne) de l’historique `f`. L’historique des
 * deux s’additionne (rien n’est jamais effacé) et se range par échange ; un message déjà affiché garde son objet (sa
 * bulle ne se refait pas). Les messages de la visite sans échange (un repère de niveau, un mot de BLUSH) restent après
 * l’échange qui les précédait. L’intro et l’aperçu restent ceux de `s`.
 * Si `f` ne rejoint pas ce qui est affiché (un trou : plus d’un morceau écrit ailleurs entre-temps), on part de `f`.
 */
export function fusion(s: Conv<Msg>, f: Conv<Msg>): Conv<Msg> {
  const fixes = s.msgs.filter(fixe);
  const sh = s.msgs.filter(estHistorique);
  const fh = f.msgs.filter(estHistorique);
  const sMax = Math.max(...sh.map((m) => echangeDe(m.id)));
  const fMin = Math.min(...fh.map((m) => echangeDe(m.id)));
  if (sh.length && fh.length && fMin > sMax) return { msgs: [...fixes, ...fh], plus: f.plus, plusAncien: f.plusAncien };
  /* Chaque message et sa place : son échange, puis ton message, la réponse, et ce qui suit dans la visite */
  const places = new Map<number, { m: Msg; e: number; rang: number }>();
  for (const m of fh) places.set(m.id, { m, e: echangeDe(m.id), rang: rangDansLEchange(m.id) });
  let ancre = -Infinity;
  let suite = 2;
  for (const m of s.msgs) {
    if (estHistorique(m)) {
      ancre = echangeDe(m.id);
      places.set(m.id, { m, e: ancre, rang: rangDansLEchange(m.id) });
    } else if (deLaVisite(m)) places.set(m.id, { m, e: ancre, rang: suite++ });
  }
  const ranges = [...places.values()].sort((a, b) => a.e - b.e || a.rang - b.rang);
  const plusAncienAffiche = ranges.find((p) => estHistorique(p.m))?.e;
  /* Le plus ancien affiché vient de `s` ou de `f` : c’est lui qui sait s’il en reste d’autres */
  const depuisS = sh.length > 0 && (!fh.length || Math.min(...sh.map((m) => echangeDe(m.id))) <= fMin);
  return {
    msgs: [...fixes, ...ranges.map((p) => p.m)],
    plus: depuisS ? s.plus : fh.length ? f.plus : s.plus,
    plusAncien: plusAncienAffiche ?? (depuisS ? s.plusAncien : f.plusAncien),
  };
}

/** Les mêmes messages, dans le même ordre (rien à reposer). */
export const memesMessages = (a: readonly { id: number }[], b: readonly { id: number }[]) => a.length === b.length && a.every((m, i) => m === b[i]);
