import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noterEcriture } from "@/lib/query";
import { getFiche } from "@/services/api";
import type { Fiche, FicheFact } from "@/types";
import { FicheScreen } from "@/app/app/fiche/FicheScreen";

/*
 * Sa fiche rendue à l’instant par le serveur (src/app/app/fiche/FicheScreen.tsx, Q63) : elle n’est pas relue au montage,
 * sauf si le rendu dit qu’une mise à jour de la mémoire tourne (`updating`, getFicheEtMaj) ; la fiche se relit alors
 * toutes les 3 s jusqu’à la fin, et ce qui est arrivé prend son point rose. Rendue avant un message du chat (qui a pu
 * lancer une mise à jour depuis), elle est relue. Le serveur est simulé, le compte a BLUSH+.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/app/fiche" }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), getFiche: vi.fn(), prechargerExport: vi.fn() }));
vi.mock("@/lib/requetes", () => ({ useCompte: () => ({ data: { email: "test@example.com", subscription: { plan: "blushplus" } } }) }));
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
/* <ViewTransition> n’est que dans le React de Next (canary) : ici, il rend ses enfants */
vi.mock("react", async (vrai) => ({ ...(await vrai<typeof import("react")>()), ViewTransition: ({ children }: { children: ReactNode }) => children }));

const lire = vi.mocked(getFiche);

const fait = (id: string, text: string): FicheFact => ({ id, section: "notes", text, sourceLabel: "conv", sources: ["conv"] });
const FICHE: Fiche = { person: { id: "p1", name: "Maëlys", initial: "M" }, portrait: "", updatedLabel: "", facts: [fait("f1", "Adore le jazz")], summary: "", summaryShort: "" };

/* Une clé de cache par test (une conv chacun) : le cache des requêtes vit d’un test à l’autre */
let conv = 0;
const monter = (initial: Fiche, rendu = Date.now()) => render(<FicheScreen initial={initial} storyId={`fiche-fraiche-${++conv}`} rendu={rendu} />);

beforeEach(() => {
  lire.mockReset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sa fiche rendue à l’instant", () => {
  it("sans mise à jour en cours : pas relue au montage", async () => {
    lire.mockResolvedValue(FICHE);
    monter(FICHE);
    await act(async () => void (await vi.advanceTimersByTimeAsync(4000)));
    expect(lire).not.toHaveBeenCalled();
    expect(screen.getByText("Adore le jazz")).toBeTruthy();
  });

  it("le rendu dit qu’une mise à jour tourne : la fiche se relit dès le montage, et ce qui arrive prend son point rose", async () => {
    lire.mockResolvedValueOnce({ ...FICHE, updating: true }).mockResolvedValue({ ...FICHE, facts: [...FICHE.facts, fait("f2", "Son exam jeudi")] });
    monter({ ...FICHE, updating: true });
    /* Pas de relecture au montage (rendue à l’instant) : le sondage de 3 s, lui, part tout de suite */
    expect(lire).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(lire).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Son exam jeudi")).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(lire).toHaveBeenCalledTimes(2);
    const arrivee = screen.getByText("Son exam jeudi").closest("li")!;
    expect(arrivee.hasAttribute("data-new")).toBe(true);
    expect(screen.getByText("Adore le jazz").closest("li")!.hasAttribute("data-new")).toBe(false);
    /* Fini : le sondage s’arrête */
    await act(async () => void (await vi.advanceTimersByTimeAsync(9000)));
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("rendue avant un message du chat : relue au montage (le chat a pu lancer une mise à jour depuis)", async () => {
    lire.mockResolvedValue({ ...FICHE, updating: true });
    const rendu = Date.now();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    noterEcriture("chat");
    monter(FICHE, rendu);
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(lire).toHaveBeenCalledTimes(1);
    /* La relecture dit qu’une mise à jour tourne : le sondage part */
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(lire).toHaveBeenCalledTimes(2);
  });
});
