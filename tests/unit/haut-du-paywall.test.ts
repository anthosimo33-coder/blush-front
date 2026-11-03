import { describe, expect, it } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";
import { lire, type Chiffres, type Message } from "@prompts/lib/conv";
import { dateDuHaut, genreDuHaut, hautDuPaywall, semaineDeLaCourbe } from "@/contenu/haut-du-paywall";
import { signaux, signauxSansHeures } from "@/server/ecrans/haut-du-paywall";
import { tendance } from "@/server/ecrans/tendance";
import { morceauxContinus } from "@/server/histoires";
import { reunir } from "@/server/morceaux";
import type { ApercuDuPaywall, SignalDuPaywall, TendanceDuPaywall } from "@/types";
import { captures, msg } from "../aide/fabriques";

/*
 * Le haut du paywall (la maquette « Le mix ») : les déséquilibres comptés par le code, la chute de ses messages, la règle
 * qui choisit un titre parmi cinq, et ses textes ; et le titre « volume » (une proposition du 27 octobre 2026), compté
 * sans l’heure des messages ; et, sur une conv en morceaux ou des captures, ce que la chute compte (novembre 2026). Des
 * chiffres écrits à la main et des convs fabriquées, des prénoms inventés (Lucas, Léa, Inès, Tom).
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

/** Le lundi 2 mars 2026 : le premier jour des morceaux fabriqués. */
const JOUR_0 = Date.parse("2026-03-02T00:00:00Z");
/**
 * Un morceau fabriqué : du jour `de` (depuis JOUR_0) pendant `jours` jours, `parJour(j)` messages de Lucas, chacun
 * répondant à Inès 4 min plus tard ; `approx` : un export (false, à 9 h), des captures à l’heure de leur repère
 * (« heure », 21 h) ou au jour seul (« jour », minuit). `k` : son rang dans la conv réunie (undefined : une conv d’un seul morceau).
 */
function morceau(k: number | undefined, de: number, jours: number, parJour: (j: number) => number, approx: Message["approx"] = false): Message[] {
  const messages: Message[] = [];
  for (let j = de; j < de + jours; j++) {
    const base = JOUR_0 + j * J + (approx === false ? 9 * H : approx === "heure" ? 21 * H : 0);
    for (let i = 0; i < parJour(j - de); i++) {
      const t = approx === "jour" ? base : base + i * 20 * MIN;
      const dans = k === undefined ? {} : { morceau: k };
      messages.push({ id: "", t, nom: "Inès", role: "toi", texte: "alors", approx, ligne: 0, ...dans });
      messages.push({ id: "", t: approx === "jour" ? t : t + 4 * MIN, nom: "Lucas", role: "autre", texte: "oui", approx, ligne: 0, ...dans });
    }
  }
  return messages;
}
/** Des morceaux réunis : rangés par date, renumérotés (comme reunir, src/server/morceaux.ts). */
const reunis = (...morceaux: Message[][]): Message[] =>
  morceaux
    .flat()
    .sort((a, b) => a.t - b.t)
    .map((m, i) => ({ ...m, id: `m${String(i + 1).padStart(4, "0")}`, ligne: i + 1 }));

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

describe("la chute sur une conv en morceaux, et les jours devinés (novembre 2026)", () => {
  it("une conv d’un seul morceau : les débuts de ses semaines se suivent de 7 en 7 jours, comme avant", () => {
    const t = tendance(
      conv(
        15 * 7,
        (j) => (j < 70 ? 40 : 15),
        (j) => (j < 70 ? 4 * MIN : 13 * MIN),
      ),
    )!;
    expect(t.debuts).toEqual(t.semaines.map((_, i) => new Date(Date.parse("2026-03-12") + (i - t.coupure) * 7 * J).toISOString().slice(0, 10)));
    expect(semaineDeLaCourbe(t, 0)).toBe(t.debuts![0]);
  });

  it("des captures photo ne comptent pas : ni après un export, ni avant, ni seules", () => {
    /* Un export, puis des captures photo clairsemées : un écran tous les cinq jours */
    const s1 = reunis(
      morceau(0, 0, 70, () => 6),
      morceau(1, 70, 35, (j) => (j % 5 ? 0 : 6), "heure"),
    );
    expect(tendance(s1, [true, false])).toBeNull();
    /* La fausse chute que ces captures feraient si elles comptaient */
    expect(tendance(s1, [true, true])).toMatchObject({ depuis: "2026-05-11" });
    /* Des captures photo d’avant un export qui a sa chute : la même chute que l’export seul */
    const exportSeul = morceau(undefined, 0, 84, (j) => (j < 56 ? 6 : 1));
    const s3b = reunis(
      morceau(0, 0, 84, (j) => (j < 56 ? 6 : 1)),
      morceau(1, -25, 11, (j) => (j % 5 ? 0 : 12), "heure"),
    );
    expect(tendance(s3b, [true, false])).toEqual(tendance(exportSeul));
    expect(tendance(exportSeul)).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 1 });
    /* Des captures photo seules ; la même chose filmée (une vidéo) garde sa chute */
    const s4 = morceau(undefined, 0, 84, (j) => (j % 4 ? 0 : j < 56 ? 20 : 4), "heure");
    expect(tendance(s4, [false])).toBeNull();
    expect(tendance(s4, [true])).toMatchObject({ depuis: "2026-04-27", avant: 5, apres: 1.1 });
  });

  it("un trou entre deux morceaux n’est pas un silence : seuls leurs jours couverts comptent", () => {
    /* Deux exports, quatre semaines de trou entre eux : pas de chute */
    const s2 = reunis(
      morceau(0, 0, 56, () => 6),
      morceau(1, 84, 21, () => 4),
    );
    expect(tendance(s2, [true, true])).toBeNull();
    /* Les mêmes messages en un seul export, avec un vrai silence de quatre semaines */
    expect(
      tendance(
        reunis(
          morceau(undefined, 0, 56, () => 6),
          morceau(undefined, 84, 21, () => 4),
        ),
      ),
    ).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 1.7 });
    /* Une vraie baisse vue après le trou : la chute date de sa sortie, et la courbe saute le trou */
    const t = tendance(
      reunis(
        morceau(0, 0, 56, () => 6),
        morceau(1, 84, 28, () => 2),
      ),
      [true, true],
    )!;
    expect(t).toMatchObject({ depuis: "2026-05-25", avant: 6, apres: 2, coupure: 8 });
    expect(t.semaines).toHaveLength(12);
    expect([t.debuts![7], t.debuts![8]]).toEqual(["2026-04-20", "2026-05-25"]);
    expect([semaineDeLaCourbe(t, 0), semaineDeLaCourbe(t, 11)]).toEqual(["2026-03-02", "2026-06-15"]);
    expect(
      tendance(
        reunis(
          morceau(0, 0, 28, () => 6),
          morceau(1, 56, 84, (j) => (j < 42 ? 6 : 1)),
        ),
        [true, true],
      ),
    ).toMatchObject({ depuis: "2026-06-08", avant: 6, apres: 1 });
    /* Deux exports collés : la chute d’un seul */
    expect(
      tendance(
        reunis(
          morceau(0, 0, 56, () => 6),
          morceau(1, 56, 28, () => 2),
        ),
        [true, true],
      ),
    ).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 2 });
  });

  it("une semaine que les morceaux couvrent moins de 3 jours sort du calcul", () => {
    /* La semaine du 18 mai : couverte 2 jours (les 23 et 24 mai), puis 3 (du 22 au 24 mai), où la chute commence */
    for (const [debut, depuis, n] of [
      [82, "2026-05-25", 12],
      [81, "2026-05-22", 13],
    ] as const) {
      const t = tendance(
        reunis(
          morceau(0, 0, 56, () => 6),
          morceau(1, debut, 112 - debut, () => 2),
        ),
        [true, true],
      );
      expect(t).toMatchObject({ depuis, avant: 6, apres: 2 });
      expect(t!.semaines).toHaveLength(n);
    }
  });

  it("la courbe d’une tendance sans débuts (les exemples de la galerie) : de 7 en 7 jours depuis la chute", () => {
    expect(semaineDeLaCourbe({ depuis: "2026-03-12", avant: 40, apres: 15, semaines: [40, 40, 15], coupure: 2, delai: null } satisfies TendanceDuPaywall, 0)).toBe("2026-02-26");
  });

  it("un repère sans heure compte le jour de son repère ; un jour deviné ne compte pas, ni un jour que la réunion a changé", () => {
    const jourSeul = morceau(undefined, 0, 84, (j) => (j < 56 ? 6 : 1), "jour");
    const a21h = morceau(undefined, 0, 84, (j) => (j < 56 ? 6 : 1), "heure");
    expect(tendance(jourSeul)).toEqual(tendance(a21h));
    expect(tendance(jourSeul)).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 1 });
    /* Un haut de 150 messages emprunté au premier repère : la fausse chute qu’il ferait s’il était compté */
    const stable = morceau(undefined, 0, 84, () => 4, "jour");
    const haut = Array.from({ length: 150 }, (_, i): Message => ({
      id: "",
      t: JOUR_0,
      nom: i % 2 ? "Lucas" : "Inès",
      role: i % 2 ? "autre" : "toi",
      texte: "haut",
      approx: "jour",
      ligne: 0,
    }));
    expect(
      tendance(
        reunis(
          haut.map((m) => ({ ...m, jourDevine: "auPlusTard" as const })),
          stable,
        ),
      ),
    ).toBeNull();
    expect(tendance(reunis(haut, stable))).toMatchObject({ depuis: "2026-03-30" });
    expect(tendance(jourSeul.map((m) => ({ ...m, jourDevine: "inconnu" as const })))).toBeNull();
    /* L’heure lue sur la capture (tLu) : le même jour, rien ne change ; un autre jour (celui d’une ancre), le message ne compte pas */
    expect(tendance(jourSeul.map((m) => ({ ...m, tLu: m.t + 20 * H })))).toEqual(tendance(jourSeul));
    expect(tendance(jourSeul.map((m) => ({ ...m, tLu: m.t + 3 * J })))).toBeNull();
  });

  it("lus d’un texte de captures : sans heure, la même chute qu’à 21 h ; un haut sans date n’en fait pas", () => {
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const video = (heure: string | null, haut = 0, parJour: (k: number) => number = (k) => (k < 56 ? 6 : 1)) =>
      lire(
        versTexteCaptures(
          captures({
            appli: "whatsapp",
            autre: "Léa",
            blocs: [
              ...(haut ? [{ repere: null, messages: Array.from({ length: haut }, (_, i) => msg(i % 2 ? "autre" : "moi", `haut ${i}`)) }] : []),
              ...Array.from({ length: 84 }, (_, k) => ({
                repere: { date: iso(JOUR_0 + k * J), heure },
                messages: [msg("moi", `jour ${k} toi`), ...Array.from({ length: parJour(k) }, (_, i) => msg("autre", `jour ${k} elle ${i}`))],
              })),
            ],
          }),
          { aujourdhui: "2026-10-31" },
        ).texte,
        { utilisateur: { prenom: "Inès", pronom: "elle", nomExport: "Moi" }, autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" }, format: "captures" },
      ).messages;
    expect(tendance(video(null))).toEqual(tendance(video("21:00")));
    expect(tendance(video(null))).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 1 });
    expect(tendance(video(null, 150, () => 4))).toBeNull();
  });

  it("les morceaux que la tendance compte, lus dans la meta : un export, une vidéo (même d’avant le 2 novembre), pas des photos", () => {
    expect(morceauxContinus({})).toEqual([true]);
    expect(morceauxContinus({ captures: 12 })).toEqual([false]);
    expect(morceauxContinus({ captures: 12, video: true })).toEqual([true]);
    /* Plus que CAPTURES_MAX : une vidéo importée avant le 2 novembre, qui ne le disait pas */
    expect(morceauxContinus({ captures: 20 })).toEqual([false]);
    expect(morceauxContinus({ captures: 21 })).toEqual([true]);
    expect(morceauxContinus({ captures: 14, suiteVideo: true })).toEqual([true]);
    /* Une conv réunie : ses morceaux seuls décident */
    expect(morceauxContinus({ captures: 30, video: true, morceaux: [{}, { captures: 8 }, { captures: 40 }, { captures: 6, video: true }] })).toEqual([true, false, true, true]);
  });
});

/** Un export de Tom et Léa, `jours` jours depuis JOUR_0 : `parJour(d)` échanges par jour, des textes qu’on ne retrouve qu’une fois. */
function exportTomLea(jours: number, parJour: (d: number) => number): Message[] {
  const messages: Message[] = [];
  for (let d = 0; d < jours; d++)
    for (let i = 0; i < parJour(d); i++) {
      const t = JOUR_0 + d * J + 9 * H + i * 20 * MIN;
      messages.push({ id: "", t, nom: "Tom", role: "toi", texte: `tu fais quoi ce soir numéro ${d} ${i}`, approx: false, ligne: 0 });
      messages.push({ id: "", t: t + 4 * MIN, nom: "Léa", role: "autre", texte: `je regarde une série numéro ${d} ${i}`, approx: false, ligne: 0 });
    }
  return messages.map((m, i) => ({ ...m, ligne: i + 1 }));
}

/** Une vidéo où l’on ne voit aucune date (l’en-tête le dit : ses messages sont « inconnu »), lue comme à l’import, Tom en « Moi ». */
function videoSansDate(messages: ReturnType<typeof msg>[]): Message[] {
  const t = versTexteCaptures(captures({ appli: "whatsapp", autre: "Léa", blocs: [{ repere: null, messages }] }), { aujourdhui: "2026-07-01" });
  return lire(t.texte, { utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Moi" }, autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" }, format: "captures" }).messages;
}
/** Les échanges de l’export repris par une vidéo : les mêmes textes, de Tom (« moi ») et de Léa. */
const reprisDe = (jours: number[]) => jours.flatMap((d) => [msg("moi", `tu fais quoi ce soir numéro ${d} 0`), msg("autre", `je regarde une série numéro ${d} 0`)]);
/** Des échanges neufs d’une vidéo, `n` de chaque côté. */
const neufs = (n: number) => Array.from({ length: n }, (_, k) => [msg("moi", `on se voit quand alors ${k}`), msg("autre", `pas cette semaine désolée ${k}`)]).flat();

describe("une vidéo sans date réunie à un export (src/server/morceaux.ts, reunir) : ses messages ne datent pas la chute", () => {
  it("la suite d’un export : rangée après ses derniers messages, restée sans date, elle laisse la chute de l’export telle quelle", () => {
    const exp = exportTomLea(84, (d) => (d < 56 ? 6 : 1));
    const video = videoSansDate([...reprisDe([82, 83]), ...neufs(60)]);
    expect(video.every((m) => m.jourDevine === "inconnu")).toBe(true);
    const r = reunir([
      { messages: exp, exact: true },
      { messages: video, exact: false },
    ]);
    expect(r).toMatchObject({ doublons: 4, gardes: [exp.length, 120] });
    expect(r.messages.filter((m) => m.morceau === 1).every((m) => m.jourDevine === "inconnu")).toBe(true);
    expect(tendance(exp)).toMatchObject({ depuis: "2026-04-27", avant: 6, apres: 1 });
    expect(tendance(r.messages, [true, true])).toEqual(tendance(exp));
  });

  it("le début d’un export stable : rangés avant son premier message, ses 1 000 messages plus anciens ne font pas une fausse chute", () => {
    const exp = exportTomLea(70, () => 6);
    const r = reunir([
      { messages: exp, exact: true },
      { messages: videoSansDate([...neufs(500), ...reprisDe([0, 1])]), exact: false },
    ]);
    expect(r).toMatchObject({ doublons: 4, gardes: [exp.length, 1000] });
    expect(r.messages.filter((m) => m.morceau === 1).every((m) => m.jourDevine === "auPlusTard")).toBe(true);
    expect(tendance(exp)).toBeNull();
    expect(tendance(r.messages, [true, true])).toBeNull();
    /* La fausse chute qu’ils feraient comptés au jour de leur ancre (sans jourDevine ni tLu) : « depuis le 30 mars » */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- écartés : ce qui les écarte de la tendance
    const auJourDeLAncre = r.messages.map(({ jourDevine, tLu, ...m }) => m);
    expect(tendance(auJourDeLAncre, [true, true])).toMatchObject({ depuis: "2026-03-30" });
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

/** Des messages lus sur des captures (l’heure approximative) : `n` de chaque côté, dont `q` avec une question. */
function lusSurCaptures(toi: { n: number; q: number }, autre: { n: number; q: number }): Message[] {
  const cote = (role: "toi" | "autre", nom: string, { n, q }: { n: number; q: number }) =>
    Array.from({ length: n }, (_, k): Message => ({ id: "", t: 0, nom, role, texte: k < q ? "tu fais quoi ce soir ?" : "ok", approx: "heure", ligne: 0 }));
  return [...cote("toi", "Inès", toi), ...cote("autre", "Lucas", autre)].map((m, i) => ({ ...m, id: `m${String(i + 1).padStart(4, "0")}`, ligne: i + 1 }));
}

/** Les chiffres d’une conv lue sur des captures : ni ouvertures, ni reprises, ni relances, ni délais. */
const sansHeures = (autres: Partial<Chiffres> = {}) =>
  chiffres({ ouvre: { toi: 0, autre: 0 }, reprend: { toi: 0, autre: 0 }, relance: { toi: 0, autre: 0 }, delai: { toi: null, autre: null }, ...autres });

const v = (id: SignalDuPaywall["id"], cote: SignalDuPaywall["cote"], toi: number, elle: number): SignalDuPaywall => ({ id, cote, toi, elle });
/** Le haut d’une conv lue sur des captures, d’après ce qui se compte sans heures. */
const volume = (liste: SignalDuPaywall[]): ApercuDuPaywall => ({ signaux: signaux(sansHeures()), tendance: null, sansHeures: liste });

describe("sans l’heure des messages : ce qui se compte quand même", () => {
  it("qui écrit le plus (1,5 fois), qui pose les questions (3 au moins, 2 fois plus), qui écrit le plus long (1,8 fois)", () => {
    const c = sansHeures({ total: { toi: 44, autre: 22 }, motsMoyens: { toi: 6, autre: 13 } });
    expect(signauxSansHeures(c, lusSurCaptures({ n: 44, q: 6 }, { n: 22, q: 2 }))?.map((x) => [x.id, x.cote, x.toi, x.elle])).toEqual([
      ["messages", "toi", 44, 22],
      ["questions", "toi", 6, 2],
      ["longueur", "elle", 6, 13],
    ]);
  });

  it("sous les seuils : pareil (1,4 fois plus de messages, 2 questions contre 0, 4 contre 3)", () => {
    const pareils = (q: [number, number]) =>
      signauxSansHeures(sansHeures({ total: { toi: 28, autre: 20 } }), lusSurCaptures({ n: 28, q: q[0] }, { n: 20, q: q[1] }))!.filter((x) => x.cote !== "pareil");
    expect(pareils([2, 0])).toEqual([]);
    expect(pareils([4, 3])).toEqual([]);
    expect(pareils([3, 0]).map((x) => x.id)).toEqual(["questions"]);
  });

  it("trop peu pour en dire quelque chose : moins de 10 messages, ou un côté presque muet", () => {
    expect(signauxSansHeures(sansHeures({ total: { toi: 6, autre: 3 } }), lusSurCaptures({ n: 6, q: 0 }, { n: 3, q: 0 }))).toBeNull();
    expect(signauxSansHeures(sansHeures({ total: { toi: 30, autre: 1 } }), lusSurCaptures({ n: 30, q: 0 }, { n: 1, q: 0 }))).toBeNull();
  });

  it("le titre « volume » quand les cinq autres n’ont pas assez de chiffres ; sans assez de messages, le titre d’avant", () => {
    expect(genreDuHaut(volume([v("messages", "toi", 44, 22), v("questions", "pareil", 1, 1)]))).toBe("volume");
    expect(genreDuHaut(volume([v("messages", "pareil", 31, 35), v("questions", "pareil", 4, 5)]))).toBe("volume");
    expect(genreDuHaut({ ...volume([]), sansHeures: undefined })).toBe("aucun");
    /* Les cinq titres passent avant : une conv à égalité le reste */
    expect(genreDuHaut({ ...apercu(), sansHeures: [v("messages", "toi", 44, 22)] })).toBe("egalite");
  });
});

describe("les textes du titre « volume »", () => {
  it("tu écris plus, lui plus long : son écart en rose, « Mais » avant", () => {
    const h = hautDuPaywall(volume([v("messages", "toi", 44, 22), v("questions", "toi", 6, 2), v("longueur", "elle", 6, 13)]), LUCAS);
    expect(h.genre).toBe("volume");
    expect(h.titre).toEqual(["Tu lui envoies 2 fois plus de messages.", "Lucas, lui, écrit plus long."]);
    expect(h.sous).toBe("Tu lui envoies 2 fois plus de messages\u00a0: 44 contre 22. Tu poses 3 fois plus de questions que lui. Mais Lucas écrit 2 fois plus long que toi.");
    expect(h.question).toBe("BLUSH t’écrit ce que ça dit de lui");
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["2× tu lui écris plus", "2× il écrit plus long"]);
    expect(h.carte?.lignes.map((l) => [l.label, l.toi.n, l.elle.n, l.cote])).toEqual([
      ["Envoie le plus de messages", "44", "22", "toi"],
      ["Pose les questions", "6", "2", "toi"],
      ["Écrit le plus long", "6", "13", "elle"],
    ]);
  });

  it("tout vient de toi : « Lucas, lui, répond », et les questions qu’il ne pose jamais", () => {
    const h = hautDuPaywall(volume([v("messages", "toi", 44, 22), v("questions", "toi", 9, 0)]), LUCAS);
    expect(h.titre).toEqual(["Tu lui envoies 2 fois plus de messages.", "Lucas, lui, répond."]);
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["2× tu lui écris plus", "9\u00a0questions de toi, aucune de lui"]);
  });

  it("tout vient d’elle, au féminin : « Toi, tu la laisses venir », sans arrondir 2,3 à 2", () => {
    const h = hautDuPaywall(volume([v("messages", "elle", 20, 46), v("questions", "elle", 0, 7)]), LEA);
    expect(h.titre).toEqual(["Léa t’envoie 2,3 fois plus de messages.", "Toi, tu la laisses venir."]);
    expect(h.sous).toBe("Léa t’envoie 2,3 fois plus de messages que toi\u00a0: 46 contre 20. Léa te pose 7 questions, toi aucune.");
    expect(h.question).toBe("BLUSH t’écrit ce qu’elle attend de toi");
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["2,3× elle t’écrit plus", "7\u00a0questions d’elle, aucune de toi"]);
  });

  it("autant l’un que l’autre : leurs chiffres, et ce qui se joue ailleurs, en nommant l’autre", () => {
    const h = hautDuPaywall(volume([v("messages", "pareil", 31, 35), v("questions", "pareil", 4, 5), v("longueur", "pareil", 9, 11)]), LUCAS);
    expect(h.titre).toEqual(["Lucas et toi, vous vous écrivez autant.", "Ce qui se joue est ailleurs."]);
    expect(h.sous).toBe("Personne ne court après l’autre\u00a0: 31 messages pour toi, 35 pour lui.");
    expect(h.cases.map((c) => `${c.valeur} ${c.texte}`)).toEqual(["31–35 messages envoyés", "4–5 questions posées"]);
  });

  it("une seule question posée, côté questions : la seconde case compte les messages", () => {
    const h = hautDuPaywall(volume([v("messages", "pareil", 30, 28), v("questions", "elle", 0, 5)]), LUCAS);
    expect(h.titre).toEqual(["C’est Lucas qui pose toutes les questions.", "Toi, tu le laisses venir."]);
    expect(h.cases.map((c) => `${c.valeur}${c.unite} ${c.texte}`)).toEqual(["5\u00a0questions de lui, aucune de toi", "30–28 messages envoyés"]);
  });
});
