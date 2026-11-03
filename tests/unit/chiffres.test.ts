import { describe, expect, it } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";
import {
  blocChiffres,
  chiffrer,
  jourCompte,
  lire,
  recents as recentsDe,
  RECENT_J,
  SANS_REPONSE_H,
  SILENCE_REPRISE_H,
  SOIR,
  type Chiffres,
  type Format,
  type Message,
  type Recents,
} from "@prompts/lib/conv";
import type { Captures } from "@prompts/lib/schemas";
import { trouvailles } from "@/server/ecrans/trouvailles";
import { captures, msg } from "../aide/fabriques";

/*
 * Le bloc <chiffres> que reçoit le modèle (prompts/lib/conv.ts) : ce que le code a mesuré, le seul endroit d’où le
 * modèle tient un chiffre. Testé seul, sur des mesures écrites à la main (deux prénoms inventés) : chaque mesure a ses
 * propres nombres, sa ligne se reconnaît à eux (« Tom 12 · Inès 9 »), sans recopier le texte du bloc, privé. Puis les
 * mots qui reviennent et « Votre mot à vous » (les trouvailles), sur des convs inventées lues comme l’appli les lit.
 */
const chiffres = (autres: Partial<Chiffres> = {}): Chiffres => ({
  qui: { toi: "Tom", autre: "Inès" },
  total: { toi: 41, autre: 37 },
  medias: { toi: { vocal: 3, photo: 1 }, autre: {} },
  debut: "2026-08-20",
  fin: "2026-09-30",
  joursActifs: 23,
  ouvre: { toi: 12, autre: 9 },
  reprend: { toi: 6, autre: 2 },
  relance: { toi: 4, autre: 11 },
  delai: { toi: 5 * 60e3, autre: 2 * 3600e3 },
  soir: { toi: "38 %", autre: "61 %" },
  longueurs: [
    { mois: "2026-08", toi: 9, autre: 14, n: 30 },
    { mois: "2026-09", toi: 7, autre: "—", n: 48 },
  ],
  motsMoyens: { toi: 8, autre: 13 },
  recurrents: [
    ["ciné", 5],
    ["jeudi", 3],
  ],
  approx: 0,
  ...autres,
});
const recents = (autres: Partial<Recents> = {}): Recents => ({
  depuis: "2026-09-10",
  aujourdhui: "2026-10-01",
  n: 25,
  c: chiffres({
    total: { toi: 15, autre: 10 },
    ouvre: { toi: 8, autre: 1 },
    reprend: { toi: 21, autre: 22 },
    relance: { toi: 23, autre: 24 },
    delai: { toi: 17 * 60e3, autre: 26 * 60e3 },
    motsMoyens: { toi: 27, autre: 28 },
  }),
  derniers: { toi: { date: "2026-09-29", jours: 2 }, autre: { date: "2026-09-30", jours: 1 } },
  depuisSilence: { toi: 0, autre: 0 },
  ...autres,
});
const NB = 78;
const lignes = (bloc: string) => bloc.split("\n");
/** La place de la ligne d’une mesure, reconnue à sa fin (« … : Tom 12 · Inès 9 ») ; -1 si elle n’y est pas. */
const place = (bloc: string, fin: string) => lignes(bloc).findIndex((l) => l.endsWith(` : ${fin}`));

/* Les mesures de toute la conv, puis celles des trois dernières semaines, chacune à ses nombres */
const TOUTE_LA_CONV = {
  total: "Tom 41 · Inès 37",
  ouvre: "Tom 12 · Inès 9",
  reprend: "Tom 6 · Inès 2",
  relance: "Tom 4 · Inès 11",
  delai: "Tom 5 min · Inès 2,0 h",
  soir: "Tom 38 % · Inès 61 %",
};
const RECENTES = {
  total: "Tom 15 · Inès 10",
  ouvre: "Tom 8 · Inès 1",
  reprend: "Tom 21 · Inès 22",
  relance: "Tom 23 · Inès 24",
  delai: "Tom 17 min · Inès 26 min",
  mots: "Tom 27 · Inès 28",
};
const MESURES_DE_TEMPS = ["ouvre", "reprend", "relance", "delai", "soir"] as const;

describe("le bloc <chiffres>", () => {
  it("encadré par sa balise : toute la conv d’abord, chaque mesure à sa place, puis les trois dernières semaines et le dernier message", () => {
    const bloc = blocChiffres(chiffres(), NB, recents());
    const l = lignes(bloc);
    expect([l[0], l.at(-1)]).toEqual(["<chiffres>", "</chiffres>"]);
    expect(l[1]).toMatch(new RegExp(`\\b${NB}\\b.*2026-08-20.*2026-09-30.*\\b23\\b`));
    const ordre = [
      place(bloc, TOUTE_LA_CONV.total),
      l.findIndex((x) => x.includes("Tom vocal 3, photo 1 · Inès ")),
      ...MESURES_DE_TEMPS.map((m) => place(bloc, TOUTE_LA_CONV[m])),
      l.findIndex((x) => x.includes("2026-08 Tom 9 · Inès 14 | 2026-09 Tom 7 · Inès —")),
      l.findIndex((x) => /«\s?ciné\s?» ×5, «\s?jeudi\s?» ×3$/u.test(x)),
      l.findIndex((x) => x.includes(`${RECENT_J}`) && x.includes("2026-09-10") && x.includes("2026-10-01") && /\b25\b/.test(x)),
      ...Object.values(RECENTES).map((fin) => place(bloc, fin)),
      l.findIndex((x) => /Tom le 2026-09-29 \(.+\) · Inès le 2026-09-30 \(.+\)$/.test(x)),
    ];
    expect(ordre.every((k) => k > 0)).toBe(true);
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b));
    /* Une ligne par mesure, rien d’autre : la balise, l’en-tête, sept mesures, les longueurs, les mots, la période, ses six mesures, le dernier message, la balise */
    expect(l).toHaveLength(ordre.length + 3);
    /* Les seuils du code, dits dans le bloc */
    expect(l[place(bloc, TOUTE_LA_CONV.reprend)]).toContain(`${SILENCE_REPRISE_H} h`);
    expect(l[place(bloc, TOUTE_LA_CONV.relance)]).toContain(`${SANS_REPONSE_H} h`);
    expect(l[place(bloc, TOUTE_LA_CONV.soir)]).toMatch(new RegExp(`\\b${SOIR.de} h\\b.*\\b${SOIR.a} h\\b`));
  });

  it("sans heures exactes (des captures) : aucune mesure de temps, une seule ligne le dit à leur place", () => {
    const avecHeures = blocChiffres(chiffres(), NB, recents());
    const sansHeures = blocChiffres(chiffres({ approx: NB }), NB, recents());
    for (const m of MESURES_DE_TEMPS) expect(place(sansHeures, TOUTE_LA_CONV[m]), m).toBe(-1);
    for (const m of ["ouvre", "reprend", "relance", "delai"] as const) expect(place(sansHeures, RECENTES[m]), `${m} récent`).toBe(-1);
    /* Les cinq mesures de temps de toute la conv deviennent une ligne ; les quatre de la période disparaissent */
    expect(lignes(sansHeures)).toHaveLength(lignes(avecHeures).length - 5 + 1 - 4);
    /* Ce qui ne dépend pas de l’heure reste */
    expect(place(sansHeures, TOUTE_LA_CONV.total)).toBeGreaterThan(0);
    expect(place(sansHeures, RECENTES.total)).toBeGreaterThan(0);
    expect(place(sansHeures, RECENTES.mots)).toBeGreaterThan(0);
  });

  it("quelques messages lus sur des captures, parmi les autres : leur nombre à part, les mesures de temps gardées", () => {
    const exact = blocChiffres(chiffres(), NB, recents());
    const mele = blocChiffres(chiffres({ approx: 5 }), NB, recents());
    expect(lignes(mele)).toHaveLength(lignes(exact).length + 1);
    expect(lignes(mele).filter((l) => l.startsWith("5 "))).toHaveLength(1);
    for (const m of MESURES_DE_TEMPS) expect(place(mele, TOUTE_LA_CONV[m]), m).toBeGreaterThan(0);
  });

  it("une période récente sans message : ses dates et son compte, sans aucune de ses mesures", () => {
    const vide = blocChiffres(chiffres(), NB, recents({ n: 0, c: null }));
    expect(lignes(vide).some((l) => l.includes(`${RECENT_J}`) && l.includes("2026-09-10") && /\b0\b/.test(l))).toBe(true);
    for (const fin of Object.values(RECENTES)) expect(place(vide, fin), fin).toBe(-1);
    expect(lignes(vide)).toHaveLength(lignes(blocChiffres(chiffres(), NB, recents())).length - Object.keys(RECENTES).length);
  });

  it("le dernier message de chacun : sa date, et depuis quand (aujourd’hui, hier, il y a N jours), ou rien", () => {
    const dernier = (toi: Recents["derniers"]["toi"]) => lignes(blocChiffres(chiffres(), NB, recents({ derniers: { toi, autre: { date: "2026-09-30", jours: 1 } } }))).at(-2)!;
    const depuis = (jours: number) => dernier({ date: "2026-09-29", jours }).match(/^.*Tom le 2026-09-29 \((.+?)\) · Inès/)?.[1];
    expect(new Set([0, 1, 2].map(depuis)).size).toBe(3);
    expect(depuis(12)).toMatch(/\b12\b/);
    /* Il n’a jamais écrit : pas de date pour lui */
    expect(dernier(null)).not.toMatch(/Tom le /);
    expect(dernier(null)).toMatch(/Inès le 2026-09-30 /);
  });

  it("ce qui reste sans réponse : plus d’un message depuis le dernier de l’autre, s’il a écrit ; « d’ » devant une voyelle", () => {
    const base = lignes(blocChiffres(chiffres(), NB, recents())).length;
    const silence = (depuisSilence: Recents["depuisSilence"], derniers: Partial<Recents["derniers"]> = {}) =>
      lignes(blocChiffres(chiffres(), NB, recents({ depuisSilence, derniers: { toi: { date: "2026-09-29", jours: 2 }, autre: { date: "2026-09-30", jours: 1 }, ...derniers } })));
    /* Trois messages de Tom depuis le dernier d’Inès, quatre d’Inès depuis le dernier de Tom : deux lignes, avant la balise */
    const deux = silence({ toi: 3, autre: 4 });
    expect(deux).toHaveLength(base + 2);
    expect(deux.at(-3)).toMatch(/d’Inès.*\b3\b.*de Tom/);
    expect(deux.at(-2)).toMatch(/de Tom.*\b4\b.*d’Inès/);
    /* Un seul message : une relance, pas encore un silence */
    expect(silence({ toi: 1, autre: 1 })).toHaveLength(base);
    /* L’autre n’a jamais écrit : rien n’attend de réponse de lui */
    expect(silence({ toi: 3, autre: 0 }, { autre: null })).toHaveLength(base);
  });

  it("aucune date (des captures sans repère) : ni période, ni 21 derniers jours, ni dernier message duMois, jamais « 0 messages »", () => {
    const sansDate = lignes(
      blocChiffres(
        chiffres({ debut: null, fin: null, joursActifs: 0, approx: NB }),
        NB,
        recents({ sansDate: true, n: 0, c: null, derniers: { toi: "inconnu", autre: "inconnu" } }),
      ),
    );
    const datee = lignes(blocChiffres(chiffres({ approx: NB }), NB, recents({ n: 0, c: null })));
    for (const l of sansDate) expect(l).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(sansDate[1]).toMatch(new RegExp(`\\b${NB}\\b`));
    const vingtEtUn = sansDate.find((l) => l.includes(`${RECENT_J}`))!;
    expect(vingtEtUn).not.toMatch(/\b0\b/);
    expect(sansDate.at(-2)).not.toMatch(/Tom le |Inès le /);
    /* Une ligne pour une ligne : rien n’est ajouté ni retiré, seulement dit autrement */
    expect(sansDate).toHaveLength(datee.length);
  });

  it("une conv coupée : la première ligne dit en plus que son début n’a pas été importé ; rien d’autre ne change", () => {
    const entiere = lignes(blocChiffres(chiffres(), NB, recents()));
    const coupee = lignes(blocChiffres(chiffres(), NB, recents(), { coupe: true }));
    expect(coupee).toHaveLength(entiere.length);
    expect(coupee.flatMap((l, k) => (l === entiere[k] ? [] : [k]))).toEqual([1]);
    expect(coupee[1]).toMatch(new RegExp(`\\b${NB}\\b.*\\b23\\b`));
    expect(coupee[1]).toContain("2026-09-30");
    /* Le premier jour importé, dit deux fois : la période, puis ce qui manque d’avant lui */
    expect(coupee[1]!.split("2026-08-20")).toHaveLength(3);
  });

  it("une conv qui finit sans date : ni « 0 messages » sur 21 jours, ni silence de plusieurs jours, ni « sans réponse » mesuré", () => {
    const fin = (autres: Partial<Recents>) => lignes(blocChiffres(chiffres(), NB, recents({ n: 0, c: null, sansDateALaFin: 4, depuisSilence: { toi: 4, autre: 0 }, ...autres })));
    /* Leurs derniers messages viennent tous deux des captures sans date */
    const tous = fin({ derniers: { toi: "inconnu", autre: "inconnu" } });
    const vingtEtUn = tous.find((l) => l.includes(`${RECENT_J}`))!;
    expect(vingtEtUn).toMatch(/\b4\b/);
    expect(vingtEtUn).not.toMatch(/\b0\b|\d{4}-\d{2}-\d{2}/);
    expect(tous.some((l) => /il y a \d+ jours/.test(l))).toBe(false);
    /* Dans l’ordre des captures, ses 4 messages restent sans réponse : la ligne reste, sans durée */
    expect(tous.filter((l) => /\b4\b/.test(l) && l.includes("d’Inès") && l.includes("de Tom"))).toHaveLength(1);
    /* Le dernier d’Inès est daté, ceux de Tom d’après ne le sont pas : son jour reste, mais aucun silence ne se mesure depuis */
    const elle = fin({ derniers: { toi: "inconnu", autre: { date: "2026-09-15", jours: 16 } } });
    expect(elle.at(-2)).toMatch(/Inès le 2026-09-15 /);
    expect(elle.at(-2)).not.toMatch(/Tom le /);
    expect(elle.some((l) => /\b4\b/.test(l) && l.includes("d’Inès") && l.includes("de Tom"))).toBe(false);
    /* Les mesures des 21 derniers jours ne s’écrivent pas, même quand des messages duMois y tombent */
    const mesures = fin({ n: 25, c: recents().c, derniers: { toi: "inconnu", autre: "inconnu" } });
    for (const f of Object.values(RECENTES)) expect(place(mesures.join("\n"), f), f).toBe(-1);
  });

  it("chiffrer et recents : sans aucun message daté, ni début, ni fin, ni jours avec des messages ; leurs messages comptent toujours", () => {
    const h = qui("Moi", "Inès", "captures");
    const texte = versTexteCaptures(captures({ autre: "Inès", blocs: [{ repere: null, messages: fois(30, (k) => msg(k % 2 ? "autre" : "moi", `on se dit des trucs ${k}`)) }] }), {
      aujourdhui: "2026-10-31",
    }).texte;
    const { messages } = lire(texte, h);
    expect(messages.every((m) => m.jourDevine === "inconnu")).toBe(true);
    const c = chiffrer(h, messages);
    expect([c.debut, c.fin, c.joursActifs, c.total.toi + c.total.autre]).toEqual([null, null, 0, 30]);
    const r = recentsDe({ ...h, aujourdhui: "2026-10-31" }, messages);
    expect(r).toMatchObject({ sansDate: true, n: 0, c: null, derniers: { toi: "inconnu", autre: "inconnu" } });
    expect(r.sansDateALaFin).toBeUndefined();
    expect(trouvailles(c, h, messages).at(-1)).toBe("30\u00a0messages");
  });

  it("des messages sans date au bout d’une conv datée : la période et les jours viennent des duMois, les 21 jours et les derniers messages ne se mesurent pas", () => {
    const h = qui("Tom", "Inès");
    const texte = fois(60, (k) => {
      const d = new Date(Date.UTC(2026, 8, 1, 9) + Math.floor((k * 15) / 60) * 86400e3 + (k % 4) * 3600e3);
      return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/2026 ${pad(d.getUTCHours())}:00:00] ${k % 2 ? "Inès" : "Tom"}: message ${k}`;
    }).join("\n");
    const duMois = lire(texte, h).messages;
    const suite = fois(4, (k): Message => ({
      ...duMois.at(-1)!,
      id: "",
      t: Date.parse("2026-10-31T00:00:00Z"),
      role: k % 2 ? "autre" : "toi",
      jourDevine: "inconnu",
      approx: "jour",
      ligne: 61 + k,
    }));
    const messages = [...duMois, ...suite];
    const c = chiffrer(h, messages);
    expect([c.debut, c.fin]).toEqual(["2026-09-01", "2026-09-15"]);
    expect(c.joursActifs).toBe(chiffrer(h, duMois).joursActifs);
    const r = recentsDe({ ...h, aujourdhui: "2026-10-31" }, messages);
    expect(r.sansDate).toBeUndefined();
    expect(r).toMatchObject({ sansDateALaFin: 4, n: 0, derniers: { toi: "inconnu", autre: "inconnu" } });
    /* Sans les messages de la fin : le dernier jour daté, le 15 septembre, il y a plus de six semaines */
    expect(recentsDe({ ...h, aujourdhui: "2026-10-31" }, duMois).derniers.autre).toMatchObject({ date: "2026-09-15", jours: 46 });
  });
});

/*
 * Les mots qui reviennent (chiffrer) et « Votre mot à vous » (src/server/ecrans/trouvailles.ts). Chaque conv inventée
 * mêle leur vrai mot à du bruit qui revient plus souvent que lui : des liens, des rires de toutes les longueurs, des
 * mots allongés, tapés sans accents ou élidés, des mots vides. Avant, le bruit passait devant (« https » × 52).
 */
const pad = (n: number) => String(n).padStart(2, "0");
const fois = <T>(n: number, f: (k: number) => T) => Array.from({ length: n }, (_, k) => f(k));
/** Un export iOS de `textes`, écrits tour à tour par `noms`, un toutes les 2 h à partir du 1er mars 2026 : en français, ou en anglais (« [3/1/26, 9:00:00 AM] »). */
const exportDe = (textes: string[], noms: [string, string], anglais = false) =>
  textes
    .map((t, k) => {
      const d = new Date(Date.UTC(2026, 2, 1, 9) + k * 2 * 3600e3);
      const [j, mo, hh, mi] = [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCHours(), d.getUTCMinutes()];
      const date = anglais ? `${mo}/${j}/26, ${hh % 12 || 12}:${pad(mi)}:00 ${hh < 12 ? "AM" : "PM"}` : `${pad(j)}/${pad(mo)}/2026 ${pad(hh)}:${pad(mi)}:00`;
      return `[${date}] ${noms[k % 2]}: ${t}`;
    })
    .join("\n");
const qui = (moi: string, autre: string, format: Format = "whatsapp-ios") => ({
  utilisateur: { prenom: moi, pronom: "il" as const, nomExport: moi },
  autre: { prenom: autre, pronom: "elle" as const, nomExport: autre },
  format,
});
/** Les mots qui reviennent d’une conv, et ses trouvailles, comme l’appli les calcule à l’import. */
const lus = (texte: string, h: ReturnType<typeof qui>) => {
  const { messages } = lire(texte, h, { autresEnTexte: true });
  const c = chiffrer(h, messages);
  return { c, mots: c.recurrents.map(([w]) => w), trouvailles: trouvailles(c, h, messages) };
};
const motAVous = (mot: string, n: number) => `Votre mot à vous\u00a0: «\u00a0${mot}\u00a0»\u00a0×\u00a0${n}`;

describe("les mots qui reviennent et « Votre mot à vous »", () => {
  it("en français : ni liens, ni rires, ni mots allongés, sans accents, élidés ou vides ; leur mot passe en tête", () => {
    const textes = [
      ...fois(30, (k) => `on se fait un libanais ${k % 2 ? "ce soir" : "demain"} ?`),
      /* Allongé, il compte avec les autres */
      ...fois(4, () => "libanaiiis"),
      ...fois(40, (k) => `${k % 3 ? "" : "regarde "}https://www.instagram.com/reel/C${k}xYz${k}AbCd/?igsh=MWQ1ZGUxMzBkMA==`),
      ...fois(12, (k) => `https://vm.tiktok.com/ZMh${k}aBcDe/ www.youtube.com/watch?v=dQw${k}w9WgXcQ`),
      ...fois(40, (k) => `non mais ${["ahahaha", "ahahahah", "AHAHAHAHA", "hahahaa", "hihihi"][k % 5]}`),
      ...fois(36, (k) => `t’es grave ${["mdrrr", "mdrr", "ptdrrr", "xptdr", "looool", "lool"][k % 6]}`),
      ...fois(40, () => "c’est meme pas vrai"),
      ...fois(36, () => "t’as deja vu"),
      ...fois(40, (k) => (k % 2 ? "je sais pas peut-être" : "on peut y aller")),
      ...fois(36, () => "ils sont où"),
      ...fois(20, () => "qu’est-ce que tu fais"),
      ...fois(20, () => "on se voit quand ? vas-y dis-moi"),
      ...fois(20, () => "voilà bref"),
      ...fois(10, () => "ouiiii trooooop bien"),
      ...fois(10, () => "j’sais pas, j'vais dormir"),
      ...fois(8, () => "l’appart est trop grand"),
      ...fois(6, () => "on visite un appart samedi"),
      ...fois(10, () => "à 'genre' jusqu’à demain"),
      ...fois(10, () => "un café ?"),
      ...fois(10, () => "un cafe ?"),
    ];
    const { c, mots, trouvailles: t } = lus(exportDe(textes, ["Léa", "Tom"]), qui("Tom", "Léa"));
    expect(c.recurrents[0]).toEqual(["libanais", 34]);
    /* Seuls leurs vrais mots : « l’appart » et « appart » ensemble, sous leur forme la plus écrite, « café » et « cafe » sous l’accentuée */
    expect(c.recurrents).toEqual(
      expect.arrayContaining([
        ["l’appart", 14],
        ["café", 20],
      ]),
    );
    expect(new Set(mots)).toEqual(new Set(["libanais", "aller", "café", "regarde", "l’appart", "dormir", "grand", "visite", "samedi"]));
    expect(t).toContain(motAVous("libanais", 34));
  });

  it("en anglais, en espagnol et en portugais : leurs mots vides et leurs rires ne sont pas leur mot", () => {
    const anglais = [
      ...fois(30, () => "wanna get tacos?"),
      ...fois(40, () => "what are you doing"),
      ...fois(36, () => "yeah that was really good"),
      ...fois(36, () => "i think that you should come"),
      ...fois(36, () => "just like this, i don't know what's going on"),
      ...fois(40, (k) => ["hahaha", "lmaooo", "LMFAO", "loool", "lol"][k % 5]!),
      ...fois(20, (k) => `https://youtu.be/dQw${k}w9WgXcQ`),
    ];
    const en = lus(exportDe(anglais, ["Ashley", "Jake"], true), qui("Jake", "Ashley"));
    expect(en.c.recurrents).toEqual([["tacos", 30]]);
    expect(en.trouvailles).toContain(motAVous("tacos", 30));

    const ailleurs = [
      ...fois(15, () => "churros"),
      ...fois(20, (k) => ["jajaja", "jajajaja", "jsjsjs", "kkkkkk", "kkkkkkkkk", "rsrsrs"][k % 6]!),
      ...fois(20, () => "pero bueno, vale"),
      ...fois(20, () => "você está bem? tudo bem, isso"),
    ];
    expect(lus(exportDe(ailleurs, ["Léa", "Tom"]), qui("Tom", "Léa")).c.recurrents).toEqual([["churros", 15]]);
  });

  it("un lieu écrit avec une majuscule après une élision (« l’Italie ») reste un nom, pas leur mot", () => {
    const textes = [...fois(12, (k) => (k % 4 ? "l’Italie c’est trop bien" : "on retourne en Italie")), ...fois(8, () => "une pizza ce soir"), ...fois(20, () => "ok")];
    const { c, trouvailles: t } = lus(exportDe(textes, ["Léa", "Tom"]), qui("Tom", "Léa"));
    /* Le modèle le voit (« en Italie » compté avec), l’écran passe au mot suivant */
    expect(c.recurrents[0]).toEqual(["l’italie", 12]);
    expect(t).toContain(motAVous("pizza", 8));
  });

  it("captures : « [illisible] », écrit par la lecture, n’est pas leur mot, et compte toujours pour un mot du message", () => {
    const lot = (illisible: string) =>
      versTexteCaptures(
        captures({
          autre: "Léa",
          blocs: [
            {
              repere: { date: "2026-09-12", heure: "21:05" },
              messages: [
                ...fois(18, (k) => msg(k % 2 ? "moi" : "autre", k % 3 ? `t’es où ${illisible} ?` : `${illisible} demain`)),
                ...fois(6, (k) => msg(k % 2 ? "moi" : "autre", "sushi ce soir")),
              ],
            },
          ],
        }),
        { aujourdhui: "2026-09-13" },
      );
    const h = qui("Moi", "Léa", "captures");
    const avec = lus(lot("[illisible]").texte, h);
    expect(avec.mots).toEqual(["sushi"]);
    expect(avec.trouvailles).toContain(motAVous("sushi", 6));
    expect(avec.c.motsMoyens).toEqual(lus(lot("machin").texte, h).c.motsMoyens);
  });
});

describe("les mots qui reviennent : ce qui reste un mot, ce qui se réunit", () => {
  const LT = qui("Tom", "Léa");
  /** Les mots qui reviennent et « Votre mot à vous » d’une conv de `textes`, avec leur vrai mot (libanais) en plus. */
  const avecLibanais = (textes: string[], libanais = 5) => lus(exportDe([...textes, ...fois(libanais, () => "on se fait un libanais ?")], ["Léa", "Tom"]), LT);

  it("une élision de pronom reste : « je t’aime » et « j’aime » sont deux mots, chacun avec son compte", () => {
    const { c } = avecLibanais([...fois(10, () => "je t’aime"), ...fois(12, () => "j’aime bien"), ...fois(3, () => "tu m’aimes ?")]);
    expect(c.recurrents).toEqual(
      expect.arrayContaining([
        ["j’aime", 12],
        ["t’aime", 10],
        ["m’aimes", 3],
      ]),
    );
    /* Celle d’un article se réunit toujours : « l’appart » et « appart » */
    expect(avecLibanais([...fois(4, () => "l’appart"), ...fois(3, () => "un appart")]).c.recurrents).toContainEqual(["l’appart", 7]);
  });

  it("un mot allongé se montre tel qu’il est écrit, et se réunit à sa forme simple quand elle est écrite", () => {
    const { c } = avecLibanais([
      ...fois(6, () => "bonne nuit"),
      ...fois(4, () => "bonnnne nuit"),
      ...fois(6, () => "t’es mignonnnne"),
      ...fois(3, () => "trop classsse"),
      ...fois(2, () => "la classe"),
    ]);
    expect(c.recurrents).toEqual(
      expect.arrayContaining([
        ["bonne", 10],
        ["mignonnnne", 6],
        ["classsse", 5],
      ]),
    );
    /* Jamais une forme que personne n’a écrite */
    for (const w of ["mignone", "bone", "clase"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
  });

  it("sans accents, un mot rejoint sa forme accentuée ; deux formes accentuées restent deux mots", () => {
    const { c } = avecLibanais([...fois(6, () => "de mon côté"), ...fois(4, () => "sur la côte"), ...fois(5, () => "un café ?"), ...fois(3, () => "un cafe ?")]);
    expect(c.recurrents).toEqual(
      expect.arrayContaining([
        ["côté", 6],
        ["côte", 4],
        ["café", 8],
      ]),
    );
    /* Un mot accentué n’est pas le mot vide qui a ses lettres (« mème » n’est pas « même », « sûre » n’est pas « sure »), ni une élision le mot qui la suit */
    const mots = avecLibanais([
      "un mème",
      "le mème",
      "t’es sûre ?",
      "sûre",
      "j’ai liké",
      "liké",
      "à Côme",
      "Côme",
      "on est d’accord",
      "un accord",
      "l’accord",
      "t’inquiète",
      "je suis inquiète",
      "inquiète",
      "Jéjé",
      "Jéjé",
    ]).mots;
    expect(mots).toEqual(expect.arrayContaining(["mème", "sûre", "liké", "côme", "accord", "inquiète", "jéjé"]));
  });

  it("une dernière lettre doublée, une élision tapée sans apostrophe : un mot vide ou banal reste vide ou banal", () => {
    const { c, trouvailles: t } = avecLibanais(
      fois(12, (k) => ["mercii", "coucouu", "bisouu", "yess", "nonn", "cetait", "tinquiete", "aujourdhui", "jsais"][k % 9]!).flatMap((x) => [x, x]),
    );
    for (const w of ["yess", "nonn", "cetait", "tinquiete", "aujourdhui", "jsais"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
    expect(t).toContain(motAVous("libanais", 5));
  });

  it("un mot de 4 lettres à la dernière lettre doublée reste un mot : « pass » n’est pas « pas », ni « Tess » « tes »", () => {
    const { mots } = avecLibanais(["t’as ton pass ?", "mon pass est là", "less is more", "less stress", "quel mess", "le mess", "Tess arrive", "Tess est là"]);
    expect(mots).toEqual(expect.arrayContaining(["pass", "less", "mess", "tess"]));
  });

  it("les mots composés : « rendez-vous » reste un mot, « week-end », « c’est-à-dire », « après-midi » ne laissent rien", () => {
    const { c, trouvailles: t } = avecLibanais([
      ...fois(8, () => "notre rendez-vous"),
      ...fois(6, () => "ce week-end"),
      ...fois(6, () => "c’est-à-dire"),
      ...fois(6, () => "cet après-midi"),
      ...fois(6, () => "peut-être"),
      ...fois(6, () => "qu’est-ce que tu fais"),
      ...fois(6, () => "vas-y dis-moi"),
    ]);
    expect(c.recurrents).toContainEqual(["rendez-vous", 8]);
    for (const w of ["rendez", "week", "dire", "midi", "après", "peut", "vous"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
    /* Un mot de tous les couples : pas leur mot */
    expect(t).toContain(motAVous("libanais", 5));
  });

  it("en anglais, une contraction n’est pas leur mot (« we’ll see »), en espagnol et en portugais leurs mots courants non plus", () => {
    const anglais = [
      ...fois(14, () => "we’ll see"),
      ...fois(8, (k) => ["wouldn’t", "you’ll", "they’ll", "you’ve", "haven’t", "aren’t", "youll", "wouldnt"][k]!),
      ...fois(8, (k) => ["more", "after", "before", "those", "being", "ever", "down", "away"][k]!),
      ...fois(6, () => "tacos tonight?"),
    ];
    const en = lus(exportDe([...anglais, ...anglais], ["Ashley", "Jake"], true), qui("Jake", "Ashley"));
    expect(en.c.recurrents).toEqual([["tacos", 12]]);
    expect(en.trouvailles).toContain(motAVous("tacos", 12));
    const ailleurs = "também hoje acho tava minha ainda depois sempre coisa tambem ahora mañana creo cosa luego siempre manana".split(" ");
    expect(avecLibanais([...ailleurs, ...ailleurs]).c.recurrents).toEqual([["libanais", 5]]);
  });
});

describe("le jour où compte un message (jourCompte)", () => {
  /** Un message à `iso` (UTC, l’heure « naïve » de la conv), daté à la minute, au repère près, ou du jour seulement. */
  const a = (iso: string, approx: Message["approx"]) => ({ t: Date.parse(iso), approx });

  it("sa journée va de 5 h à 5 h ; un message daté du jour seulement (une pastille sans heure) compte le jour de sa pastille", () => {
    expect([a("2026-10-20T00:00Z", "jour"), a("2026-10-20T01:30Z", false), a("2026-10-20T04:59Z", "heure"), a("2026-10-20T05:00Z", false)].map(jourCompte)).toEqual([
      "2026-10-20",
      "2026-10-19",
      "2026-10-19",
      "2026-10-20",
    ]);
  });

  it("les jours avec des messages : une pastille sans heure n’est plus comptée la veille, un jour inconnu ne compte pas", () => {
    const h = qui("Moi", "Léa", "captures");
    const bloc = (n: number, prefixe: string, repere: Captures["blocs"][number]["repere"]) => ({
      repere,
      messages: fois(n, (k) => msg(k % 2 ? "autre" : "moi", `${prefixe} ${k}`)),
    });
    const jours = (blocs: Captures["blocs"]) => chiffrer(h, lire(versTexteCaptures(captures({ blocs }), { aujourdhui: "2026-10-31" }).texte, h).messages).joursActifs;
    /* Le 19 à 21 h, puis les pastilles du 20 et du 21 : trois jours (avant, deux : la pastille du 20 comptait le 19) */
    expect(
      jours([bloc(4, "x", { date: "2026-10-19", heure: "21:00" }), bloc(4, "y", { date: "2026-10-20", heure: null }), bloc(4, "z", { date: "2026-10-21", heure: null })]),
    ).toBe(3);
    expect(jours([bloc(4, "x", { date: "2026-10-19", heure: "10:00" }), bloc(4, "y", { date: "2026-10-20", heure: null })])).toBe(2);
    /* Le haut sans repère compte le jour qu’il emprunte (au plus tard ce jour-là) : un seul jour */
    expect(jours([bloc(4, "x", null), bloc(4, "y", { date: "2024-02-21", heure: "09:05" })])).toBe(1);
    /*
     * Ce jour emprunté est celui du message daté qui le suit, déjà compté : un premier repère de la nuit (compté la
     * veille) n’en fait pas deux pour une nuit, ni la ligne impossible « du 2026-09-08 au 2026-09-08, 2 jours »
     */
    for (const heure of ["01:30", "04:59", "05:00", "14:00", null])
      expect(jours([bloc(2, "x", null), bloc(22, "y", { date: "2026-09-08", heure })]), heure ?? "sans heure").toBe(1);
    const deNuit = lire(
      versTexteCaptures(captures({ blocs: [bloc(2, "x", null), bloc(22, "y", { date: "2026-09-08", heure: "01:30" })] }), { aujourdhui: "2026-10-31" }).texte,
      h,
    ).messages;
    expect(blocChiffres(chiffrer(h, deNuit), deNuit.length, recentsDe({ ...h, aujourdhui: "2026-10-31" }, deNuit))).toContain(
      "sur toute la conv : 24 messages, du 2026-09-08 au 2026-09-08, 1 jours avec des messages",
    );
    /* Seulement des jours empruntés (un repère dont aucun message n’est lisible) : ils comptent, plutôt que zéro jour */
    expect(chiffrer(h, deNuit.slice(0, 2)).joursActifs).toBe(1);
    /* Aucune date sur les captures : aucun jour connu */
    expect(jours([bloc(4, "x", null)])).toBe(0);
    /* Un export à 1 h 30 le 20 compte la nuit du 19 ; une capture sous la pastille du 20 compte le 20 */
    const nuit: Message = { id: "m0001", t: Date.parse("2026-10-20T01:30:00Z"), nom: "Léa", role: "autre", texte: "nuit", approx: false, ligne: 1 };
    expect(chiffrer(h, [nuit, { ...nuit, id: "m0002", texte: "jour", t: Date.parse("2026-10-20T00:00:00Z"), approx: "jour", ligne: 2 }]).joursActifs).toBe(2);
  });
});
