import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MIN_MESSAGES_CAPTURES } from "@prompts/lib/conv";
import type { Captures } from "@prompts/lib/schemas";
import { brasDe, decider, estLongue, leContrefactuel, type OuEnEst } from "@/server/lecture-partielle";
import { captures, msg } from "../aide/fabriques";

/*
 * La lecture partielle des longues vidéos (src/server/lecture-partielle.ts), sans base ni modèle : la règle d’arrêt
 * (decider) sur des lots fabriqués, la moitié de l’A/B (brasDe) et le contrefactuel (leContrefactuel). Un lot fabriqué
 * couvre des jours de conv, un bloc par jour (son repère : la date, et l’heure, ou non) ; ses messages ont des textes à
 * eux, que la fusion des lots ne confond jamais. Les convs sont inventées.
 */

const J = 86400e3;
/** Le jour `k` de la conv, à partir du 1er mars 2026 (AAAA-MM-JJ). */
const jour = (k: number) => new Date(Date.UTC(2026, 2, 1) + k * J).toISOString().slice(0, 10);

/** Un jour de conv : combien de messages de l’autre, et de toi, ce jour-là. */
type Jour = { k: number; autre: number; moi?: number; heure?: boolean };

/** Un lot lu : un bloc par jour (le repère du jour, à 21 h ou sans heure), et `ecrans` captures. */
function lot(jours: Jour[], ecrans = 12): Captures {
  return captures({
    autre: "Léa",
    captures: Array.from({ length: ecrans }, (_, i) => ({ numero: i + 1, place: i + 1, hors_sujet: false })),
    blocs: jours.map(({ k, autre, moi = 1, heure = true }) => ({
      repere: { date: jour(k), heure: heure ? "21:00" : null },
      messages: [
        ...Array.from({ length: autre }, (_, j) => msg("autre", `jour ${k} elle message ${j}`)),
        ...Array.from({ length: moi }, (_, j) => msg("moi", `jour ${k} toi message ${j}`)),
      ],
    })),
  });
}

/** Les jours `de` à `a` (exclu), chacun avec `autre` messages d’elle. */
const jours = (de: number, a: number, autre: number, heure = true): Jour[] => Array.from({ length: a - de }, (_, i) => ({ k: de + i, autre, heure }));

/** Les jours en `n` lots qui se suivent, dans l’ordre de la vidéo. */
function enLots(tous: Jour[], n: number): Captures[] {
  const taille = Math.ceil(tous.length / n);
  return Array.from({ length: n }, (_, i) => lot(tous.slice(i * taille, (i + 1) * taille))).filter((l) => l.blocs.length);
}

/** Où en est une longue vidéo de 160 écrans, importée le 1er novembre 2026, au sens sûr. */
const ou = (restants: number, o: Partial<OuEnEst> = {}): OuEnEst => ({ restants, ecrans: 160, appli: "imessage", jour: "2026-11-01", sensSur: true, ...o });

describe("la règle d’arrêt de la lecture partielle", () => {
  it("rien à lire de plus : assez", () => {
    expect(decider(enLots(jours(0, 5, 3), 5), ou(0))).toBe("assez");
  });

  it("le sens douteux (dit par le navigateur, ou des dates qui reculent, ou après le jour de l’import) : tout se lit", () => {
    const lots = enLots(jours(0, 5, 3), 5);
    expect(decider(lots, ou(3, { sensSur: false }))).toBe("tout");
    /* Le deuxième lot recommence trois jours avant la fin du premier */
    expect(decider([lot(jours(10, 15, 3)), lot(jours(11, 14, 3))], ou(3))).toBe("tout");
    /* Une veille d’un jour se tolère (un repère « hier » lu au bord de deux lots) */
    expect(decider([lot(jours(10, 15, 3)), lot(jours(13, 18, 3))], ou(3))).not.toBe("tout");
    /* Une date après le jour de l’import */
    expect(decider(enLots(jours(0, 5, 3), 5), ou(3, { jour: jour(2) }))).toBe("tout");
  });

  it("rien de lisible dans la partie récente, ou trop peu pour une conv de captures : tout se lit", () => {
    expect(decider([captures({ blocs: [] })], ou(3))).toBe("tout");
    /* Un message de moins que MIN_MESSAGES_CAPTURES (les siens, plus un de toi) : la partie récente serait « courte », pas forcément toute la vidéo */
    expect(decider([lot([{ k: 0, autre: MIN_MESSAGES_CAPTURES - 2 }])], ou(3))).toBe("tout");
    expect(decider([lot([{ k: 0, autre: MIN_MESSAGES_CAPTURES - 1 }])], ou(3))).not.toBe("tout");
  });

  it("une conv dense (une vidéo de quelques jours) : assez dès le premier tour", () => {
    expect(decider(enLots(jours(0, 6, 4), 5), ou(10))).toBe("assez");
  });

  it("une conv clairsemée sur des semaines, sans chute : encore ; sur 24 semaines lues : assez", () => {
    /* Un jour par semaine pendant dix semaines : la vidéo entière peut durer des mois */
    const clairsemee = Array.from({ length: 10 }, (_, w) => ({ k: 7 * w, autre: 2 }));
    expect(decider(enLots(clairsemee, 5), ou(10))).toBe("encore");
    const longue = Array.from({ length: 26 }, (_, w) => ({ k: 7 * w, autre: 2 }));
    expect(decider(enLots(longue, 5), ou(10))).toBe("assez");
  });

  it("des repères sans heure : une tendance est impossible, assez", () => {
    const sansHeure = Array.from({ length: 10 }, (_, w) => ({ k: 7 * w, autre: 2, heure: false }));
    expect(decider(enLots(sansHeure, 5), ou(10))).toBe("assez");
  });

  it("une chute avec ses huit semaines de référence : assez ; avec moins : encore (elle serait mal datée)", () => {
    /* Quatre messages d’elle par jour, puis un seul : la chute tombe à la 9e semaine, puis à la 5e */
    const avecReference = [...jours(0, 56, 4), ...jours(56, 84, 1)];
    expect(decider(enLots(avecReference, 5), ou(10))).toBe("assez");
    const sansReference = [...jours(0, 28, 4), ...jours(28, 56, 1)];
    expect(decider(enLots(sansReference, 5), ou(10))).toBe("encore");
  });
});

describe("la moitié d’une longue vidéo dans l’A/B", () => {
  it("la même vidéo tombe toujours dans la même moitié, et les vidéos se partagent à peu près en deux", () => {
    const videos = Array.from({ length: 400 }, () => randomUUID());
    expect(videos.map(brasDe)).toEqual(videos.map(brasDe));
    const partielles = videos.filter((v) => brasDe(v) === "partielle").length;
    expect(partielles).toBeGreaterThan(150);
    expect(partielles).toBeLessThan(250);
  });

  it("une longue vidéo : plus de lots qu’un tour de lecteurs", () => {
    expect([5, 6, 15].map(estLongue)).toEqual([false, true, true]);
  });
});

describe("le contrefactuel : la règle visée rejouée sur une vidéo lue en entier", () => {
  /** Une vidéo de `lots`, importée le 1er novembre 2026, au sens sûr : ses écrans, ceux de ses lots sans l’image que deux lots voisins partagent. */
  const video = (lots: Captures[], o: Partial<Omit<OuEnEst, "restants">> = {}) =>
    leContrefactuel(lots, { ecrans: lots.reduce((n, l, k) => n + l.captures.length - (k ? 1 : 0), 0), appli: "imessage", jour: "2026-11-01", sensSur: true, ...o });

  it("deux lots, une conv dense : assez dès le premier tour (le lot le plus récent seul), le même titre, le plus ancien épargnable avec ses écrans", () => {
    /* Le lot le plus ancien n’a que le reste des écrans (onze), le plus récent est plein */
    const lots = [lot(jours(0, 6, 4), 11), lot(jours(6, 12, 4))];
    expect(video(lots)).toEqual({ contrefactuel: "pareil", arret: "premier_tour", epargnables: 1, ecransEpargnables: 11 });
  });

  it("trois lots, le plus récent étalé sur douze jours : un tour de plus (un lot), puis assez ; seul le plus ancien est épargnable", () => {
    /* Seul, le plus récent laisse croire à une vidéo de plus de 7 semaines ; avec celui d’avant, la conv tient en quelques semaines */
    const lots = [lot(jours(0, 3, 2)), lot(jours(3, 6, 2)), lot(jours(6, 19, 2))];
    expect(video(lots)).toEqual({ contrefactuel: "pareil", arret: "plus_loin", epargnables: 1, ecransEpargnables: 12 });
  });

  it("treize lots : assez au premier tour sur une conv dense (douze lots et leurs écrans épargnables) ; lue jusqu’au bout sur une conv étalée sur des mois, rien d’épargné", () => {
    const dense = enLots(jours(0, 26, 12), 13);
    expect(dense).toHaveLength(13);
    expect(video(dense)).toEqual({ contrefactuel: "pareil", arret: "premier_tour", epargnables: 12, ecransEpargnables: 12 + 11 * 11 });
    /* Quatre jours tous les dix jours : chaque tour de plus allonge la durée lue, sans jamais atteindre 24 semaines */
    const etalee = Array.from({ length: 13 }, (_, j) => lot(jours(10 * j, 10 * j + 4, 6)));
    expect(video(etalee)).toEqual({ contrefactuel: "pareil", arret: "jusqu_au_bout", epargnables: 0, ecransEpargnables: 0 });
  });

  it("le sens douteux : « tout » d’un coup, rien d’épargné, avec sa raison (le navigateur, ou des dates après le jour de l’import ou qui reculent)", () => {
    const lots = [lot(jours(0, 6, 4)), lot(jours(6, 12, 4))];
    expect(video(lots, { sensSur: false })).toEqual({ contrefactuel: "pareil", arret: "tout_sens", epargnables: 0, ecransEpargnables: 0 });
    expect(video(lots, { jour: jour(3) })).toEqual({ contrefactuel: "pareil", arret: "tout_dates", epargnables: 0, ecransEpargnables: 0 });
    /* Un tour de plus (le plus récent, étalé) trouve un lot plus ancien daté après lui : la vidéo filmée dans l’autre sens */
    expect(video([lot(jours(0, 3, 2)), lot(jours(30, 33, 2)), lot(jours(6, 19, 2))])).toMatchObject({ arret: "tout_dates", epargnables: 0 });
  });

  it("moins de messages lus qu’une conv de captures n’en demande : « tout », rien d’épargné", () => {
    /* Un de moins que MIN_MESSAGES_CAPTURES dans le lot le plus récent (les siens, plus un de toi) */
    const lots = [lot(jours(0, 6, 4)), lot([{ k: 6, autre: MIN_MESSAGES_CAPTURES - 2 }])];
    expect(video(lots)).toEqual({ contrefactuel: "pareil", arret: "tout_court", epargnables: 0, ecransEpargnables: 0 });
  });

  it("le titre « volume » : une autre forme sur la partie lue compte comme un autre titre ; la même forme avec d’autres chiffres, non", () => {
    /* Toute la vidéo : elle t’écrit plus (42 contre 24) ; le lot le plus récent seul : toi plus (18 contre 6) */
    const inverse = [lot(jours(0, 6, 6)), lot(Array.from({ length: 6 }, (_, i) => ({ k: 6 + i, autre: 1, moi: 3 })))];
    expect(video(inverse)).toEqual({ contrefactuel: "autre_titre", arret: "premier_tour", epargnables: 1, ecransEpargnables: 12 });
    /* Elle t’écrit plus sur les deux (6 contre 1, puis 4 contre 1) : « 6 fois » ou « 4 fois », le même titre */
    const pareille = [lot(jours(0, 6, 6)), lot(jours(6, 12, 4))];
    expect(video(pareille)).toMatchObject({ contrefactuel: "pareil", arret: "premier_tour" });
  });

  it("une chute très ancienne, sous 24 semaines plates : la partie récente l’aurait perdue", () => {
    /* Huit semaines à quatre messages par jour, puis trente semaines à un seul : la chute ne se voit que sur toute la conv */
    const lots = enLots([...jours(0, 56, 4), ...jours(56, 266, 1)], 20);
    const c = leContrefactuel(lots, { ecrans: 230, appli: "imessage", jour: "2026-11-30", sensSur: true });
    expect(c.contrefactuel).toBe("tendance_perdue");
    expect(c.arret).toBe("plus_loin");
    expect(c.epargnables).toBeGreaterThan(0);
  });
});
