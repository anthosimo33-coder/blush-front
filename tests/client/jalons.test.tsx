import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les jalons du tunnel, côté navigateur (src/lib/jalons.ts) : le nom du jalon, seul, part à POST /api/jalon une fois par
 * page chargée ; jamais depuis les outils de l’équipe ; un jalon « en vue » attend que son élément arrive à l’écran.
 * Chaque test recharge le module : sa mémoire des jalons envoyés est celle d’une page neuve.
 */

const envoyes = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === "/api/jalon")
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

/* Une page neuve : le module relu, à cette adresse */
async function page(chemin: string) {
  window.history.replaceState(null, "", chemin);
  vi.resetModules();
  return import("@/lib/jalons");
}

/* L’IntersectionObserver de happy-dom ne voit jamais rien : le nôtre se déclenche à la demande */
let voir: (() => void) | null = null;
class FauxObservateur {
  constructor(private rappel: IntersectionObserverCallback) {}
  observe() {
    voir = () => this.rappel([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {
    voir = null;
  }
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })),
  );
  vi.stubGlobal("IntersectionObserver", FauxObservateur);
});
afterEach(() => {
  vi.unstubAllGlobals();
  voir = null;
});

describe("les jalons du tunnel, côté navigateur", () => {
  it("envoie le nom du jalon, une fois par page", async () => {
    const { marquerJalon } = await page("/importer/export");
    marquerJalon("fichier");
    marquerJalon("fichier");
    marquerJalon("importee");
    expect(envoyes()).toEqual([{ jalon: "fichier" }, { jalon: "importee" }]);
  });

  it("rien depuis les outils de l’équipe", async () => {
    const { marquerJalon } = await page("/apercu/paywall");
    marquerJalon("paywall");
    expect(envoyes()).toEqual([]);
  });

  it("à l’arrivée d’un écran, et rien quand l’écran n’en pose pas", async () => {
    const { useJalon } = await page("/commencer");
    function Ecran({ jalon }: { jalon: "commencer" | null }) {
      useJalon(jalon);
      return null;
    }
    render(<Ecran jalon={null} />);
    expect(envoyes()).toEqual([]);
    render(<Ecran jalon="commencer" />);
    expect(envoyes()).toEqual([{ jalon: "commencer" }]);
  });

  it("en vue : seulement quand l’élément arrive à l’écran", async () => {
    const { useJalonEnVue } = await page("/lecture");
    function Avis() {
      const ref = useRef<HTMLDivElement>(null);
      useJalonEnVue(ref, "avis");
      return <div ref={ref} />;
    }
    render(<Avis />);
    expect(envoyes()).toEqual([]);
    voir?.();
    expect(envoyes()).toEqual([{ jalon: "avis" }]);
    /* Vu, l’observateur s’arrête */
    expect(voir).toBeNull();
  });
});
