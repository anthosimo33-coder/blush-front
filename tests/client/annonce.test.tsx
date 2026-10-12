import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELAI_ANNONCE_MS, useAnnonce } from "@/app/app/accueil/annonce";

/*
 * La région role="status" de l’accueil (src/app/app/accueil/annonce.ts) : une région live ne se relit que si son contenu
 * change. La même annonce deux fois de suite (deux morceaux de 40 messages de l’historique) doit donc changer le DOM
 * deux fois : la région se vide, puis reprend le texte.
 */

/* La fonction qui annonce, tendue au test par la région montée (`pret`) */
let annoncerMonte: (texte: string) => void = () => {};
const annoncer = (texte: string) => annoncerMonte(texte);
const pret = (a: (texte: string) => void) => void (annoncerMonte = a);

function Region({ pret }: { pret: (annoncer: (texte: string) => void) => void }) {
  const [texte, a] = useAnnonce();
  useLayoutEffect(() => pret(a), [pret, a]);
  return <p role="status">{texte}</p>;
}

/* Les textes successifs de la région, notés à chaque changement du DOM */
function suivre(region: HTMLElement) {
  const vus: string[] = [];
  const obs = new MutationObserver(() => vus.push(region.textContent ?? ""));
  obs.observe(region, { childList: true, characterData: true, subtree: true });
  return { vus, arreter: () => obs.disconnect() };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAnnonce", () => {
  it("la même annonce deux fois : la région change deux fois (vidée, puis le texte)", async () => {
    render(<Region pret={pret} />);
    const region = screen.getByRole("status");
    const { vus, arreter } = suivre(region);
    for (let i = 0; i < 2; i++) {
      act(() => annoncer("40 messages plus anciens chargés"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DELAI_ANNONCE_MS);
      });
      expect(region.textContent).toBe("40 messages plus anciens chargés");
    }
    arreter();
    expect(vus.filter((t) => t === "40 messages plus anciens chargés")).toHaveLength(2);
    expect(vus.at(-2)).toBe("");
  });

  it("deux annonces coup sur coup : seule la dernière est dite", async () => {
    render(<Region pret={pret} />);
    const region = screen.getByRole("status");
    act(() => {
      annoncer("BLUSH a répondu");
      annoncer("BLUSH\u00a0: Je n’ai rien entendu.");
    });
    expect(region.textContent).toBe("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_ANNONCE_MS);
    });
    expect(region.textContent).toBe("BLUSH\u00a0: Je n’ai rien entendu.");
  });

  it("démontée avant la fin du délai : rien ne se pose après coup", async () => {
    const { unmount } = render(<Region pret={pret} />);
    act(() => annoncer("BLUSH a répondu"));
    unmount();
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await vi.advanceTimersByTimeAsync(DELAI_ANNONCE_MS);
      expect(vi.getTimerCount()).toBe(0);
      expect(erreur).not.toHaveBeenCalled();
    } finally {
      erreur.mockRestore();
    }
  });
});
