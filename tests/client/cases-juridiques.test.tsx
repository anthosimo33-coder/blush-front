import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseImport, CaseRenonciation, useCase } from "@/components/juridique/cases";
import { CASE_IMPORT, CASE_RENONCIATION, type AchatImmediat } from "@/contenu/consentements";

/*
 * Les cases que la loi demande (src/components/juridique/cases.tsx) : jamais cochées d’avance, et le geste qui avance
 * (choisir le fichier, payer) ne part pas sans elles. La case de la renonciation est testée seule : la feuille du
 * paiement qui la posera (les écrans des bulles) n’est pas encore là.
 */

/** Une feuille du paiement réduite à sa case et à son bouton, comme la posera la feuille « Ta formule » ou la recharge. */
function Paiement({ quoi, payer }: { quoi: AchatImmediat; payer: () => void }) {
  const renonciation = useCase();
  return (
    <>
      <CaseRenonciation etat={renonciation} quoi={quoi} />
      <button type="button" onClick={() => renonciation.exiger() && payer()}>
        Payer
      </button>
    </>
  );
}

/** Un écran de l’import réduit à sa case et à son bouton ; `perimee` simule le refus du serveur (une version périmée). */
function Import({ envoyer }: { envoyer: () => void }) {
  const accord = useCase();
  return (
    <>
      <CaseImport etat={accord} />
      <button type="button" onClick={() => accord.exiger() && envoyer()}>
        Choisir le fichier
      </button>
      <button type="button" onClick={accord.perimer}>
        Refus du serveur
      </button>
    </>
  );
}

describe("la case de la renonciation au droit de rétractation", () => {
  it.each(["rapport", "bulles"] as const)("%s : son texte, décochée d’avance ; le bouton ne paie qu’une fois cochée", (quoi) => {
    const payer = vi.fn();
    render(<Paiement quoi={quoi} payer={payer} />);
    const caseACocher = screen.getByRole("checkbox", { name: CASE_RENONCIATION.textes[quoi] });
    expect((caseACocher as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Payer" }));
    expect(payer).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(CASE_RENONCIATION.manquante);
    expect(caseACocher.getAttribute("aria-invalid")).toBe("true");
    expect(caseACocher.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    /* Le focus va à la case : le lecteur d’écran la lit, avec son message */
    expect(document.activeElement).toBe(caseACocher);

    fireEvent.click(caseACocher);
    expect((caseACocher as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(caseACocher.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Payer" }));
    expect(payer).toHaveBeenCalledTimes(1);

    /* Décochée de nouveau : le bouton ne paie plus */
    fireEvent.click(caseACocher);
    fireEvent.click(screen.getByRole("button", { name: "Payer" }));
    expect(payer).toHaveBeenCalledTimes(1);
  });

  it("tout son texte la coche (le libellé), pas seulement le carré", () => {
    render(<Paiement quoi="rapport" payer={() => {}} />);
    fireEvent.click(screen.getByText(CASE_RENONCIATION.textes.rapport));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
});

describe("la case de l’import", () => {
  it("dit les 18 ans, les conditions (dans un autre onglet) et l’intime ; rien ne part sans elle", () => {
    const envoyer = vi.fn();
    render(<Import envoyer={envoyer} />);
    const caseACocher = screen.getByRole("checkbox", { name: /^J’ai 18 ans ou plus\. J’accepte les conditions\s?, et que BLUSH analyse cette conv/ });
    expect((caseACocher as HTMLInputElement).checked).toBe(false);
    const lien = screen.getByRole("link", { name: CASE_IMPORT.lien });
    expect(lien.getAttribute("href")).toBe("/conditions");
    expect(lien.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: "Choisir le fichier" }));
    expect(envoyer).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(CASE_IMPORT.manquante);

    fireEvent.click(caseACocher);
    fireEvent.click(screen.getByRole("button", { name: "Choisir le fichier" }));
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("refusée par le serveur (une version périmée) : elle se décoche, et rien ne repart avant la page rechargée", () => {
    const envoyer = vi.fn();
    render(<Import envoyer={envoyer} />);
    const caseACocher = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(caseACocher);
    fireEvent.click(screen.getByRole("button", { name: "Refus du serveur" }));
    expect(caseACocher.checked).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    /*
     * Recochée, elle ne laisse rien partir : l’onglet n’a que l’ancien texte et l’ancienne version (le code du navigateur
     * date de l’ouverture de la page), que le serveur refuserait encore, sans fin
     */
    fireEvent.click(caseACocher);
    expect(caseACocher.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Choisir le fichier" }));
    expect(envoyer).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    expect(document.activeElement).toBe(caseACocher);
    /* Le bouton du message recharge la page : le nouveau texte et sa version arrivent avec elle */
    const recharger = vi.fn();
    const avant = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...avant, reload: recharger } });
    try {
      fireEvent.click(screen.getByRole("button", { name: CASE_IMPORT.recharger }));
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: avant });
    }
    expect(recharger).toHaveBeenCalledTimes(1);
  });
});
