import { afterEach, describe, expect, it, vi } from "vitest";
import { jourDeParisAvant } from "@/lib/jours";
import { aujourdhuiParis, jourRelatif } from "@/server/temps";
import { midiDHier } from "../aide/jours";

/*
 * La veille et le lendemain d’un jour de Paris (jourDeParisAvant de src/lib/jours.ts), l’heure figée sur les deux
 * changements d’heure de 2026 : le 29 mars, 2 h devient 3 h (un jour de 23 h) ; le 25 octobre, 3 h redevient 2 h (un
 * jour de 25 h). Le 25 octobre à 23 h 30, « il y a 24 h » tombait encore le jour même : trois tests, qui comptaient la
 * veille ainsi, avaient bloqué la mise en ligne (run CI 40238992771).
 */

/** Le calcul d’avant, en tranches de 24 h : le jour de Paris de « maintenant moins `jours` × 24 h ». */
const enTranchesDe24h = (jours: number) => aujourdhuiParis(new Date(Date.now() - jours * 86400e3)).iso;

/** L’horloge de Date figée sur `instant` (les minuteurs restent vrais). */
function figer(instant: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("la veille et le lendemain à Paris, comptés sur le calendrier", () => {
  it.each([
    /* Le jour de 25 h : à 23 h 30, l’heure du run qui a échoué ; à 2 h 30, une heure vécue deux fois, d’été puis d’hiver */
    ["2026-10-25T23:30:00+01:00", "2026-10-25", "2026-10-24", "2026-10-26"],
    ["2026-10-25T02:30:00+02:00", "2026-10-25", "2026-10-24", "2026-10-26"],
    ["2026-10-25T02:30:00+01:00", "2026-10-25", "2026-10-24", "2026-10-26"],
    ["2026-10-26T00:30:00+01:00", "2026-10-26", "2026-10-25", "2026-10-27"],
    /* Le jour de 23 h : avant et après le saut de 2 h à 3 h, le soir ; puis les deux bords où les 24 h se trompaient */
    ["2026-03-29T01:30:00+01:00", "2026-03-29", "2026-03-28", "2026-03-30"],
    ["2026-03-29T03:30:00+02:00", "2026-03-29", "2026-03-28", "2026-03-30"],
    ["2026-03-29T23:30:00+02:00", "2026-03-29", "2026-03-28", "2026-03-30"],
    ["2026-03-30T00:30:00+02:00", "2026-03-30", "2026-03-29", "2026-03-31"],
    ["2026-03-28T23:30:00+01:00", "2026-03-28", "2026-03-27", "2026-03-29"],
  ])("le %s", (instant, aujourdhui, veille, lendemain) => {
    figer(instant);
    expect(aujourdhuiParis().iso).toBe(aujourdhui);
    expect(jourDeParisAvant()).toBe(veille);
    expect(jourDeParisAvant(-1)).toBe(lendemain);
    /* L’instant de la veille des tests (tests/aide/jours.ts) : ce jour-là à Paris, que jourRelatif dit « hier » */
    expect(aujourdhuiParis(midiDHier()).iso).toBe(veille);
    expect(jourRelatif(midiDHier())).toBe("hier");
  });

  it("là où les tranches de 24 h se trompaient d’un jour", () => {
    /* Le 25 octobre à 23 h 30 : il y a 24 h, il était 0 h 30 le jour même, pas la veille */
    figer("2026-10-25T23:30:00+01:00");
    expect([enTranchesDe24h(1), jourDeParisAvant(1)]).toEqual(["2026-10-25", "2026-10-24"]);
    /* Le 30 mars à 0 h 30, au lendemain du jour de 23 h : il y a 24 h, il était 23 h 30 l’avant-veille */
    figer("2026-03-30T00:30:00+02:00");
    expect([enTranchesDe24h(1), jourDeParisAvant(1)]).toEqual(["2026-03-28", "2026-03-29"]);
    /* Le 28 mars à 23 h 30, à la veille du jour de 23 h : dans 24 h, il sera 0 h 30 le surlendemain */
    figer("2026-03-28T23:30:00+01:00");
    expect([enTranchesDe24h(-1), jourDeParisAvant(-1)]).toEqual(["2026-03-30", "2026-03-29"]);
  });

  it("plusieurs jours d’un coup, par-dessus un changement d’heure : la période du tableau de bord, un anniversaire dans trois jours", () => {
    /* Les 7 jours d’/admin vus le 28 octobre à 23 h 30 : la veille de leur début, le 21 (en tranches de 24 h, le 22) */
    figer("2026-10-28T23:30:00+01:00");
    expect([enTranchesDe24h(7), jourDeParisAvant(7)]).toEqual(["2026-10-22", "2026-10-21"]);
    /* Dans trois jours, vu le 26 mars à 23 h 30 : le 29 (en tranches de 24 h, le 30) */
    figer("2026-03-26T23:30:00+01:00");
    expect([enTranchesDe24h(-3), jourDeParisAvant(-3)]).toEqual(["2026-03-30", "2026-03-29"]);
  });
});
