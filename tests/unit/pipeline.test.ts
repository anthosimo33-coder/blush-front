import { describe, expect, it } from "vitest";
import { GENRES, type Genre, type StatutTache } from "@/server/db/enums";
import { DUREES_MS } from "@/server/avancement";
import { ECHEANCE_CHAINE_MS, tempsPourCommencer } from "@/server/pipeline";
import { suite, vocalTente, type EtatChaine } from "@/server/chaine";

/*
 * La suite de la chaîne (src/server/chaine.ts, `suite`) : ce qui vient après une étape, d’après ce qui est écrit
 * et les tâches déjà lancées. Une règle pure, en table : chaque ligne est un moment de la vie d’une histoire. Sans
 * base ni modèle.
 */

const T0 = new Date("2026-10-11T10:00:00Z");
const APRES = new Date("2026-10-11T10:05:00Z");

/** Les tâches, la dernière de chaque genre : son état, planifiée à T0 (sauf la date donnée). */
const taches = (t: Partial<Record<Genre, StatutTache | [StatutTache, Date]>>): EtatChaine["taches"] =>
  Object.fromEntries(Object.entries(t).map(([g, v]) => [g, Array.isArray(v) ? { status: v[0], createdAt: v[1] } : { status: v, createdAt: T0 }]));

/** Une histoire dont le verdict vient d’être écrit, sans alerte : la conv est là, une voix aussi, rien d’autre. */
const etat = (e: Partial<EtatChaine> = {}): EtatChaine => ({
  conv: true,
  voix: true,
  verdict: { alerte: null, mode_sobre: false },
  plan: false,
  rapport: false,
  vocal: null,
  taches: taches({ verdict: "fini" }),
  ...e,
});
const ALERTE = { alerte: "danger", mode_sobre: true } as const;
/** Le mode sobre d’avant le 9 octobre : un rejet, sans alerte (héritage). */
const SOBRE_SANS_ALERTE = { alerte: null, mode_sobre: true } as const;
const VOCAL_A_JOUR = { aJour: true, fait: APRES };

type Ligne = [moment: string, etat: EtatChaine, acces: boolean, attendu: Genre[]];

const LIGNES: Ligne[] = [
  /* Le verdict */
  ["le verdict pas encore écrit", etat({ verdict: null, taches: taches({ verdict: "en_cours" }) }), true, []],
  ["le verdict écrit, sa tâche pas encore finie (une lecture relancée)", etat({ taches: taches({ verdict: "en_cours" }) }), true, []],
  ["le verdict en échec", etat({ taches: taches({ verdict: "echec" }) }), true, []],
  ["le verdict sans sa tâche", etat({ taches: {} }), true, []],
  ["après le verdict, avec l’accès : le plan", etat(), true, ["rapport_plan"]],
  ["après le verdict, sans l’accès : rien", etat(), false, []],
  ["après le verdict, une alerte : le rapport doux, offert", etat({ verdict: ALERTE }), false, ["rapport_plan"]],
  ["après le verdict, la conv effacée (30 jours) : rien ne la relit", etat({ conv: false }), true, []],
  /* Le rapport */
  ["après le plan : les chapitres, et le vocal", etat({ plan: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }), true, ["rapport_chapitres", "vocal"]],
  ["après le plan, sans voix : les chapitres", etat({ voix: false, plan: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }), true, ["rapport_chapitres"]],
  ["le plan en cours : le moteur planifiera la suite à sa fin", etat({ taches: taches({ verdict: "fini", rapport_plan: "en_cours" }) }), true, []],
  ["le plan en échec : « Relancer l’écriture », pas ici", etat({ taches: taches({ verdict: "fini", rapport_plan: "echec" }) }), true, []],
  /*
   * L’accès retiré pendant le plan, puis rendu : la réparation planifie les chapitres et le vocal (comme après le plan,
   * plus haut). Si les chapitres échouent pour de bon, la tâche vocal rend la main sans rapport (vocalTache,
   * src/server/analyse.ts) : tentée, elle ne repart plus, et rien n’échoue.
   */
  [
    "le plan gardé, les chapitres en échec, le vocal jamais tenté : le vocal, qui rendra la main sans rapport",
    etat({ plan: true, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "echec" }) }),
    true,
    ["vocal"],
  ],
  [
    "le plan gardé, les chapitres en échec, le vocal tenté sans rapport : plus rien",
    etat({ plan: true, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "echec", vocal: "fini" }) }),
    true,
    [],
  ],
  [
    "les chapitres en cours, le vocal fait pendant : rien",
    etat({ plan: true, vocal: VOCAL_A_JOUR, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "en_cours", vocal: "attente" }) }),
    true,
    [],
  ],
  [
    "après les chapitres : la mémoire",
    etat({ plan: true, rapport: true, vocal: VOCAL_A_JOUR, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "attente" }) }),
    true,
    ["memoire"],
  ],
  [
    "après les chapitres, l’accès retiré entre-temps : rien au-delà",
    etat({ plan: true, rapport: true, vocal: VOCAL_A_JOUR, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "fini" }) }),
    false,
    [],
  ],
  [
    "tout est fait",
    etat({ conv: false, plan: true, rapport: true, vocal: VOCAL_A_JOUR, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "fini", memoire: "fini" }) }),
    true,
    [],
  ],
  /* Le mode sobre */
  ["une alerte, le rapport doux écrit, sans l’accès : rien (ni mémoire, ni vocal)", etat({ verdict: ALERTE, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }), false, []],
  ["une alerte, le rapport doux écrit, avec l’accès : la mémoire, sans vocal", etat({ verdict: ALERTE, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }), true, ["memoire"]],
  [
    "héritage : un rapport sobre sans alerte (d’avant le 9 octobre) a son vocal doux, puis la mémoire avec l’accès",
    etat({ verdict: SOBRE_SANS_ALERTE, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }),
    true,
    ["vocal", "memoire"],
  ],
  ["héritage, sans l’accès : son vocal doux seulement", etat({ verdict: SOBRE_SANS_ALERTE, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }), false, ["vocal"]],
  /* Le vocal */
  [
    "un rapport écrit avant le vocal : le vocal, une fois",
    etat({ conv: false, plan: true, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", memoire: "fini" }) }),
    true,
    ["vocal"],
  ],
  [
    "un vocal d’une ancienne version du script : il se refait, sur la mémoire",
    etat({ conv: false, plan: true, rapport: true, vocal: { aJour: false, fait: APRES }, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "fini", memoire: "fini" }) }),
    true,
    ["vocal"],
  ],
  [
    "une ancienne version, déjà retentée depuis et en échec : l’ancien reste",
    etat({ conv: false, plan: true, rapport: true, vocal: { aJour: false, fait: T0 }, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: ["echec", APRES], memoire: "fini" }) }),
    true,
    [],
  ],
  [
    "le vocal en échec, jamais fait : pas relancé à chaque ouverture",
    etat({ plan: true, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "echec", memoire: "fini" }) }),
    true,
    [],
  ],
  [
    "une ancienne version, sa tâche en attente : elle le fera",
    etat({ conv: false, plan: true, rapport: true, vocal: { aJour: false, fait: APRES }, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", vocal: "attente", memoire: "fini" }) }),
    true,
    [],
  ],
  [
    "une alerte : jamais de vocal",
    etat({ verdict: ALERTE, conv: false, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini", memoire: "fini" }) }),
    true,
    [],
  ],
  [
    "sans voix : pas de vocal",
    etat({ voix: false, conv: false, plan: true, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini", rapport_chapitres: "fini", memoire: "fini" }) }),
    true,
    [],
  ],
  /* La conv effacée */
  [
    "un rapport sobre offert, puis l’accès, la conv effacée : plus de mémoire possible",
    etat({ verdict: ALERTE, conv: false, rapport: true, taches: taches({ verdict: "fini", rapport_plan: "fini" }) }),
    true,
    [],
  ],
];

describe("la suite de la chaîne", () => {
  it.each(LIGNES)("%s", (_, e, acces, attendu) => {
    expect(suite(e, acces)).toEqual(attendu);
  });

  it("ne planifie jamais deux fois un genre, ni un genre déjà lancé", () => {
    for (const [, e, acces] of LIGNES) {
      const genres = suite(e, acces);
      expect(new Set(genres).size).toBe(genres.length);
      for (const g of genres) if (g !== "vocal") expect(e.taches[g]).toBeUndefined();
    }
  });
});

describe("le vocal tenté depuis le dernier fait", () => {
  it("toute tâche compte sans vocal fait ; sinon, seulement une tâche planifiée après lui", () => {
    expect(vocalTente(undefined, null)).toBe(false);
    expect(vocalTente({ createdAt: T0 }, null)).toBe(true);
    expect(vocalTente({ createdAt: T0 }, { fait: APRES })).toBe(false);
    expect(vocalTente({ createdAt: APRES }, { fait: T0 })).toBe(true);
  });
});

describe("les durées des étapes", () => {
  it("chaque étape a le temps de finir avant l’échéance de la chaîne, 15 s avant que Vercel coupe la fonction", () => {
    expect(ECHEANCE_CHAINE_MS).toBe(285_000);
    for (const g of GENRES) {
      expect(DUREES_MS[g]).toBeGreaterThan(0);
      expect(tempsPourCommencer(g)).toBeGreaterThan(DUREES_MS[g]);
      expect(tempsPourCommencer(g)).toBeLessThan(ECHEANCE_CHAINE_MS);
    }
  });
});
