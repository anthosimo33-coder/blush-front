import { describe, expect, it } from "vitest";
import type { BlushAnswer } from "@/types";
import {
  annonceAnciens,
  annonceDe,
  CLE_INTRO,
  CLE_JOUR_INTRO,
  cleBulle,
  cleDeBulle,
  clock,
  dayLabel,
  dayStart,
  depli,
  echangeDe,
  echangesEnMsgs,
  ID_INTRO,
  idHistorique,
  introDe,
  maintenantDe,
  origineDe,
  PREMIER_ID_VISITE,
  questionDe,
  rangDansLEchange,
  rowsOf,
  tapeEncore,
  timeOf,
  typeInconnu,
  type Msg,
  type Row,
} from "@/app/app/accueil/conv/modele";

/*
 * Le modèle de la conv de l’accueil (src/app/app/accueil/conv/modele.ts) : d’où viennent les identifiants, l’historique
 * mis en messages, les heures et les jours, les lignes de la conv. Les dates s’écrivent à l’heure locale (new Date(a, m, j, h)) :
 * la conv compte les jours à l’heure du téléphone, le test passe dans tous les fuseaux.
 */

const reponse = (texte: string, plus: Partial<BlushAnswer> = {}): BlushAnswer => ({ kind: "bubbles", bubbles: [{ text: texte }], ...plus });
const le = (j: number, h = 12, min = 0) => new Date(2026, 9, j, h, min).getTime();
/* Dimanche 11 octobre 2026, 9 h : l’ouverture de l’accueil */
const OUVERT = le(11, 9);

/** Les lignes, réduites à ce qui se lit : la date (son heure), le niveau, ou le groupe (son expéditeur et ses messages). */
const lu = (rows: Row[]) =>
  rows.map((r) => (r.kind === "day" ? `jour ${r.key}` : r.kind === "event" ? `niveau ${r.key}` : `${r.from} ${r.key} [${r.msgs.map((x) => x.m.id).join(", ")}]`));

describe("les identifiants", () => {
  it("l’historique : ton message, puis la réponse de BLUSH, et leur échange se relit", () => {
    expect(idHistorique(10, false)).toBe(-1_000_020);
    expect(idHistorique(10, true)).toBe(-1_000_021);
    expect([echangeDe(idHistorique(10, false)), echangeDe(idHistorique(10, true))]).toEqual([10, 10]);
    expect([rangDansLEchange(idHistorique(10, false)), rangDansLEchange(idHistorique(10, true))]).toEqual([0, 1]);
  });

  it("chaque message dit d’où il vient : l’intro, l’aperçu, l’historique, la visite", () => {
    expect([ID_INTRO.next, ID_INTRO.hint].map(origineDe)).toEqual(["intro", "intro"]);
    expect([-100, -101, -2_000, -999_999].map(origineDe)).toEqual(["apercu", "apercu", "apercu", "apercu"]);
    expect([-1_000_000, idHistorique(1, false), idHistorique(1, true), idHistorique(987_654, true)].map(origineDe)).toEqual([
      "historique",
      "historique",
      "historique",
      "historique",
    ]);
    expect([PREMIER_ID_VISITE, 2, 40].map(origineDe)).toEqual(["visite", "visite", "visite"]);
  });

  it("entre les origines, rien n’est attribué : ni 0, ni −3 à −99", () => {
    expect(PREMIER_ID_VISITE).toBe(1);
    expect([0, -3, -50, -99].map(origineDe)).toEqual([null, null, null, null]);
  });

  it("dans la visite, ta question précède « BLUSH écrit » (puis sa réponse)", () => {
    expect(questionDe(PREMIER_ID_VISITE + 1)).toBe(PREMIER_ID_VISITE);
    expect(questionDe(8)).toBe(7);
  });

  it("les clés des bulles et des lignes de l’intro", () => {
    expect([cleBulle(5, 0), cleBulle(5, 3), cleBulle(5, "ecrit")]).toEqual(["5-0", "5-3", "5-ecrit"]);
    const rows = rowsOf(introDe(le(9, 20)), OUVERT, 1);
    expect(rows.map((r) => r.key)).toEqual([CLE_JOUR_INTRO, CLE_INTRO]);
  });

  it("la clé d’un groupe est celle de sa première bulle, pour chaque type de message", () => {
    const ecrit = { type: "ecrit", id: 9, from: "blush", reading: "BLUSH analyse sa réponse" } as const;
    const unDeChaque: Msg[] = [
      ...introDe(),
      ecrit,
      { ...ecrit, recues: [{ text: "attends" }] },
      { ...ecrit, coupee: true },
      { type: "reponse", id: 9, from: "blush", result: reponse("ok") },
      { type: "mot", id: 9, from: "blush", notice: "Je n’ai rien entendu." },
      { type: "texte", id: 9, from: "toi", text: "et là ?" },
      { type: "images", id: 9, from: "toi", images: ["blob:1"] },
      { type: "fichier", id: 9, from: "toi", file: { name: "export.txt", size: 12 } },
      { type: "vocal", id: 9, from: "toi", voice: { url: "blob:2", seconds: 3, peaks: [1] } },
    ];
    for (const m of unDeChaque) {
      const groupe = rowsOf([m], OUVERT, 1).find((r) => r.kind === "group");
      expect(groupe?.key).toBe(cleDeBulle(m, 0));
    }
    /* « BLUSH écrit » qui tape : sa seule bulle a sa clé à elle ; dès qu’une bulle arrive, les clés reprennent leur rang */
    expect(cleDeBulle(ecrit, 0)).toBe("9-ecrit");
    expect([0, 1].map((k) => cleDeBulle({ ...ecrit, recues: [{ text: "a" }, { text: "b" }] }, k))).toEqual(["9-0", "9-1"]);
  });

  it("un type de message inconnu : l’erreur ne dit que son type, jamais son contenu", () => {
    const inconnu = { type: "carte", id: 3, from: "toi", text: "ce qu’elle m’a écrit" };
    /* Tout le message d’erreur : le type, et rien du texte */
    expect(() => typeInconnu(inconnu as never)).toThrow(/^Message de la conv d’un type inconnu \(carte\)$/);
  });
});

describe("l’historique et l’intro, en messages", () => {
  it("back-end : les identifiants viennent de l’échange (stables d’un chargement à l’autre), avec les vraies heures", () => {
    const script = [
      { id: 12, mine: "il m’a vue", answer: reponse("pas mal"), at: le(10, 18) },
      { id: 14, answer: reponse("et alors"), at: le(10, 19) },
    ];
    const msgs = echangesEnMsgs(script);
    expect(msgs.map((m) => [m.type, m.id, m.at])).toEqual([
      ["texte", idHistorique(12, false), le(10, 18)],
      ["reponse", idHistorique(12, true), le(10, 18) + 1000],
      ["reponse", idHistorique(14, true), le(10, 19) + 1000],
    ]);
    /* La réponse sait son échange (de quoi la partager en image) */
    expect(msgs.flatMap((m) => (m.type === "reponse" ? [m.result.echange] : []))).toEqual([12, 14]);
    expect(echangesEnMsgs(script).map((m) => m.id)).toEqual(msgs.map((m) => m.id));
  });

  it("l’aperçu : des échanges sans identifiant, posés hier soir à partir de 22 h", () => {
    const answer = reponse("vas-y");
    const msgs = echangesEnMsgs([
      { mine: "je lui écris ?", answer },
      { mine: "et maintenant ?", answer },
    ]);
    expect(msgs.map((m) => [m.type, m.id, origineDe(m.id), m.seed])).toEqual([
      ["texte", -100, "apercu", { day: -1, h: 22, m: 0 }],
      ["reponse", -101, "apercu", { day: -1, h: 22, m: 1 }],
      ["texte", -102, "apercu", { day: -1, h: 22, m: 2 }],
      ["reponse", -103, "apercu", { day: -1, h: 22, m: 3 }],
    ]);
    expect(msgs[1]!.type === "reponse" && msgs[1]!.result).toBe(answer);
  });

  it("l’intro : à la fin de la lecture (puis une minute après), ou hier soir sans cette heure", () => {
    expect(introDe(le(9, 20)).map((m) => [m.type, m.id, m.at])).toEqual([
      ["intro", ID_INTRO.next, le(9, 20)],
      ["intro", ID_INTRO.hint, le(9, 20) + 60_000],
    ]);
    expect(introDe().map((m) => m.seed)).toEqual([
      { day: -1, h: 21, m: 40 },
      { day: -1, h: 21, m: 41 },
    ]);
  });
});

describe("les heures et les jours", () => {
  it("l’heure d’un message : rien au rendu serveur, sa vraie heure, ou son moment posé par rapport à l’ouverture", () => {
    expect(timeOf({ at: le(10, 18) }, null)).toBeNull();
    expect(timeOf({ at: le(10, 18), seed: { day: -1, h: 22, m: 2 } }, OUVERT)).toBe(le(10, 18));
    expect(timeOf({}, OUVERT)).toBeNull();
    expect(timeOf({ seed: { day: -1, h: 22, m: 2 } }, OUVERT)).toBe(le(10, 22, 2));
    /* La veille du 1er octobre : le 30 septembre */
    expect(timeOf({ seed: { day: -1, h: 21, m: 40 } }, le(1, 9))).toBe(new Date(2026, 8, 30, 21, 40).getTime());
  });

  it("minuit du jour, et l’heure", () => {
    expect(dayStart(le(11, 23, 59))).toBe(new Date(2026, 9, 11).getTime());
    expect(clock(le(11, 9, 5))).toBe("09:05");
  });

  it("la date d’un nouveau jour : aujourd’hui, hier, le jour de la semaine, puis la date", () => {
    expect(dayLabel(le(11, 0, 1), OUVERT)).toBe("Aujourd’hui");
    /* Un message plus récent que « maintenant » reste d’aujourd’hui */
    expect(dayLabel(le(11, 23), OUVERT)).toBe("Aujourd’hui");
    expect(dayLabel(le(10, 23, 59), OUVERT)).toBe("Hier");
    expect(dayLabel(le(9, 20), OUVERT)).toBe("Vendredi");
    expect(dayLabel(le(5, 8), OUVERT)).toBe("Lundi");
    expect(dayLabel(le(4, 22), OUVERT)).toBe("dim. 4 oct.");
    expect(dayLabel(new Date(2026, 8, 20, 12).getTime(), OUVERT)).toBe("dim. 20 sept.");
    /* Le changement d’heure (25 octobre) : un jour de 25 h reste un jour */
    expect(dayLabel(le(25, 10), le(26, 9))).toBe("Hier");
  });

  it("« Aujourd’hui » se compte depuis le message le plus récent : une conv ouverte avant minuit reste juste", () => {
    const rows = rowsOf([{ type: "texte", id: 1, from: "toi", text: "t’es là ?", at: le(12, 0, 5) }], le(11, 23, 50), 1);
    expect(maintenantDe(rows, le(11, 23, 50))).toBe(le(12, 0, 5));
    expect(maintenantDe(rows, le(12, 8))).toBe(le(12, 8));
    expect(maintenantDe(rowsOf(introDe(), null, 1), null)).toBe(0);
  });
});

describe("les lignes de la conv (rowsOf)", () => {
  /* L’intro (vendredi soir), deux échanges de l’historique (samedi), puis la visite (dimanche) : ton message, BLUSH écrit */
  const conv: Msg[] = [
    ...introDe(le(9, 20)),
    ...echangesEnMsgs([
      { id: 5, mine: "il a liké", answer: reponse("bon signe"), at: le(10, 18) },
      { id: 6, mine: "je réponds quoi ?", answer: reponse("rien pour l’instant"), at: le(10, 18, 5) },
    ]),
    { type: "texte", id: 1, from: "toi", text: "il m’a écrit", at: le(11, 8, 55) },
    { type: "ecrit", id: 2, from: "blush", reading: "BLUSH analyse sa réponse", at: le(11, 8, 55) },
  ];

  it("dans l’ordre : une date à chaque nouveau jour, les messages groupés par expéditeur", () => {
    expect(lu(rowsOf(conv, OUVERT, 1))).toEqual([
      `jour ${CLE_JOUR_INTRO}`,
      `blush ${CLE_INTRO} [-2, -1]`,
      `jour jour-${idHistorique(5, false)}`,
      `toi ${idHistorique(5, false)}-0 [${idHistorique(5, false)}]`,
      `blush ${idHistorique(5, true)}-0 [${idHistorique(5, true)}]`,
      `toi ${idHistorique(6, false)}-0 [${idHistorique(6, false)}]`,
      `blush ${idHistorique(6, true)}-0 [${idHistorique(6, true)}]`,
      "jour jour-1",
      "toi 1-0 [1]",
      /* « BLUSH écrit » a sa propre clé : à la réponse, le groupe repart de zéro */
      "blush 2-ecrit [2]",
    ]);
  });

  it("un groupe : l’heure de son dernier message, l’échange de sa dernière réponse ; la date, l’heure de son premier", () => {
    const rows = rowsOf(conv, OUVERT, 1);
    expect(rows.map((r) => (r.kind === "event" ? null : r.at))).toEqual([
      le(9, 20),
      le(9, 20) + 60_000,
      le(10, 18),
      le(10, 18),
      le(10, 18) + 1000,
      le(10, 18, 5),
      le(10, 18, 5) + 1000,
      le(11, 8, 55),
      le(11, 8, 55),
      le(11, 8, 55),
    ]);
    expect(rows.flatMap((r) => (r.kind === "group" ? [r.echange] : []))).toEqual([undefined, undefined, 5, undefined, 6, undefined, undefined]);
    /* Deux réponses à la suite (l’aperçu sans tes messages) et un mot de BLUSH : un seul groupe, l’échange de la dernière réponse */
    const suite = rowsOf(
      [
        ...echangesEnMsgs([
          { id: 7, answer: reponse("a"), at: le(10, 9) },
          { id: 8, answer: reponse("b"), at: le(10, 10) },
        ]),
        { type: "mot", id: 3, from: "blush", notice: "Je n’ai rien entendu.", at: le(10, 11) },
      ],
      OUVERT,
      1,
    );
    expect(lu(suite)).toEqual([`jour jour-${idHistorique(7, true)}`, `blush ${idHistorique(7, true)}-0 [${idHistorique(7, true)}, ${idHistorique(8, true)}, 3]`]);
    expect(suite[1]!.kind === "group" && [suite[1]!.at, suite[1]!.echange]).toEqual([le(10, 11), 8]);
 
    /* Une réponse verrouillée (écrite à 0 bulle) ne se partage pas : son groupe n’a pas d’échange */
    const verrou = rowsOf(echangesEnMsgs([{ id: 9, answer: { kind: "bubbles", bubbles: [], verrouillee: { message: 19, cout: 1 } }, at: le(10, 12) }]), OUVERT, 1);
    expect(verrou.flatMap((r) => (r.kind === "group" ? [r.echange] : []))).toEqual([undefined]);
  });

  it("un niveau franchi coupe le groupe, sans date ni heure à lui ; il fait son entrée s’il est de la visite", () => {
    const rows = rowsOf(
      [
        { type: "reponse", id: 3, from: "blush", result: reponse("ok"), at: le(11, 9) },
        { type: "niveau", id: 4, from: "event", level: "voit" },
        { type: "mot", id: 5, from: "blush", notice: "Bien joué.", at: le(11, 9, 1) },
      ],
      OUVERT,
      4,
    );
    expect(lu(rows)).toEqual(["jour jour-3", "blush 3-0 [3]", "niveau niveau-4", "blush 5-0 [5]"]);
    expect(rows[2]).toEqual({ kind: "event", key: "niveau-4", level: "voit", neuf: true });
    expect(rowsOf([{ type: "niveau", id: 4, from: "event", level: "voit" }], OUVERT, 9)[0]).toMatchObject({ neuf: false });
  });

  it("ce qui fait son entrée : les messages de la visite (`neuf`), et les réponses qui viennent d’arriver (`fresh`)", () => {
    const rows = rowsOf(
      [
        { type: "reponse", id: 3, from: "blush", result: reponse("déjà lue"), at: le(11, 8), answered: true },
        { type: "texte", id: 4, from: "toi", text: "et là ?", at: le(11, 8, 1) },
        { type: "reponse", id: 5, from: "blush", result: reponse("tout juste"), at: le(11, 8, 2), answered: true },
        { type: "reponse", id: 6, from: "blush", result: reponse("posée"), at: le(11, 8, 3) },
      ],
      OUVERT,
      4,
    );
    expect(rows.flatMap((r) => (r.kind === "group" ? r.msgs.map(({ m, neuf, fresh }) => [m.id, neuf, fresh]) : []))).toEqual([
      [3, false, false],
      [4, true, false],
      [5, true, true],
      [6, true, false],
    ]);
  });

  it("au rendu serveur (pas d’heure) : une seule date, vide, et des groupes sans heure", () => {
    const rows = rowsOf(conv, null, 1);
    expect(rows.filter((r) => r.kind === "day")).toEqual([{ kind: "day", key: CLE_JOUR_INTRO, at: null }]);
    expect(rows.every((r) => r.kind === "event" || r.at === null)).toBe(true);
  });

  it("BLUSH écrit : sa bulle qui tape tant que rien n’est arrivé ; ses bulles reçues, ou la coupure, prennent la clé de la première bulle", () => {
    const ecrit = { type: "ecrit", id: 2, from: "blush", reading: "BLUSH analyse sa réponse" } as const;
    expect([tapeEncore(ecrit), tapeEncore({ ...ecrit, recues: [] }), tapeEncore({ ...ecrit, recues: [{ text: "attends" }] }), tapeEncore({ ...ecrit, coupee: true })]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(tapeEncore({ type: "reponse", id: 2, from: "blush", result: reponse("ok") })).toBe(false);
    expect(rowsOf([{ ...ecrit, recues: [{ text: "attends" }], at: le(11, 9) }], OUVERT, 1)[1]!.key).toBe("2-0");
  });
});

describe("le dépli d’une réponse (5)", () => {
  it("de la dernière bulle à la première, 0,12 s entre deux ; chaque arrivée au fil de l’eau se déplie à son tour", () => {
    expect([0, 1, 2].map((k) => depli(k, 3))).toEqual([0.24, 0.12, 0]);
    /* Deux bulles arrivées d’abord, puis deux autres : chaque arrivée finit sur sa dernière bulle */
    const d = [0, 1, 2, 3].map((k) => depli(k, 4, [0, 2]));
    expect(d.map((x) => Math.round(x * 100) / 100)).toEqual([0.12, 0, 0.12, 0]);
  });
});

describe("ce que les lecteurs d’écran entendent de la conv (annonceDe, la région role=status de l’accueil)", () => {
  const reponseDeBlush = (textes: string[], plus: Partial<Extract<Msg, { type: "reponse" }>["result"]> = {}): Msg => ({
    type: "reponse",
    id: 3,
    from: "blush",
    result: { kind: "bubbles", bubbles: textes.map((text) => ({ text })), ...plus },
  });

  it("la réponse de BLUSH, ses bulles à la suite", () => {
    expect(annonceDe(reponseDeBlush(["oui, elle a vu", "et elle réfléchit"]))).toBe("BLUSH a répondu\u00a0: oui, elle a vu et elle réfléchit");
  });

  it("une réponse verrouillée (écrite à 0 bulle) : prête, à lire une fois rechargé, sans rien d’elle", () => {
    expect(annonceDe(reponseDeBlush([], { verrouillee: { message: 9, cout: 1 } }))).toBe("Ta réponse est prête. Recharge tes bulles pour la lire.");
  });

  it("une longue réponse est coupée au dernier mot entier, avec des points de suspension", () => {
    const long = Array.from({ length: 80 }, (_, i) => `mot${i}`).join(" ");
    const annonce = annonceDe(reponseDeBlush([long]))!;
    expect(annonce.length).toBeLessThan(320);
    expect(annonce.endsWith("…")).toBe(true);
    expect(annonce).toMatch(/ mot\d+…$/);
  });

  it("une réponse en vocal, sa coupure (avec ou sans bulles reçues), et un mot de BLUSH", () => {
    expect(annonceDe(reponseDeBlush(["ok"], { vocalEnCours: true }))).toBe("BLUSH t’a répondu en vocal.");
    expect(annonceDe({ type: "ecrit", id: 4, from: "blush", reading: "BLUSH écrit", coupee: true, recues: [] })).toBe(
      "La réponse de BLUSH s’est coupée\u00a0: j’ai eu un bug, renvoie-moi ça. «\u00a0Réessayer\u00a0» la relance.",
    );
    expect(annonceDe({ type: "ecrit", id: 4, from: "blush", reading: "BLUSH écrit", coupee: true, recues: [{ text: "bon, écoute" }] })).toContain(
      "BLUSH a répondu\u00a0: bon, écoute",
    );
    expect(annonceDe({ type: "mot", id: 5, from: "blush", notice: "Je n’ai rien entendu." })).toBe("BLUSH\u00a0: Je n’ai rien entendu.");
  });

  it("rien pour un message à toi, BLUSH qui écrit encore, ou un repère ; et les messages plus anciens chargés", () => {
    expect(annonceDe({ type: "texte", id: 1, from: "toi", text: "allô" })).toBeNull();
    expect(annonceDe({ type: "ecrit", id: 2, from: "blush", reading: "BLUSH écrit" })).toBeNull();
    expect(annonceDe({ type: "niveau", id: 6, from: "event", level: "dit" })).toBeNull();
    expect(annonceAnciens(1)).toBe("1 message plus ancien chargé");
    expect(annonceAnciens(12)).toBe("12 messages plus anciens chargés");
  });
});
