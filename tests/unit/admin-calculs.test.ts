import { describe, expect, it } from "vitest";
import {
  caseNommee,
  dollars,
  ecartEnPoints,
  ecartEnValeur,
  ecartRelatif,
  etapesPeuplees,
  euros,
  fuiteDuTunnel,
  graduations,
  ilYa,
  nomsDeLaCase,
  pluriel,
  pointsDeLaCourbe,
  pourcent,
  rapport,
  texteDeLaFuite,
  texteDuGeste,
} from "@/app/admin/calculs";
import type { GesteDuFil } from "@/types/api";

/*
 * Les calculs du pilotage (src/app/admin/calculs.ts) : les formats, les écarts avec la période d’avant, les graduations et
 * les noms des cases des graphiques, la plus grosse fuite du tunnel, le texte d’un geste du fil. Jamais de division par
 * zéro, jamais « NaN » à l’écran.
 */

const NB = "\u00a0";
/* Le séparateur des milliers de fr-FR (l’espace fine insécable) */
const MILLE = (1000).toLocaleString("fr-FR").charAt(1);

describe("les formats", () => {
  it("euros, dollars, pourcentages : à la française, l’insécable avant l’unité, le vrai signe moins", () => {
    expect(euros(177930)).toBe(`1${MILLE}779,30${NB}€`);
    expect(euros(177930, 0)).toBe(`1${MILLE}779${NB}€`);
    expect(euros(0)).toBe(`0,00${NB}€`);
    expect(euros(-990)).toBe(`−9,90${NB}€`);
    /* Un négatif qui s’arrondit à zéro ne garde pas son signe */
    expect(euros(-0.2)).toBe(`0,00${NB}€`);
    expect(dollars(425.4)).toBe(`425${NB}$`);
    expect(dollars(3.244)).toBe(`3,24${NB}$`);
    expect(pourcent(2.716, 2)).toBe(`2,72${NB}%`);
    expect(pourcent(80, 0)).toBe(`80${NB}%`);
  });

  it("un rapport sans dénominateur rend null, jamais Infinity ni NaN", () => {
    expect(rapport(1, 4)).toBe(0.25);
    expect(rapport(1, 0)).toBeNull();
    expect(rapport(0, 0)).toBeNull();
    expect(rapport(1, -5)).toBeNull();
    expect(rapport(Number.NaN, 2)).toBeNull();
  });

  it("le pluriel : zéro et un au singulier", () => {
    expect(pluriel(0, "personne")).toBe(`0${NB}personne`);
    expect(pluriel(1, "personne")).toBe(`1${NB}personne`);
    expect(pluriel(23, "personne")).toBe(`23${NB}personnes`);
    expect(pluriel(2, "canal", "canaux")).toBe(`2${NB}canaux`);
  });
});

describe("les écarts avec la période d’avant", () => {
  it("en %, vert quand ça monte, rouge quand ça baisse, « = » sous un demi-point", () => {
    expect(ecartRelatif(131, 100, euros)).toEqual({ fleche: "↑", texte: `+31${NB}%`, ton: "bon" });
    expect(ecartRelatif(90, 100, euros)).toEqual({ fleche: "↓", texte: `−10${NB}%`, ton: "mal" });
    expect(ecartRelatif(100.4, 100, euros)).toEqual({ fleche: "", texte: "=", ton: "neutre" });
  });

  it("le sens où un chiffre va bien : en baissant, ou aucun (ce que coûte l’IA)", () => {
    expect(ecartRelatif(131, 100, euros, "baisse").ton).toBe("mal");
    expect(ecartRelatif(131, 100, dollars, null).ton).toBe("neutre");
  });

  it("sans période d’avant à diviser (rien, ou un net négatif), l’écart s’écrit en valeur", () => {
    expect(ecartRelatif(22140, 0, euros)).toEqual({ fleche: "↑", texte: `+221,40${NB}€`, ton: "bon" });
    expect(ecartRelatif(1000, -500, euros)).toEqual({ fleche: "↑", texte: `+15,00${NB}€`, ton: "bon" });
    expect(ecartRelatif(0, 0, euros)).toEqual({ fleche: "", texte: "=", ton: "neutre" });
  });

  it("en points et en valeur : null si l’un des deux manque, « = » quand l’écart s’écrit zéro", () => {
    expect(ecartEnPoints(2.72, 2.83, "hausse", 2)).toEqual({ fleche: "↓", texte: `−0,11${NB}pt`, ton: "mal" });
    expect(ecartEnPoints(75.3, 77.2)).toEqual({ fleche: "↓", texte: `−1,9${NB}pt`, ton: "mal" });
    expect(ecartEnPoints(null, 3)).toBeNull();
    expect(ecartEnPoints(3, null)).toBeNull();
    expect(ecartEnValeur(1392, 1322, (v) => euros(v))).toEqual({ fleche: "↑", texte: `+0,70${NB}€`, ton: "bon" });
    expect(ecartEnValeur(1385.2, 1385, (v) => euros(v))).toEqual({ fleche: "", texte: "=", ton: "neutre" });
    expect(ecartEnValeur(null, 1385, (v) => euros(v))).toBeNull();
  });
});

describe("les graphiques", () => {
  it("le haut de l’axe : un nombre rond au moins égal au plus haut, jamais sous 10 €", () => {
    expect(graduations(0)).toEqual({ haut: 1000, marques: [0, 500, 1000] });
    expect(graduations(34100)).toEqual({ haut: 40000, marques: [0, 20000, 40000] });
    expect(graduations(100000).haut).toBe(100000);
    expect(graduations(100001).haut).toBe(200000);
    expect(graduations(Number.NaN).haut).toBe(1000);
    expect(graduations(-500).haut).toBe(1000);
  });

  it.each([1, 999, 1000, 1001, 4321, 15500, 99999, 123456, 987654, 5_000_000])("%i centimes : trois graduations d’euros ronds, la plus haute au-dessus", (max) => {
    const { haut, marques } = graduations(max);
    expect(haut).toBeGreaterThanOrEqual(max);
    for (const m of marques) expect(m % 100, `${m}`).toBe(0);
    /* Jamais plus du double : l’axe ne tasse pas les colonnes */
    expect(haut).toBeLessThanOrEqual(Math.max(1000, max * 2));
  });

  it("les noms d’une case, en heure de Paris : une heure, un jour de la semaine, un jour du mois", () => {
    expect(nomsDeLaCase("2026-10-13T14:00:00.000Z", "heure", 24)).toEqual({ courte: `16${NB}h`, longue: `16${NB}h`, complete: `de 16${NB}h à 17${NB}h` });
    expect(nomsDeLaCase("2026-10-13T21:00:00.000Z", "heure", 24).complete).toBe(`de 23${NB}h à 0${NB}h`);
    expect(nomsDeLaCase("2026-10-12T22:00:00.000Z", "jour", 7)).toEqual({ courte: "ma", longue: "mar. 13", complete: "mardi 13 octobre" });
    expect(nomsDeLaCase("2026-09-13T22:00:00.000Z", "jour", 30)).toEqual({ courte: "14", longue: "14 sept.", complete: "lundi 14 septembre" });
  });

  it("les cases nommées sous le graphique : toutes sur une semaine, une sur quatre ou cinq sinon, la dernière toujours", () => {
    expect(Array.from({ length: 7 }, (_, k) => caseNommee(k, 7))).toEqual(Array(7).fill(true));
    expect([23, 19, 15, 0].map((k) => caseNommee(k, 24))).toEqual([true, true, true, false]);
    expect([22, 20].map((k) => caseNommee(k, 24))).toEqual([false, false]);
    expect([29, 24, 0, 28].map((k) => caseNommee(k, 30))).toEqual([true, true, false, false]);
  });

  it("les points d’une courbe : le plus bas en bas, un trou enjambé, une courbe plate au milieu, rien sous deux points", () => {
    expect(pointsDeLaCourbe([])).toBe("");
    expect(pointsDeLaCourbe([5])).toBe("");
    expect(pointsDeLaCourbe([null, 5, null])).toBe("");
    expect(pointsDeLaCourbe([1, null, 3])).toBe("0.0,33.0 100.0,3.0");
    expect(pointsDeLaCourbe([2, 2])).toBe("0.0,18.0 100.0,18.0");
    expect(pointsDeLaCourbe([Number.NaN, 1, 2])).toBe("50.0,33.0 100.0,3.0");
  });
});

describe("le tunnel", () => {
  it("la plus grosse fuite : le passage au plus petit taux, entre l’arrivée et l’achat", () => {
    expect(fuiteDuTunnel({ visiteurs: 4820, imports: 702, verdicts: 604, acheteurs: 131, racheteurs: 19 })).toEqual({ etape: 1, taux: 702 / 4820, depuis: 4820, vers: 702 });
    expect(fuiteDuTunnel({ visiteurs: 100, imports: 80, verdicts: 20, acheteurs: 10, racheteurs: 0 })?.etape).toBe(2);
    expect(fuiteDuTunnel({ visiteurs: 100, imports: 80, verdicts: 70, acheteurs: 5, racheteurs: 0 })?.etape).toBe(3);
  });

  it("sans visiteurs comptés, l’arrivée ne compte pas ; rien à comparer, ou rien qui fuit : null", () => {
    expect(fuiteDuTunnel({ visiteurs: 0, imports: 80, verdicts: 20, acheteurs: 10, racheteurs: 1 })?.etape).toBe(2);
    expect(fuiteDuTunnel({ visiteurs: 0, imports: 0, verdicts: 0, acheteurs: 0, racheteurs: 0 })).toBeNull();
    expect(fuiteDuTunnel({ visiteurs: 10, imports: 12, verdicts: 12, acheteurs: 12, racheteurs: 0 })).toBeNull();
    /* À égalité, la première */
    expect(fuiteDuTunnel({ visiteurs: 100, imports: 50, verdicts: 25, acheteurs: 20, racheteurs: 0 })?.etape).toBe(1);
  });

  it("ce que dit la fuite, à chaque étape : la part perdue, et les deux nombres", () => {
    expect(texteDeLaFuite({ etape: 1, taux: 0.146, depuis: 4820, vers: 702 }).titre).toBe(`85${NB}% des visiteurs repartent sans importer`);
    expect(texteDeLaFuite({ etape: 1, taux: 0.146, depuis: 4820, vers: 702 }).texte).toContain(`702${NB}imports pour 4${MILLE}820${NB}visiteurs`);
    expect(texteDeLaFuite({ etape: 2, taux: 0.5, depuis: 2, vers: 1 }).titre).toBe(`50${NB}% des convs importées n’arrivent pas au verdict`);
    expect(texteDeLaFuite({ etape: 2, taux: 0.5, depuis: 2, vers: 1 }).texte).toContain(`1${NB}verdict pour 2${NB}convs importées`);
    expect(texteDeLaFuite({ etape: 3, taux: 0.2, depuis: 5, vers: 1 }).titre).toBe(`80${NB}% des verdicts ne finissent pas en achat`);
  });
});

describe("le direct", () => {
  it("« il y a » : en secondes, en minutes, en heures, une seconde au moins", () => {
    expect(ilYa(0)).toBe(`il y a 1${NB}s`);
    expect(ilYa(12.4)).toBe(`il y a 12${NB}s`);
    expect(ilYa(60)).toBe(`il y a 1${NB}min`);
    expect(ilYa(3599)).toBe(`il y a 59${NB}min`);
    expect(ilYa(7200)).toBe(`il y a 2${NB}h`);
    expect(ilYa(Number.NaN)).toBe(`il y a 1${NB}s`);
  });

  it.each<[GesteDuFil, string, string | null]>([
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "tiktok" }, "arrive de TikTok", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "instagram" }, "arrive d’Instagram", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "snapchat" }, "arrive de Snapchat", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "google" }, "arrive de Google", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "partage" }, "arrive d’un verdict partagé", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "autre" }, "arrive d’un autre site", null],
    [{ genre: "arrivee", ville: "Lyon", le: "", source: "direct" }, "arrive en direct", null],
    [{ genre: "import", ville: "Lyon", le: "" }, "a importé une conv", null],
    [{ genre: "paiement", ville: "Lyon", le: "", offre: "premium" }, "ouvre le paiement · Premium", null],
    [{ genre: "achat", ville: "Lyon", le: "", offre: "pack80" }, "a pris 80 bulles", `13,90${NB}€`],
    [{ genre: "achat", ville: "Lyon", le: "", offre: "suite" }, "a pris Ta suite", `10,90${NB}€`],
    [{ genre: "partage", ville: "Lyon", le: "" }, "a partagé son verdict", null],
  ])("le geste %o : « %s »", (g, quoi, prix) => {
    expect(texteDuGeste(g)).toEqual({ ville: "Lyon", quoi, prix });
  });

  it("une ville inconnue se dit « Ville inconnue »", () => {
    expect(texteDuGeste({ genre: "import", ville: null, le: "" }).ville).toBe("Ville inconnue");
  });

  it("les écrans peuplés : les plus nombreux, dans l’ordre du parcours", () => {
    const etapes = [
      { etape: "chat", n: 3 },
      { etape: "accueil", n: 7 },
      { etape: "autre", n: 0 },
      { etape: "paiement", n: 1 },
      { etape: "import", n: 5 },
    ] as const;
    expect(etapesPeuplees([...etapes])).toEqual([
      { etape: "accueil", n: 7 },
      { etape: "import", n: 5 },
      { etape: "paiement", n: 1 },
      { etape: "chat", n: 3 },
    ]);
    expect(etapesPeuplees([...etapes], 2).map((e) => e.etape)).toEqual(["accueil", "import"]);
    expect(etapesPeuplees([])).toEqual([]);
  });
});
