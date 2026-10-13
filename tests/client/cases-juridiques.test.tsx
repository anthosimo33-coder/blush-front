import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MentionImport, MentionRenonciation, useAccord } from "@/components/juridique/cases";
import { CASE_IMPORT, CASE_RENONCIATION, texteCaseImport, texteRenonciation, type AchatImmediat } from "@/contenu/consentements";

/*
 * Les accords que la loi demande (src/components/juridique/cases.tsx), sans case à cocher : une ligne les dit près du
 * bouton, et le geste du bouton les donne. Refusés par le serveur (une version périmée), plus rien ne part avant la page
 * rechargée.
 */

/** Un écran réduit à la ligne de son accord et à son bouton ; « Refus du serveur » simule une version périmée. */
function Ecran({ envoyer, quoi }: { envoyer: () => void; quoi?: AchatImmediat }) {
  const accord = useAccord();
  return (
    <>
      {!quoi && <MentionImport etat={accord} />}
      <button type="button" onClick={() => accord.exiger() && envoyer()}>
        Avancer
      </button>
      {quoi && <MentionRenonciation etat={accord} quoi={quoi} />}
      <button type="button" onClick={accord.perimer}>
        Refus du serveur
      </button>
    </>
  );
}

describe("la ligne de l’accord de l’import", () => {
  it("dit les conditions (dans un autre onglet) et toute la conv ; aucune case, le bouton avance au premier toucher", () => {
    const envoyer = vi.fn();
    render(<Ecran envoyer={envoyer} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === texteCaseImport())).toBeTruthy();
    const lien = screen.getByRole("link", { name: CASE_IMPORT.lien });
    expect(lien.getAttribute("href")).toBe("/conditions");
    expect(lien.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: "Avancer" }));
    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});

describe("la ligne de la renonciation au délai de rétractation", () => {
  it.each(["rapport", "bulles"] as const)("%s : son texte sous le bouton, son lien vers les conditions ; aucune case, le bouton paie au premier toucher", (quoi) => {
    const payer = vi.fn();
    render(<Ecran envoyer={payer} quoi={quoi} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const bouton = screen.getByRole("button", { name: "Avancer" });
    expect(bouton.nextElementSibling?.textContent).toBe(texteRenonciation(quoi));
    const lien = screen.getByRole("link", { name: CASE_RENONCIATION.lien });
    expect(lien.getAttribute("href")).toBe("/conditions#livraison");
    fireEvent.click(bouton);
    expect(payer).toHaveBeenCalledTimes(1);
  });

  it("dit le rapport ou les bulles, tout de suite, et le délai de rétractation auquel on renonce", () => {
    expect(texteRenonciation("rapport")).toBe("En payant, tu as ton rapport tout de suite et tu renonces au délai de rétractation.");
    expect(texteRenonciation("bulles")).toBe("En payant, tu as tes bulles tout de suite et tu renonces au délai de rétractation.");
  });
});

describe("un accord refusé par le serveur (une version périmée)", () => {
  it.each([undefined, "rapport", "bulles"] as const)("%s : la ligne laisse place au message, rien ne repart, le focus va au rechargement, qui recharge la page", (quoi) => {
    const envoyer = vi.fn();
    render(<Ecran envoyer={envoyer} quoi={quoi} />);
    fireEvent.click(screen.getByRole("button", { name: "Refus du serveur" }));
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    expect(screen.queryByRole("link")).toBeNull();
    /*
     * Rien ne repart : l’onglet n’a que l’ancien texte et l’ancienne version (le code du navigateur date de l’ouverture
     * de la page), que le serveur refuserait encore, sans fin
     */
    fireEvent.click(screen.getByRole("button", { name: "Avancer" }));
    expect(envoyer).not.toHaveBeenCalled();
    const recharger = screen.getByRole("button", { name: CASE_IMPORT.recharger });
    expect(document.activeElement).toBe(recharger);
    /* Le bouton du message recharge la page : le nouveau texte et sa version arrivent avec elle */
    const recharge = vi.fn();
    const avant = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...avant, reload: recharge } });
    try {
      fireEvent.click(recharger);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: avant });
    }
    expect(recharge).toHaveBeenCalledTimes(1);
  });
});
