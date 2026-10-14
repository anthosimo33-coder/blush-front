import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/* La sentinelle (src/lib/sentinelle.tsx) : ce qu’elle envoie des erreurs et de la vitesse d’une page, et ce qu’elle laisse */
const vitals = vi.hoisted(() => ({ rapporter: null as null | ((m: { name: string; value: number }) => void) }));
vi.mock("next/web-vitals", () => ({ useReportWebVitals: (f: (m: { name: string; value: number }) => void) => void (vitals.rapporter = f) }));
vi.mock("@/services/api", () => ({ signalerErreurDuNavigateur: vi.fn(), envoyerMesuresDuNavigateur: vi.fn() }));

import { Sentinelle, signalerErreur } from "@/lib/sentinelle";
import { envoyerMesuresDuNavigateur, signalerErreurDuNavigateur } from "@/services/api";

const signalees = vi.mocked(signalerErreurDuNavigateur);
const mesurees = vi.mocked(envoyerMesuresDuNavigateur);

afterEach(() => vi.clearAllMocks());

const erreur = (message: string, filename = `${window.location.origin}/_next/static/chunks/ab.js`) =>
  window.dispatchEvent(new ErrorEvent("error", { message, filename, lineno: 1, colno: 9, error: new TypeError(message) }));

describe("la sentinelle", () => {
  it("signale une erreur de l’appli avec l’écran, une fois ; ignore celles d’ailleurs et le bruit connu", () => {
    window.history.replaceState(null, "", "/app");
    render(<Sentinelle />);
    erreur("x is undefined");
    erreur("x is undefined");
    erreur("ailleurs", "chrome-extension://abc/s.js");
    erreur("ResizeObserver loop completed with undelivered notifications.");
    expect(signalees).toHaveBeenCalledTimes(1);
    expect(signalees).toHaveBeenCalledWith({ nom: "TypeError", message: "x is undefined", etape: "chat", source: `${window.location.origin}/_next/static/chunks/ab.js:1:9` });
  });

  it("une promesse rejetée sans suite aussi ; jamais plus de cinq par page, et rien sur les outils de l’équipe", () => {
    window.history.replaceState(null, "", "/rapport");
    render(<Sentinelle />);
    for (let i = 0; i < 8; i++) signalerErreur(new Error(`rejet ${i}`));
    /* Cinq par page en tout : la première du test d’avant compte déjà */
    expect(signalees.mock.calls.length).toBeLessThanOrEqual(5);
    window.history.replaceState(null, "", "/admin");
    vi.clearAllMocks();
    signalerErreur(new Error("chez l’équipe"));
    expect(signalees).not.toHaveBeenCalled();
  });

  it("la vitesse de la page part une fois, quand elle passe à l’arrière-plan : l’écran du chargement, et les mesures connues seulement", () => {
    window.history.replaceState(null, "", "/");
    render(<Sentinelle />);
    act(() => {
      vitals.rapporter!({ name: "TTFB", value: 320 });
      vitals.rapporter!({ name: "LCP", value: 1800 });
      vitals.rapporter!({ name: "FID", value: 12 });
    });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(mesurees).toHaveBeenCalledTimes(1);
    expect(mesurees).toHaveBeenCalledWith({
      etape: "accueil",
      mobile: expect.any(Boolean),
      mesures: [
        { metrique: "TTFB", valeur: 320 },
        { metrique: "LCP", valeur: 1800 },
      ],
    });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
