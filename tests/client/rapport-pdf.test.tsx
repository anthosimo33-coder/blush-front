import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LienPdfSobre, LienPdfSommaire, LignePdf } from "@/app/rapport/PdfDuRapport";
import * as api from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * « Télécharger en PDF » (src/app/rapport/PdfDuRapport.tsx) : sur ordinateur, le PDF se demande au toucher et
 * s’enregistre ; sur un écran tactile qui sait partager un fichier, il part par la feuille de partage du système, et
 * si elle refuse (le geste trop loin), le toucher suivant l’envoie sans le redemander ; trois points le temps qu’il se
 * dessine, un message clair s’il rate. Le serveur est simulé (vi.mock), comme le navigateur : l’écran tactile
 * (matchMedia), la feuille du système (navigator.share), l’enregistrement (le clic sur un lien de téléchargement).
 */

vi.mock("@/services/api", () => ({ pdfDuRapport: vi.fn() }));

const PDF = new File(["%PDF-1.3"], "rapport-blush.pdf", { type: "application/pdf" });
const RATE = "Le PDF n’a pas pu se préparer. Réessaie dans un instant.";

let tactile = false;
/** Les fichiers enregistrés : le nom de chaque lien de téléchargement cliqué. */
let enregistres: string[] = [];
const partage = vi.fn<(d: ShareData) => Promise<void>>();

beforeEach(() => {
  tactile = false;
  enregistres = [];
  partage.mockReset().mockResolvedValue(undefined);
  vi.mocked(api.pdfDuRapport).mockReset();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({ matches: requete.includes("pointer: coarse") ? tactile : false, media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) enregistres.push(this.download);
  });
  Object.defineProperty(navigator, "share", { configurable: true, value: partage });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: (d: ShareData) => !!d.files?.length });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

/** Une promesse qu’on tient à la main. */
function promesse<T>() {
  let tenir!: (v: T) => void;
  const p = new Promise<T>((ok) => (tenir = ok));
  return { p, tenir };
}

const bouton = () => screen.getByRole("button", { name: /Télécharger en PDF/ });

describe("« Télécharger en PDF »", () => {
  it("sur ordinateur : demandé au toucher, trois points le temps qu’il se dessine, puis enregistré sous rapport-blush.pdf", async () => {
    const attente = promesse<File>();
    vi.mocked(api.pdfDuRapport).mockReturnValue(attente.p);
    render(<LignePdf />);
    expect(screen.getByText("Ton rapport, à garder ou à imprimer")).toBeTruthy();
    fireEvent.click(bouton());
    expect(bouton().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("BLUSH met ton rapport en pages…")).toBeTruthy();
    /* Un second toucher pendant le dessin ne redemande rien */
    fireEvent.click(bouton());
    expect(api.pdfDuRapport).toHaveBeenCalledTimes(1);
    await act(async () => attente.tenir(PDF));
    expect(await screen.findByText("PDF enregistré.")).toBeTruthy();
    expect(enregistres).toEqual(["rapport-blush.pdf"]);
    expect(bouton().hasAttribute("aria-busy")).toBe(false);
    /* Sur ordinateur, jamais la feuille du système, même si le navigateur en a une */
    expect(partage).not.toHaveBeenCalled();
  });

  it("s’il rate : un message clair, et le toucher suivant le redemande ; trop demandé aujourd’hui : demain", async () => {
    vi.mocked(api.pdfDuRapport).mockRejectedValueOnce(new ErreurApi("erreur", 500)).mockRejectedValueOnce(new ErreurApi("trop", 429)).mockResolvedValueOnce(PDF);
    render(<LignePdf />);
    fireEvent.click(bouton());
    expect((await screen.findByRole("alert")).textContent).toBe(RATE);
    expect(bouton().hasAttribute("aria-busy")).toBe(false);
    fireEvent.click(bouton());
    expect((await screen.findByText("Assez de PDF pour aujourd’hui. Réessaie demain.")).getAttribute("role")).toBe("alert");
    fireEvent.click(bouton());
    expect(await screen.findByText("PDF enregistré.")).toBeTruthy();
    expect(api.pdfDuRapport).toHaveBeenCalledTimes(3);
    expect(enregistres).toEqual(["rapport-blush.pdf"]);
  });

  it("sur un écran tactile : il part par la feuille de partage du système, sans s’enregistrer", async () => {
    tactile = true;
    vi.mocked(api.pdfDuRapport).mockResolvedValue(PDF);
    render(<LignePdf />);
    fireEvent.click(bouton());
    await waitFor(() => expect(partage).toHaveBeenCalledWith({ files: [PDF] }));
    expect(enregistres).toEqual([]);
    expect(screen.queryByText("PDF enregistré.")).toBeNull();
  });

  it("sur un écran tactile, la feuille refusée (le geste trop loin) : le PDF est gardé, le toucher suivant l’envoie aussitôt", async () => {
    tactile = true;
    vi.mocked(api.pdfDuRapport).mockResolvedValue(PDF);
    partage.mockRejectedValueOnce(new DOMException("trop tard", "NotAllowedError"));
    render(<LignePdf />);
    fireEvent.click(bouton());
    expect(await screen.findByText(/^Ton PDF est prêt\s: touche encore pour l’envoyer\.$/)).toBeTruthy();
    fireEvent.click(bouton());
    await waitFor(() => expect(partage).toHaveBeenCalledTimes(2));
    expect(api.pdfDuRapport).toHaveBeenCalledTimes(1);
    expect(enregistres).toEqual([]);
  });

  it("dans le sommaire de l’ordinateur et dans le rapport doux : le même geste", async () => {
    vi.mocked(api.pdfDuRapport).mockResolvedValue(PDF);
    render(
      <>
        <LienPdfSommaire />
        <LienPdfSobre />
      </>,
    );
    const [sommaire, sobre] = screen.getAllByRole("button", { name: /Télécharger en PDF/ });
    fireEvent.click(sommaire!);
    expect(await screen.findByText("PDF enregistré.")).toBeTruthy();
    fireEvent.click(sobre!);
    await waitFor(() => expect(screen.getAllByText("PDF enregistré.")).toHaveLength(2));
    expect(enregistres).toEqual(["rapport-blush.pdf", "rapport-blush.pdf"]);
  });
});
