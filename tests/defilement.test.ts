import { afterEach, describe, expect, it, vi } from "vitest";
import { basDePage } from "@/lib/defilement";

/* Le bas de la page (src/lib/defilement.ts) : clavier ouvert, viser plus loin que le défilement maximal décollerait le champ du clavier */

describe("basDePage", () => {
  afterEach(() => vi.unstubAllGlobals());
  const page = (hauteur: number, fenetre: number) => {
    vi.stubGlobal("document", { documentElement: { scrollHeight: hauteur } });
    vi.stubGlobal("window", { innerHeight: fenetre });
  };

  it("vise le défilement maximal, pas la hauteur de la page", () => {
    page(1866, 844);
    expect(basDePage()).toBe(1022);
  });

  it("une page plus courte que l’écran reste en haut", () => {
    page(600, 844);
    expect(basDePage()).toBe(0);
  });
});
