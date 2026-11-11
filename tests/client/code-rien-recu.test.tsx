import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeScreen } from "@/app/email/code/CodeScreen";
import { CODE_RENVOI_S } from "@/lib/limites";
import { codeRevenu, sendLoginCode } from "@/services/api";
import { resetJourney, setJourney } from "@/state/journey";

/*
 * L’écran du code quand le code ne vient pas (src/app/email/code/CodeScreen.tsx) : la minute du renvoi passée, il dit
 * les deux raisons les plus courantes, les spams et une boîte pleine (qui refuse le code sans bruit : son rebond n’arrive
 * que 14 h après), nommée par sa messagerie. Un renvoi le garde. Le serveur (l’envoi, le code revenu) est simulé, et
 * l’horloge aussi : la minute passe sans l’attendre.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/connexion/code",
}));
vi.mock("@/components/ui/Captcha", () => ({ Captcha: () => null }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), sendLoginCode: vi.fn(), codeRevenu: vi.fn() }));

/** Laisse passer `s` secondes, une à une : le compte à rebours du renvoi se reprogramme à chaque rendu. */
const passer = async (s: number) => {
  for (let k = 0; k < s; k++) await act(() => vi.advanceTimersByTimeAsync(1000));
};

/** La phrase de l’écran quand le code ne vient pas, s’il la montre. */
const rienRecu = () => screen.queryByText(/^Toujours rien/);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(sendLoginCode).mockResolvedValue({ email: "x" });
  vi.mocked(codeRevenu).mockResolvedValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  resetJourney();
});

describe("l’écran du code, quand le code ne vient pas", () => {
  it("rien la première minute ; ensuite, les spams et la boîte pleine, nommée par sa messagerie", async () => {
    setJourney({ email: "lea@gmail.com" });
    render(<CodeScreen connexion />);
    await passer(CODE_RENVOI_S - 1);
    expect(rienRecu()).toBeNull();
    await passer(1);
    expect(rienRecu()?.textContent).toBe(
      "Toujours rien\u00a0? Regarde dans tes spams. Et si ta boîte Gmail est pleine, aucun mail ne peut y entrer\u00a0: fais de la place, ou change d’email.",
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Renvoyer le code" }).disabled).toBe(false);
  });

  it("une messagerie qu’on ne connaît pas : « ta boîte mail »", async () => {
    setJourney({ email: "lea@exemple.fr" });
    render(<CodeScreen connexion />);
    await passer(CODE_RENVOI_S);
    expect(rienRecu()?.textContent).toContain("si ta boîte mail est pleine");
  });

  it("un renvoi la garde, pendant que le nouveau compte à rebours tourne", async () => {
    setJourney({ email: "lea@gmail.com" });
    render(<CodeScreen connexion />);
    await passer(CODE_RENVOI_S);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Renvoyer le code" })));
    expect(sendLoginCode).toHaveBeenCalledWith("lea@gmail.com");
    expect(screen.queryByText("Nouveau code envoyé.")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /^Renvoyer le code \(\d+ s\)$/ }).disabled).toBe(true);
    expect(rienRecu()).not.toBeNull();
  });
});
