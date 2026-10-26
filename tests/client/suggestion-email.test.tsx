import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormulaireEmail } from "@/components/formulaires/FormulaireEmail";
import { PAUSE_SUGGESTION_MS, useSaisieEmail } from "@/lib/email";

/*
 * La suggestion d’un domaine mal tapé sous le champ email (useSaisieEmail, FormulaireEmail) : elle se montre après une
 * pause dans la frappe ; un envoi qui ne l’a pas encore montrée la montre au lieu de partir ; « Oui » corrige le champ,
 * « Non » la retire pour cet email. Le bouton du pied d’écran est simulé à côté du formulaire, comme sur /email.
 */
function Champ({ envoyer }: { envoyer: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const saisie = useSaisieEmail(email, setEmail, { probleme: null, oublierProbleme: () => {}, occupe: false, envoyer });
  return (
    <>
      <FormulaireEmail envoi={saisie} />
      <button type="button" onClick={() => void saisie.envoyer()}>
        Recevoir mon code
      </button>
    </>
  );
}

const envoyer = vi.fn<(email: string) => Promise<void>>(async () => {});
const champ = () => screen.getByLabelText("Ton email") as HTMLInputElement;
const taper = (v: string) => fireEvent.change(champ(), { target: { value: v } });
const recevoir = () => act(async () => void fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" })));
const suggestion = () => screen.queryByText(/Tu voulais dire/);
const pause = () => act(() => void vi.advanceTimersByTime(PAUSE_SUGGESTION_MS));

beforeEach(() => {
  vi.useFakeTimers();
  envoyer.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("la suggestion d’un domaine mal tapé", () => {
  it("se montre après une pause dans la frappe, pas à chaque lettre ; « Oui » met l’adresse corrigée dans le champ", async () => {
    render(<Champ envoyer={envoyer} />);
    taper("alex@gmial.com");
    expect(suggestion()).toBeNull();
    await pause();
    expect(suggestion()?.textContent).toBe("Tu voulais dire alex@gmail.com\u00a0?");
    fireEvent.click(screen.getByRole("button", { name: "Oui" }));
    expect(champ().value).toBe("alex@gmail.com");
    expect(suggestion()).toBeNull();
    await recevoir();
    expect(envoyer).toHaveBeenCalledWith("alex@gmail.com");
  });

  it("un envoi avant la pause la montre au lieu de partir ; le second envoi part tel quel (on l’a vue)", async () => {
    render(<Champ envoyer={envoyer} />);
    taper("alex@hotmial.fr");
    await recevoir();
    expect(envoyer).not.toHaveBeenCalled();
    expect(suggestion()?.textContent).toBe("Tu voulais dire alex@hotmail.fr\u00a0?");
    await recevoir();
    expect(envoyer).toHaveBeenCalledWith("alex@hotmial.fr");
  });

  it("« Non » la retire pour cet email : elle ne revient pas, et l’envoi part du premier coup", async () => {
    render(<Champ envoyer={envoyer} />);
    taper("alex@gmail.fr");
    await pause();
    fireEvent.click(screen.getByRole("button", { name: "Non" }));
    expect(suggestion()).toBeNull();
    await pause();
    expect(suggestion()).toBeNull();
    await recevoir();
    expect(envoyer).toHaveBeenCalledWith("alex@gmail.fr");
  });

  it("un domaine bon, ou inconnu mais loin des messageries : rien, l’envoi part tout de suite", async () => {
    render(<Champ envoyer={envoyer} />);
    for (const email of ["alex@gmail.com", "alex@exemple.fr"]) {
      taper(email);
      await pause();
      expect(suggestion()).toBeNull();
      await recevoir();
      expect(envoyer).toHaveBeenLastCalledWith(email);
    }
  });
});
