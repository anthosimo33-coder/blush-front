import { describe, expect, it } from "vitest";
import {
  avanceChapitres,
  avanceMoitie,
  avancePlan,
  avanceRejouee,
  avanceVerdict,
  CHAPITRES_PAR_MOITIE,
  chapitresCommences,
  chapitresFinis,
  DUREE_RELECTURE_MS,
  etapeDeLecture,
  ETAPES_DE_LECTURE,
  LECTURE_DEPART,
  LECTURE_MAX,
  VERDICT_REFLEXION,
} from "@/server/avancement";

/*
 * Les jauges (src/server/avancement.ts) : où en est une étape, lu sur ce que le modèle a déjà écrit. Sans base ni
 * modèle : du texte écrit à la main, comme le modèle le rendrait en flux.
 */

const avance = (ecrit: string, reflexion = 0) => ({ reflexion, texte: ecrit.length, ecrit });

describe("l’avancée du rapport, lue sur ce que le modèle écrit", () => {
  it("repère les chapitres commencés, et suit chaque moitié chapitre par chapitre", () => {
    const ecrit = `{"plan":null,"chapitres":[{"numero":1,"titre":"A","blocs":[]},{"numero":2,"titre":"B","blocs":[{"type":"recit","texte":"${"x".repeat(1000)}`;
    expect(chapitresCommences(ecrit)).toEqual([1, 2]);
    const m = avanceMoitie(avance(ecrit), 1);
    expect(m.ecrits).toEqual([1]);
    expect(m.enCours).toBe(2);
    expect(m.progres).toBeGreaterThan(0.45 + 0.55 / 4);
    expect(m.progres).toBeLessThan(0.45 + (0.55 * 2) / 4);
    /* Avant le premier chapitre : la réflexion, sous 45 % */
    expect(avanceMoitie(avance("", 50_000), 5).progres).toBeLessThan(0.45);
    expect(avanceMoitie(avance("", 50_000), 5).enCours).toBeNull();
    /* Un chapitre est fini quand le suivant commence : seul le 1 l’est ici */
    const ch = (n: number) =>
      `{"numero":${n},"titre":"T${n}","titre_court":"C${n}","surtitre":null,"blocs":[{"type":"chute","texte":"fin ${n}","preuves":[],"titre":null,"niveau":null,"items":null}]}`;
    expect(chapitresFinis(`{"plan":null,"chapitres":[${ch(1)},${ch(2).slice(0, 40)}`).map((c) => c.numero)).toEqual([1]);
    expect(chapitresFinis(`{"plan":null,"chapitres":[${ch(1)}, ${ch(2)},${ch(3).slice(0, 20)}`).map((c) => c.titre)).toEqual(["T1", "T2"]);
    /* Le plan : sa réflexion jusqu’à 50, puis ses chapitres */
    expect(avancePlan(avance("", 2500))).toBeLessThan(50);
    expect(avancePlan(avance('{"chapitres":[{"numero":1},{"numero":2},{"numero":3},{"numero":4}'))).toBe(74);
  });

  it("une moitié ne dit jamais fini avant la fin de l’étape, ni ne compte les chapitres de l’autre moitié", () => {
    const quatre = `{"chapitres":[{"numero":5},{"numero":6},{"numero":7},{"numero":8,"texte":"${"x".repeat(10_000)}`;
    const m = avanceMoitie(avance(quatre), 5);
    expect(m.ecrits).toEqual([5, 6, 7]);
    expect(m.enCours).toBe(8);
    /* Le dernier chapitre bien avancé (0,45 + 0,55 × 3,95 / 4 ≈ 0,993) : la moitié plafonne à 0,98 */
    expect(m.progres).toBe(0.98);
    /* La première moitié ne voit rien de la seconde : elle réfléchit encore, et écrit déjà (son premier chapitre) */
    expect(avanceMoitie(avance(quatre), 1)).toEqual({ progres: 0, ecrits: [], enCours: 1 });
    /* Un plan qui a annoncé ses huit chapitres plafonne à 98, jamais 100 avant la fin */
    expect(avancePlan(avance(Array.from({ length: 9 }, (_, k) => `{"numero":${k + 1}}`).join(",")))).toBe(98);
  });

  it("les chapitres avancent comme la moyenne des deux moitiés, et la première moitié finit au chapitre 4", () => {
    const moitie = (progres: number) => ({ progres, ecrits: [], enCours: null });
    expect(avanceChapitres(null)).toBe(0);
    expect(avanceChapitres({ a: moitie(0.5), b: moitie(0.25) })).toBe(0.375);
    expect(avanceChapitres({ a: moitie(0.98), b: moitie(0.98) })).toBe(0.98);
    expect(CHAPITRES_PAR_MOITIE).toBe(4);
    expect(avanceMoitie(avance('{"chapitres":[{"numero":4},{"numero":5}'), 1).enCours).toBe(4);
  });
});

describe("l’avancée du verdict", () => {
  it("monte avec la réflexion sans dépasser 70, puis avec le verdict jusqu’à 98", () => {
    const r = [0, 1000, 3000, 8000, 30000].map((reflexion) => avanceVerdict({ reflexion, texte: 0, ecrit: "" }));
    expect(r[0]).toBe(15);
    expect(r).toEqual([...r].sort((a, b) => a - b));
    expect(Math.max(...r)).toBeLessThanOrEqual(70);
    expect(avanceVerdict({ reflexion: 4000, texte: 350, ecrit: "" })).toBe(84);
    expect(avanceVerdict({ reflexion: 4000, texte: 5000, ecrit: "" })).toBe(98);
  });
});

describe("l’écran de lecture", () => {
  it("passe ses étapes aux seuils de la jauge, la dernière quand le verdict commence à s’écrire", () => {
    expect([0, 0.34, 0.35, 0.54, 0.55, 0.69, 0.7, 1].map(etapeDeLecture)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    /* Le seuil de la dernière étape est celui où la réflexion du verdict s’arrête (avanceVerdict) */
    expect(ETAPES_DE_LECTURE.at(-1)).toBe(VERDICT_REFLEXION / 100);
    expect(avanceVerdict({ reflexion: 1e9, texte: 0, ecrit: "" })).toBe(VERDICT_REFLEXION);
    expect(avanceVerdict({ reflexion: 0, texte: 1, ecrit: "" })).toBe(VERDICT_REFLEXION);
  });
});

describe("la relecture d’une prise du mode tournage", () => {
  it("part comme une vraie lecture, monte sans jamais redescendre, et n’est finie qu’au bout de sa durée", () => {
    expect(avanceRejouee(0)).toBe(LECTURE_DEPART);
    expect(avanceRejouee(-5000)).toBe(LECTURE_DEPART);
    expect(avanceRejouee(DUREE_RELECTURE_MS * 0.1)).toBeCloseTo(LECTURE_MAX);
    /* La réflexion jusqu’au seuil de la dernière étape, puis le verdict qui s’écrit */
    expect(avanceRejouee(DUREE_RELECTURE_MS * 0.7)).toBeCloseTo(VERDICT_REFLEXION / 100);
    const pas = Array.from({ length: 101 }, (_, k) => avanceRejouee((DUREE_RELECTURE_MS * k) / 100));
    for (let k = 1; k < pas.length; k++) expect(pas[k]!).toBeGreaterThanOrEqual(pas[k - 1]!);
    expect(Math.max(...pas.slice(0, -1))).toBeLessThan(1);
    expect(avanceRejouee(DUREE_RELECTURE_MS)).toBe(1);
    expect(avanceRejouee(DUREE_RELECTURE_MS * 3)).toBe(1);
    /* Les quatre étapes de l’écran défilent toutes pendant la relecture */
    expect(new Set(pas.map(etapeDeLecture)).size).toBe(ETAPES_DE_LECTURE.length + 1);
  });
});
