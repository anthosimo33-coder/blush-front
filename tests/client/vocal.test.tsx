import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocalDuRapport } from "@/app/rapport/Vocal";
import type { VocalRapport } from "@/types";

/*
 * La tuile du vocal de BLUSH (src/app/rapport/Vocal.tsx) : elle bouge (data-vocal-nouveau) tant que ce vocal n’a jamais
 * été écouté dans ce navigateur. La liste des vocaux écoutés est relue validée : abîmée, elle compte pour « jamais
 * écouté » ; le stockage refusé, on ne peut pas savoir et la tuile reste calme. Le réseau et l’observateur sont simulés.
 */

/* Les polices de next/font ne se chargent que dans la compilation de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));
/* Les écoutes notées au serveur : la tuile seule n’en note aucune */
vi.mock("@/services/api", () => ({ noterEcouteVocal: vi.fn() }));

const CLE = "blush.vocal.ecoutes.v1";
const vocal: VocalRapport = { etat: "pret", audio: "/api/vocal/v1.mp3", duree: 24, voix: "A", sobre: true, lignes: [] };
const fin = { titre: "Fin", sousTitre: "", action: "Retour au rapport" };

class FauxObservateur {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", FauxObservateur);
  /* Le préchargement du son, au repos : rien ne part */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const tuile = async () => {
  await act(async () => {
    render(<VocalDuRapport vocal={vocal} titre="Ton rapport" fin={fin} ecrit sobre />);
  });
  return screen.getByRole("button", { name: /Écouter le vocal de BLUSH/ });
};

describe("la tuile du vocal", () => {
  it("jamais écouté : elle bouge", async () => {
    expect((await tuile()).hasAttribute("data-vocal-nouveau")).toBe(true);
  });

  it("déjà écouté dans ce navigateur : elle reste calme", async () => {
    localStorage.setItem(CLE, JSON.stringify(["/api/vocal/autre.mp3", vocal.audio]));
    expect((await tuile()).hasAttribute("data-vocal-nouveau")).toBe(false);
  });

  it.each([
    ["JSON cassé", '["/api/vocal/v1.mp3"'],
    ["d’une autre forme", JSON.stringify({ audio: vocal.audio })],
    ["une liste d’autre chose que des adresses", JSON.stringify([vocal.audio, 3])],
  ])("la liste abîmée (%s) compte pour « jamais écouté »", async (_, brut) => {
    localStorage.setItem(CLE, brut);
    expect((await tuile()).hasAttribute("data-vocal-nouveau")).toBe(true);
  });

  it("le stockage refusé : on ne peut pas savoir, elle reste calme", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("refusé", "SecurityError");
    });
    expect((await tuile()).hasAttribute("data-vocal-nouveau")).toBe(false);
  });
});
