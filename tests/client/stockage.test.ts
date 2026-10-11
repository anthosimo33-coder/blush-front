import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drapeauLocal, ecrire, ecrireJson, lire, lireJson, stockageDisponible, useDrapeau } from "@/lib/stockage";

/*
 * Le stockage du navigateur (src/lib/stockage.ts) : il ne lève jamais. Un stockage refusé (navigation privée, quota
 * plein), une valeur abîmée ou d’une autre forme donnent la valeur par défaut. Chaque test part d’un stockage vide, et
 * rend ce qu’il a simulé.
 */

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
/* Le stockage simulé rendu avant le nettoyage : refusé, il y lèverait */
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** Le stockage refusé, comme Safari quand les données des sites sont bloquées : rien que d’y toucher lève. */
function stockageRefuse() {
  for (const zone of ["localStorage", "sessionStorage"] as const)
    vi.spyOn(window, zone, "get").mockImplementation(() => {
      throw new DOMException("refusé", "SecurityError");
    });
}

const estListe = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

describe("lire, ecrire", () => {
  it("lit ce qui est écrit, dans sa zone ; null quand rien n’y est", () => {
    expect(lire("blush.test.cle")).toBeNull();
    expect(ecrire("blush.test.cle", "a")).toBe(true);
    expect(ecrire("blush.test.cle", "b", "session")).toBe(true);
    expect(lire("blush.test.cle")).toBe("a");
    expect(lire("blush.test.cle", "session")).toBe("b");
  });

  it("un stockage refusé ne lève pas : null à la lecture, false à l’écriture", () => {
    stockageRefuse();
    expect(lire("blush.test.cle")).toBeNull();
    expect(lire("blush.test.cle", "session")).toBeNull();
    expect(ecrire("blush.test.cle", "a")).toBe(false);
    expect(ecrireJson("blush.test.cle", { a: 1 })).toBe(false);
  });

  it("un stockage plein ne lève pas : false à l’écriture, la valeur d’avant reste", () => {
    const plein = {
      getItem: () => "avant",
      setItem: () => {
        throw new DOMException("plein", "QuotaExceededError");
      },
    } as unknown as Storage;
    vi.spyOn(window, "localStorage", "get").mockReturnValue(plein);
    expect(ecrire("blush.test.cle", "apres")).toBe(false);
    expect(lire("blush.test.cle")).toBe("avant");
  });
});

describe("stockageDisponible : l’absence et le refus ne disent pas la même chose", () => {
  it("vrai quand le stockage répond, même vide ; faux quand il est refusé", () => {
    expect(stockageDisponible()).toBe(true);
    expect(stockageDisponible("session")).toBe(true);
    stockageRefuse();
    expect(stockageDisponible()).toBe(false);
    expect(stockageDisponible("session")).toBe(false);
  });
});

describe("lireJson : la valeur, si elle a la forme attendue", () => {
  it("relit ce qu’ecrireJson a écrit", () => {
    ecrireJson("blush.test.liste", ["a", "b"]);
    expect(lireJson("blush.test.liste", estListe, [])).toEqual(["a", "b"]);
  });

  it.each([
    ["absente", null],
    ["un JSON abîmé", "[\"a\", "],
    ["d’une autre forme", "{\"a\": 1}"],
    ["une liste d’autre chose", "[1, 2]"],
    ["null", "null"],
  ])("%s : la valeur par défaut", (_, brut) => {
    if (brut !== null) localStorage.setItem("blush.test.liste", brut);
    const defaut = ["defaut"];
    expect(lireJson("blush.test.liste", estListe, defaut)).toBe(defaut);
  });

  it("stockage refusé : la valeur par défaut", () => {
    localStorage.setItem("blush.test.liste", "[\"a\"]");
    stockageRefuse();
    expect(lireJson("blush.test.liste", estListe, [])).toEqual([]);
  });
});

describe("drapeauLocal : un drapeau retenu sur cet appareil", () => {
  /* Chaque drapeau garde sa valeur en mémoire : chaque test a sa clé */
  let n = 0;
  const cle = () => `blush.test.drapeau.${++n}`;

  it("« 1 » vrai, « 0 » faux, toute autre valeur (ou rien) la valeur par défaut", () => {
    const valeurs: [string | null, boolean, boolean][] = [
      [null, false, true],
      ["1", true, true],
      ["0", false, false],
      ["oui", false, true],
    ];
    for (const [brut, sansDefaut, avecDefaut] of valeurs) {
      const k = cle();
      if (brut !== null) localStorage.setItem(k, brut);
      expect(drapeauLocal(k, { defaut: false }).lire()).toBe(sansDefaut);
      const k2 = cle();
      if (brut !== null) localStorage.setItem(k2, brut);
      expect(drapeauLocal(k2, { defaut: true }).lire()).toBe(avecDefaut);
    }
  });

  it("poser l’écrit (« 1 », « 0 ») et le garde en mémoire", () => {
    const k = cle();
    const d = drapeauLocal(k, { defaut: false });
    d.poser(true);
    expect(localStorage.getItem(k)).toBe("1");
    expect(d.lire()).toBe(true);
    d.poser(false);
    expect(localStorage.getItem(k)).toBe("0");
    expect(d.lire()).toBe(false);
  });

  it("stockage refusé : `indisponible` à la lecture, et ce qu’on pose vaut pour la visite", () => {
    stockageRefuse();
    const calme = drapeauLocal(cle(), { defaut: false, indisponible: true });
    expect(calme.lire()).toBe(true);
    const reglage = drapeauLocal(cle(), { defaut: true });
    expect(reglage.lire()).toBe(true);
    reglage.poser(false);
    expect(reglage.lire()).toBe(false);
  });

  it("useDrapeau suit ses changements, et prévient chaque écran qui le lit", () => {
    const d = drapeauLocal(cle(), { defaut: false });
    const un = renderHook(() => useDrapeau(d));
    const deux = renderHook(() => useDrapeau(d));
    expect([un.result.current, deux.result.current]).toEqual([false, false]);
    act(() => d.poser(true));
    expect([un.result.current, deux.result.current]).toEqual([true, true]);
    un.unmount();
    act(() => d.poser(false));
    expect(deux.result.current).toBe(false);
  });

  it("côté serveur, la valeur `serveur` (par défaut, la valeur par défaut)", () => {
    expect(drapeauLocal(cle(), { defaut: false }).serveur).toBe(false);
    expect(drapeauLocal(cle(), { defaut: false, serveur: true }).serveur).toBe(true);
  });
});
