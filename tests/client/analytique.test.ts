import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "posthog-js";

/*
 * La mesure d’audience chez PostHog (src/lib/analytique.ts) : ce qui part, et ce qui n’en part jamais. Les adresses
 * sans requête (sauf les utm_), sans identifiant, sans titre de page, le site d’avant réduit à son nom ; rien depuis les
 * outils de l’équipe ; PostHog chargé seulement avec sa clé, une fois la page prête, avec ses réglages sans cookie, et les
 * jalons gardés le temps qu’il arrive. posthog-js est simulé : rien ne part.
 */

const init = vi.fn();
const capture = vi.fn();
vi.mock("posthog-js", () => ({ default: { init, capture } }));

const ORIGINE = "https://www.askblush.com";
const ici = (chemin: string) => new URL(chemin, ORIGINE) as unknown as Location;
const evenement = (properties: CaptureResult["properties"], plus: Partial<CaptureResult> = {}): CaptureResult => ({ uuid: "u", event: "$pageview", properties, ...plus });

/* Une page neuve : le module relu, à cette adresse */
async function page(chemin: string) {
  window.history.replaceState(null, "", chemin);
  vi.resetModules();
  return import("@/lib/analytique");
}

beforeEach(() => {
  init.mockReset();
  capture.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ce qui part chez PostHog", () => {
  it("les chemins sans leurs identifiants", async () => {
    const { cheminSur } = await page("/");
    expect(cheminSur("/v/Ab3dE9xYz")).toBe("/v/:id");
    expect(cheminSur("/ouvrir/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe("/ouvrir/:id");
    expect(cheminSur("/p/LEA42")).toBe("/p/:id");
    expect(cheminSur("/tournage/une-cle-de-lien/fin")).toBe("/tournage/:id/fin");
    expect(cheminSur("/rapport/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed/chapitre")).toBe("/rapport/:id/chapitre");
    expect(cheminSur("/importer/export")).toBe("/importer/export");
    expect(cheminSur("/")).toBe("/");
  });

  it("les adresses : sur BLUSH, le chemin et les seuls utm_ ; d’ailleurs, le nom du site ; le reste tel quel", async () => {
    const { adresseSure } = await page("/");
    expect(adresseSure(`${ORIGINE}/importer/export?app=whatsapp&utm_source=tiktok&prenom=Lea#haut`, ORIGINE)).toBe(`${ORIGINE}/importer/export?utm_source=tiktok`);
    expect(adresseSure(`${ORIGINE}/ouvrir/abc123def456?m=s3_rapport`, ORIGINE)).toBe(`${ORIGINE}/ouvrir/:id`);
    expect(adresseSure("https://www.tiktok.com/@une.createrice/video/7312?lang=fr", ORIGINE)).toBe("https://www.tiktok.com");
    expect(adresseSure("$direct", ORIGINE)).toBe("$direct");
  });

  it("un événement nettoyé : ses adresses, ses chemins, ses $set, et plus de titre", async () => {
    const { nettoyer } = await page("/");
    const e = nettoyer(
      evenement(
        {
          $current_url: `${ORIGINE}/v/Ab3dE9xYz?utm_source=snap&ref=x`,
          $pathname: "/v/Ab3dE9xYz",
          $referrer: "https://l.instagram.com/?u=https%3A%2F%2Fwww.askblush.com",
          $title: "Ton rapport sur Léa · BLUSH",
          title: "Ton rapport sur Léa · BLUSH",
          jalon: "paywall",
          $screen_height: 844,
        },
        { $set_once: { $initial_current_url: `${ORIGINE}/p/LEA42?prenom=Lea`, $initial_pathname: "/p/LEA42" } },
      ),
      ici("/v/Ab3dE9xYz"),
    );
    expect(e?.properties).toEqual({
      $current_url: `${ORIGINE}/v/:id?utm_source=snap`,
      $pathname: "/v/:id",
      $referrer: "https://l.instagram.com",
      jalon: "paywall",
      $screen_height: 844,
    });
    expect(e?.$set_once).toEqual({ $initial_current_url: `${ORIGINE}/p/:id`, $initial_pathname: "/p/:id" });
  });

  it("rien depuis les outils de l’équipe", async () => {
    const { nettoyer } = await page("/");
    for (const chemin of ["/admin", "/admin/direct", "/apercu/admin", "/styleguide"]) expect(nettoyer(evenement({ $pathname: chemin }), ici(chemin)), chemin).toBeNull();
    expect(nettoyer(null, ici("/"))).toBeNull();
  });
});

describe("le chargement de PostHog", () => {
  it("sans sa clé : rien ne se charge, rien n’attend", async () => {
    const { demarrerLaMesure, mesurer } = await page("/commencer");
    demarrerLaMesure();
    mesurer("jalon_commencer");
    await vi.dynamicImportSettled();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("avec sa clé, une fois la page prête : ses réglages sans cookie, puis les jalons qui attendaient, puis les suivants", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_CLE", "phc_essai");
    vi.stubGlobal("requestIdleCallback", (f: () => void) => {
      f();
      return 1;
    });
    const { demarrerLaMesure, mesurer } = await page("/importer/export");
    mesurer("jalon_appli");
    demarrerLaMesure();
    demarrerLaMesure();
    await vi.dynamicImportSettled();
    expect(init).toHaveBeenCalledTimes(1);
    const [cle, reglages] = init.mock.calls[0]!;
    expect(cle).toBe("phc_essai");
    expect(reglages).toMatchObject({
      api_host: "/ingest",
      cookieless_mode: "always",
      persistence: "memory",
      person_profiles: "never",
      autocapture: false,
      disable_session_recording: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      before_send: expect.any(Function),
    });
    expect(capture.mock.calls).toEqual([["jalon_appli"]]);
    mesurer("jalon_fichier");
    expect(capture.mock.calls).toEqual([["jalon_appli"], ["jalon_fichier"]]);
    vi.unstubAllGlobals();
  });

  it("jamais lancé depuis un outil de l’équipe", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_CLE", "phc_essai");
    const { demarrerLaMesure } = await page("/admin");
    demarrerLaMesure();
    await vi.dynamicImportSettled();
    expect(init).not.toHaveBeenCalled();
  });
});
