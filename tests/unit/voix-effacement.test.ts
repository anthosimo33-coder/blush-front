import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * L’effacement chez le prestataire de voix (S-17, SUIVI-2) : ce qu’il garde d’un vocal dit ou d’une transcription est
 * effacé après la réponse. Sans base ni réseau : le prestataire est un faux `fetch` qui répond, essai après essai, les
 * statuts donnés ; les pauses sont notées sans être attendues, les alertes à l’équipe gardées pour être lues, et ce
 * que after garde en vie après la réponse attendu à la main.
 */
const etat = vi.hoisted(() => ({ apres: [] as (() => unknown)[], alertes: [] as string[][] }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", () => ({ alerter: async (sujet: string, lignes: string[]) => void etat.alertes.push([sujet, ...lignes]) }));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, env: () => ({ ...o.env(), ELEVENLABS_API_KEY: "cle-fictive" }) };
});

import { effacerChezLePrestataire, signalerSansIdentifiant } from "@/server/ia/voix";
import { definirPause } from "@/server/temps";

/* Les pauses entre deux essais, notées */
let pauses: number[] = [];
/** Le faux prestataire : chaque DELETE reçoit la réponse suivante (un statut, un statut et ses en-têtes, ou une panne du réseau). */
function prestataire(...reponses: (number | [number, Record<string, string>] | "reseau")[]) {
  const appels: { url: string; methode: string; cle: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      appels.push({ url, methode: init.method ?? "GET", cle: new Headers(init.headers).get("xi-api-key") });
      const r = reponses[appels.length - 1] ?? 500;
      if (r === "reseau") throw new TypeError("fetch failed");
      const [status, headers] = typeof r === "number" ? [r, {}] : r;
      return new Response(status === 204 ? null : "{}", { status, headers });
    }),
  );
  return appels;
}
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

beforeEach(() => {
  pauses = [];
  etat.apres.length = 0;
  etat.alertes.length = 0;
  definirPause(async (ms) => void pauses.push(ms));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  definirPause(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("effacer chez le prestataire de voix", () => {
  it("sans retenir la réponse (gardé en vie par after) : un DELETE avec la clé, sur l’adresse de l’élément ; effacé, rien à dire", async () => {
    const appels = prestataire(200);
    effacerChezLePrestataire("/v1/history/element42");
    expect(etat.apres).toHaveLength(1);
    await lancerApres();
    expect(appels).toEqual([{ url: "https://api.elevenlabs.io/v1/history/element42", methode: "DELETE", cle: "cle-fictive" }]);
    expect(etat.alertes).toEqual([]);
  });

  it("un identifiant qui n’en est pas un ne part pas dans une adresse", async () => {
    const appels = prestataire(200);
    effacerChezLePrestataire("/v1/history/../../v1/voices");
    effacerChezLePrestataire("/v1/history/");
    await lancerApres();
    expect(appels).toEqual([]);
  });

  it("reprend sur une panne, un 429 (son Retry-After écouté, borné) et un élément pas encore là, jusqu’à trois essais", async () => {
    const appels = prestataire("reseau", [429, { "retry-after": "5" }], 204);
    effacerChezLePrestataire("/v1/speech-to-text/transcripts/transcription42");
    await lancerApres();
    expect(appels).toHaveLength(3);
    expect(pauses).toEqual([2_000, 6_000]);
    expect(etat.alertes).toEqual([]);

    const longue = prestataire([429, { "retry-after": "3600" }], 200);
    effacerChezLePrestataire("/v1/history/element42");
    await lancerApres();
    expect(longue).toHaveLength(2);
    /* Une heure demandée : l’attente reste bornée, l’essai part quand même */
    expect(pauses.slice(2)).toEqual([10_000]);

    const tard = prestataire(404, 404, 200);
    effacerChezLePrestataire("/v1/history/element42");
    await lancerApres();
    expect(tard).toHaveLength(3);
    expect(etat.alertes).toEqual([]);
  });

  it("toujours en panne au bout de trois essais : l’équipe est prévenue (le statut, jamais l’identifiant)", async () => {
    const appels = prestataire(503, 500, 502);
    effacerChezLePrestataire("/v1/history/element42");
    await lancerApres();
    expect(appels).toHaveLength(3);
    expect(etat.alertes.map((a) => a[0])).toEqual(["prestataire de voix : effacement en échec"]);
    expect(etat.alertes.flat().join("\n")).toContain("statut 502");
    expect(etat.alertes.flat().join("\n")).not.toContain("element42");
  });

  it("une clé sans droit d’effacer : pas de nouvel essai, son alerte à part ; un 404 au bout n’est pas une fuite", async () => {
    const refus = prestataire(403);
    effacerChezLePrestataire("/v1/history/element42");
    await lancerApres();
    expect(refus).toHaveLength(1);
    expect(etat.alertes.map((a) => a[0])).toEqual(["prestataire de voix : clé sans droit d’effacement"]);

    etat.alertes.length = 0;
    prestataire(404, 404, 404);
    effacerChezLePrestataire("/v1/history/element42");
    await lancerApres();
    expect(etat.alertes).toEqual([]);
    expect(vi.mocked(console.info).mock.calls.flat().join("\n")).toContain("rien de gardé à effacer");
  });

  it("un appel réussi sans identifiant : l’équipe est prévenue, une fois par jour pour chaque sorte d’appel", async () => {
    signalerSansIdentifiant("voix");
    signalerSansIdentifiant("voix");
    signalerSansIdentifiant("transcription");
    await lancerApres();
    expect(etat.alertes.map((a) => [a[0], a[1]?.includes("(voix)") ?? false])).toEqual([
      ["prestataire de voix : rien à effacer", true],
      ["prestataire de voix : rien à effacer", false],
    ]);
  });
});
