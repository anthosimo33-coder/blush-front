import { describe, expect, it } from "vitest";
import { blocChiffres, RECENT_J, SANS_REPONSE_H, SILENCE_REPRISE_H, SOIR, type Chiffres, type Recents } from "@prompts/lib/conv";

/*
 * Le bloc <chiffres> que reçoit le modèle (prompts/lib/conv.ts) : ce que le code a mesuré, le seul endroit d’où le
 * modèle tient un chiffre. Testé seul, sur des mesures écrites à la main (deux prénoms inventés) : chaque mesure a ses
 * propres nombres, sa ligne se reconnaît à eux (« Tom 12 · Inès 9 »), sans recopier le texte du bloc, privé.
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
const TOUTE_LA_CONV = { total: "Tom 41 · Inès 37", ouvre: "Tom 12 · Inès 9", reprend: "Tom 6 · Inès 2", relance: "Tom 4 · Inès 11", delai: "Tom 5 min · Inès 2,0 h", soir: "Tom 38 % · Inès 61 %" };
const RECENTES = { total: "Tom 15 · Inès 10", ouvre: "Tom 8 · Inès 1", reprend: "Tom 21 · Inès 22", relance: "Tom 23 · Inès 24", delai: "Tom 17 min · Inès 26 min", mots: "Tom 27 · Inès 28" };
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
});
