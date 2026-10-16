import { describe, expect, it } from "vitest";
import type { Chiffres, Message } from "@prompts/lib/conv";
import { dateDuHaut, genreDuHaut, hautDuPaywall, semaineDeLaCourbe } from "@/contenu/haut-du-paywall";
import { signaux } from "@/server/ecrans/haut-du-paywall";
import { tendance } from "@/server/ecrans/tendance";
import type { ApercuDuPaywall } from "@/types";

/*
 * Le haut du paywall (la maquette « Le mix ») : les déséquilibres comptés par le code, la chute de ses messages, la règle
 * qui choisit un titre parmi cinq, et ses textes. Des chiffres écrits à la main et des convs fabriquées, deux prénoms
 * inventés (Lucas, Léa).
 */

const MIN = 60e3;
const H = 3600e3;
const J = 24 * H;

const chiffres = (autres: Partial<Chiffres> = {}): Chiffres => ({
  qui: { toi: "Inès", autre: "Lucas" },
  total: { toi: 2000, autre: 2365 },
  medias: { toi: {}, autre: {} },
  debut: "2026-01-01",
  fin: "2026-04-20",
  joursActifs: 100,
  ouvre: { toi: 50, autre: 50 },
  reprend: { toi: 10, autre: 10 },
  relance: { toi: 3, autre: 3 },
  delai: { toi: 6 * MIN, autre: 6 * MIN },
  soir: { toi: "20 %", autre: "20 %" },
  longueurs: [],
  motsMoyens: { toi: 10, autre: 11 },
  recurrents: [],
  approx: 0,
  ...autres,
});

/** Le haut d’une conv sans chute, d’après ses chiffres. */
const apercu = (autres: Partial<Chiffres> = {}): ApercuDuPaywall => ({ signaux: signaux(chiffres(autres)), tendance: null });
const LUCAS = { nom: "Lucas", il: true };
const LEA = { nom: "Léa", il: false };

describe("les déséquilibres comptés par le code", () => {
  it("un écart net : 65 % des jours (sur 5 au moins), 2 fois plus de relances, 2 fois plus vite (5 min d’écart), 1,8 fois plus long", () => {
    const s = signaux(
      chiffres({
        ouvre: { toi: 7, autre: 3 },
        reprend: { toi: 2, autre: 8 },
        relance: { toi: 6, autre: 2 },
        delai: { toi: 12 * MIN, autre: 4 * MIN },
        motsMoyens: { toi: 9, autre: 19 },
      }),
    );
    expect(s.map((x) => [x.id, x.cote])).toEqual([
      ["ouvre", "toi"],
      ["reprend", "elle"],
      ["relance", "toi"],
      ["delai", "elle"],
      ["longueur", "elle"],
    ]);
  });

  it("sous les seuils : pareil (60 % des jours, 4 jours en tout, 3 relances, 2 min contre 3)", () => {
    const s = signaux(chiffres({ ouvre: { toi: 6, autre: 4 }, reprend: { toi: 3, autre: 1 }, relance: { toi: 3, autre: 0 }, delai: { toi: 3 * MIN, autre: 2 * MIN } }));
    expect(s.filter((x) => x.cote !== "pareil")).toEqual([]);
  });

  it("des captures sans heures : ni délai, ni longueur sans mots", () => {
    expect(signaux(chiffres({ delai: { toi: null, autre: 5 * MIN }, motsMoyens: { toi: "—", autre: 4 } })).map((x) => x.id)).toEqual(["ouvre", "reprend", "relance"]);
  });
});

/** Une conv fabriquée : chaque jour, `parJour(j)` messages de Lucas, chacun répondant à un message d’Inès `delai(j)` plus tôt. */
function conv(jours: number, parJour: (j: number) => number, delai: (j: number) => number = () => 4 * MIN): Message[] {
  const debut = Date.parse("2026-01-01T09:00:00Z");
  const messages: Message[] = [];
  for (let j = 0; j < jours; j++)
    for (let k = 0; k < parJour(j); k++) {
      const t = debut + j * J + k * 20 * MIN;
      messages.push({ id: "", t, nom: "Inès", role: "toi", texte: "alors", approx: false, ligne: 0 });
      messages.push({ id: "", t: t + delai(j), nom: "Lucas", role: "autre", texte: "oui", approx: false, ligne: 0 });
    }
  return messages.map((m, i) => ({ ...m, id: `m${String(i + 1).padStart(4, "0")}`, ligne: i + 1 }));
}

describe("la chute de ses messages", () => {
  it("40 par jour pendant 10 semaines, puis 15 : la chute commence la semaine du 12 mars, son délai a grandi", () => {
    const t = tendance(
      conv(
        15 * 7,
        (j) => (j < 70 ? 40 : 15),
        (j) => (j < 70 ? 4 * MIN : 13 * MIN),
      ),
    );
    expect(t).toMatchObject({ depuis: "2026-03-12", avant: 40, apres: 15, delai: { avant: 4 * MIN, apres: 13 * MIN } });
    expect(t!.semaines[t!.coupure - 1]).toBe(40);
    expect(t!.semaines[t!.coupure]).toBe(15);
    expect(semaineDeLaCourbe(t!, t!.coupure)).toBe("2026-03-12");
  });

  it("pas de chute : un rythme stable, une baisse de 30 %, une remontée depuis, ou trop peu d’histoire", () => {
    expect(tendance(conv(15 * 7, () => 30))).toBeNull();
    expect(tendance(conv(15 * 7, (j) => (j < 70 ? 40 : 28)))).toBeNull();
    expect(tendance(conv(15 * 7, (j) => (j < 70 || (j >= 84 && j < 91) ? 40 : 15)))).toBeNull();
    expect(tendance(conv(5 * 7, (j) => (j < 21 ? 40 : 10)))).toBeNull();
  });

  it("un délai qui ne grandit pas assez n’est pas dit", () => {
    expect(tendance(conv(15 * 7, (j) => (j < 70 ? 40 : 15)))?.delai).toBeNull();
  });
});

describe("la règle des cinq titres", () => {
  it("chaque conv a le sien, d’après ses déséquilibres nets (la longueur ne compte pas)", () => {
    expect(genreDuHaut(apercu({ ouvre: { toi: 7, autre: 3 }, reprend: { toi: 2, autre: 8 } }))).toBe("contraste");
    expect(genreDuHaut(apercu({ ouvre: { toi: 8, autre: 2 }, relance: { toi: 6, autre: 2 }, delai: { toi: 12 * MIN, autre: 4 * MIN } }))).toBe("toi");
    expect(genreDuHaut(apercu({ ouvre: { toi: 2, autre: 8 }, relance: { toi: 0, autre: 5 }, delai: { toi: 2 * H, autre: 3 * MIN } }))).toBe("elle");
    expect(genreDuHaut(apercu({ ouvre: { toi: 8, autre: 2 }, relance: { toi: 6, autre: 2 }, reprend: { toi: 1, autre: 9 }, delai: { toi: 12 * MIN, autre: 4 * MIN } }))).toBe(
      "contraste",
    );
    expect(genreDuHaut(apercu({ motsMoyens: { toi: 9, autre: 19 } }))).toBe("egalite");
    expect(genreDuHaut(apercu({ ouvre: { toi: 7, autre: 3 } }))).toBe("egalite");
  });

  it("la chute passe avant tout ; sans assez de chiffres (4 jours, pas de délai), le titre d’avant", () => {
    expect(genreDuHaut({ ...apercu({ ouvre: { toi: 7, autre: 3 }, reprend: { toi: 2, autre: 8 } }), tendance: tendance(conv(15 * 7, (j) => (j < 70 ? 40 : 15))) })).toBe(
      "tendance",
    );
    expect(genreDuHaut(apercu({ ouvre: { toi: 2, autre: 2 } }))).toBe("aucun");
    expect(genreDuHaut(apercu({ delai: { toi: null, autre: null } }))).toBe("aucun");
  });
});

describe("les textes du haut", () => {
  it("contraste : ce que tu fais, puis ce qu’il fait, en rose ; la bulle de BLUSH dit pourquoi il revient", () => {
    const h = hautDuPaywall(apercu({ ouvre: { toi: 7, autre: 3 }, reprend: { toi: 2, autre: 8 } }), LUCAS);
    expect(h.titre).toEqual(["Tu ouvres la conv.", "Lucas, lui, revient."]);
    expect(h.sous).toBe("7 jours sur 10, c’est toi qui dis bonjour. Mais après un silence, c’est Lucas qui reprend, 8 fois sur 10.");
    expect(h.question).toBe("BLUSH t’écrit pourquoi il revient");
    expect(h.carte?.lignes.map((l) => [l.label, l.toi.n, l.elle.n, l.cote])).toEqual([
      ["Ouvre la journée", "7", "3", "toi"],
      ["Reprend après un silence", "2", "8", "elle"],
    ]);
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["7\u00a0/10 tu ouvres la journée", "8\u00a0/10 il reprend après un silence"]);
  });

  it("au féminin : « Léa, elle, revient », « pourquoi elle revient »", () => {
    const h = hautDuPaywall(apercu({ ouvre: { toi: 7, autre: 3 }, reprend: { toi: 2, autre: 8 } }), LEA);
    expect(h.titre[1]).toBe("Léa, elle, revient.");
    expect(h.question).toBe("BLUSH t’écrit pourquoi elle revient");
  });

  it("tout vient de toi : tu portes la conv, et ce qu’il fait, lui, en rose ; « Mais » avant", () => {
    const h = hautDuPaywall(apercu({ ouvre: { toi: 8, autre: 2 }, relance: { toi: 6, autre: 2 }, delai: { toi: 12 * MIN, autre: 4 * MIN } }), LUCAS);
    expect(h.titre).toEqual(["C’est toi qui portes la conv.", "Lucas, lui, répond vite."]);
    expect(h.sous).toBe("8 jours sur 10, c’est toi qui dis bonjour. Tu relances 3 fois plus que lui. Mais Lucas te répond en 4\u00a0min, toi en 12\u00a0min.");
    expect(h.question).toBe("BLUSH t’écrit ce que ça dit de lui");
    expect(h.cases.map((c) => c.texte)).toEqual(["tu ouvres la journée", "pour qu’il te réponde"]);
  });

  it("tout vient de lui : il court après toi ; plus rapide que toi, « Toi, tu le fais attendre »", () => {
    const h = hautDuPaywall(apercu({ ouvre: { toi: 2, autre: 8 }, relance: { toi: 0, autre: 5 }, delai: { toi: 2 * H, autre: 3 * MIN } }), LUCAS);
    expect(h.titre).toEqual(["Lucas court après toi.", "Toi, tu le fais attendre."]);
    expect(h.sous).toBe("8 jours sur 10, c’est Lucas qui dit bonjour. Lucas relance, toi jamais. Lucas te répond en 3\u00a0min, toi en 2\u00a0h.");
    expect(h.question).toBe("BLUSH t’écrit ce qu’il attend de toi");
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["8\u00a0/10 il ouvre la journée", "2\u00a0h pour lui répondre, lui 3\u00a0min"]);
  });

  it("égalité : « Presque » et le seul détail qui penche ; sans détail, ce qui se joue ailleurs", () => {
    const presque = hautDuPaywall(apercu({ motsMoyens: { toi: 9, autre: 19 } }), LUCAS);
    expect(presque.titre).toEqual(["Vous êtes à égalité.", "Presque."]);
    expect(presque.sous).toBe("Personne ne court après l’autre. Un seul chiffre penche\u00a0: Lucas écrit 2 fois plus long que toi.");
    expect(presque.question).toBe("BLUSH t’écrit ce que ce détail veut dire");
    expect(presque.carte?.lignes.map((l) => l.label)).toEqual(["Ouvre la journée", "Répond le plus vite", "Écrit le plus long"]);
    const ailleurs = hautDuPaywall(apercu(), LUCAS);
    expect(ailleurs.titre).toEqual(["Vous êtes à égalité.", "Ce qui se joue est ailleurs."]);
    expect(ailleurs.cases.map((c) => `${c.valeur} ${c.texte}`)).toEqual(["5–5 qui ouvre la journée", "6 pour vous répondre"]);
  });

  it("tendance : depuis la date, combien de fois moins, son délai ; « presque plus » quand il a presque arrêté", () => {
    const t = tendance(
      conv(
        15 * 7,
        (j) => (j < 70 ? 40 : 15),
        (j) => (j < 70 ? 4 * MIN : 13 * MIN),
      ),
    )!;
    const h = hautDuPaywall({ signaux: [], tendance: t }, LUCAS, { annee: 2026 });
    expect(h.genre).toBe("tendance");
    expect(h.titre).toEqual(["Depuis le 12\u00a0mars,", "Lucas t’écrit 3 fois moins."]);
    expect(h.sous).toBe("Avant, il t’envoyait 40 messages par jour. Depuis, 15. Et il met 13\u00a0min à te répondre, contre 4\u00a0min avant.");
    expect(h.question).toBe("BLUSH t’écrit ce qui a changé");
    expect(h.cases.map((c) => `${c.valeur} ${c.texte}`)).toEqual(["40 → 15 messages par jour", "4\u00a0min → 13\u00a0min pour te répondre"]);
    expect(hautDuPaywall({ signaux: [], tendance: { ...t, avant: 10, apres: 7.5, delai: null } }, LUCAS).titre[1]).toBe("Lucas t’écrit 30\u00a0% de moins.");
    expect(hautDuPaywall({ signaux: [], tendance: { ...t, apres: 1 } }, LUCAS).titre[1]).toBe("Lucas ne t’écrit presque plus.");
    expect(hautDuPaywall({ signaux: [], tendance: t }, LUCAS, { annee: 2027 }).titre[0]).toBe("Depuis le 12\u00a0mars 2026,");
  });

  it("sans assez de chiffres : le titre d’avant, sans cases ni carte", () => {
    const h = hautDuPaywall(apercu({ ouvre: { toi: 2, autre: 2 } }), LUCAS);
    expect(h).toMatchObject({ genre: "aucun", titre: ["Ton rapport sur toi et Lucas n’attend que toi."], sous: "", carte: null, cases: [], courbe: null });
    expect(h.question).toBe("BLUSH t’écrit ce qui se passe entre vous");
  });

  it("les dates : « 1er mars », « 3\u00a0janv. » en court", () => {
    expect(dateDuHaut("2026-03-01")).toBe("1er\u00a0mars");
    expect(dateDuHaut("2026-01-03", { court: true })).toBe("3\u00a0janv.");
  });
});
