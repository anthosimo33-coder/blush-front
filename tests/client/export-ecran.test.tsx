import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportScreen } from "@/app/importer/export/ExportScreen";
import { CASE_IMPORT, texteCaseImport } from "@/contenu/consentements";
import { uploadExport } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * L’écran de l’export (src/app/importer/export/ExportScreen.tsx) : l’accord de l’import, sans case (la ligne juste
 * au-dessus du bouton, le geste du bouton le donne ; refusé par le serveur, plus rien ne part), et la vidéo de l’export
 * (VIDEOS_EXPORT, src/contenu/parcours.ts) : sans vidéo, ni bouton ni feuille ; avec, la feuille la joue. L’envoi est
 * simulé, et les adresses des vidéos aussi.
 */
const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/importer/export", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), uploadExport: vi.fn(), prechargerExport: vi.fn() }));
/** Les vidéos de l’export, par appli : null comme aujourd’hui, sauf quand un cas en pose une. */
const videos = vi.hoisted(() => ({ whatsapp: null as string | null, instagram: null as string | null }));
vi.mock("@/contenu/parcours", async (vrai) => ({ ...(await vrai<typeof import("@/contenu/parcours")>()), VIDEOS_EXPORT: videos }));
const envoi = vi.mocked(uploadExport);

beforeEach(() => {
  for (const f of Object.values(routeur)) f.mockReset();
  envoi.mockReset();
  envoi.mockResolvedValue({ id: "s1", app: "whatsapp", mode: "export", fileName: "_chat.txt", label: "WhatsApp", period: "", messageCount: 2 });
  videos.whatsapp = null;
  videos.instagram = null;
});

/** Le fichier qui arrive du choix du système (l’entrée cachée de l’écran). */
const fichierChoisi = () =>
  act(async () => {
    fireEvent.change(screen.getByLabelText("Fichier de la conversation exportée"), { target: { files: [new File(["x"], "_chat.txt", { type: "text/plain" })] } });
  });
const bouton = () => screen.getByRole("button", { name: "Choisir le fichier enregistré" });

describe("l’écran de l’export et l’accord de l’import", () => {
  it("aucune case : la ligne de l’accord juste au-dessus du bouton, qui choisit le fichier ; il part avec la version de l’accord", async () => {
    render(<ExportScreen initialApp="whatsapp" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const ligne = screen.getByText((_, el) => el?.tagName === "P" && el.textContent === texteCaseImport());
    expect(ligne.nextElementSibling).toBe(bouton());
    expect(screen.getByRole("link", { name: CASE_IMPORT.lien }).getAttribute("href")).toBe("/conditions");
    fireEvent.click(bouton());
    await fichierChoisi();
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(envoi.mock.calls[0]?.[1]).toBe(CASE_IMPORT.version);
    expect(routeur.push).toHaveBeenCalledWith("/importer/ok");
  });

  it("refusé par le serveur (une version périmée) : la ligne laisse place au message, et plus rien ne part avant la page rechargée", async () => {
    envoi.mockRejectedValueOnce(new ErreurApi("consentement", 422));
    render(<ExportScreen initialApp="whatsapp" />);
    await fichierChoisi();
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    envoi.mockClear();
    fireEvent.click(bouton());
    await fichierChoisi();
    expect(envoi).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: CASE_IMPORT.recharger }));
  });
});

describe("la vidéo de l’export", () => {
  it("sans vidéo (aujourd’hui) : ni le bouton « Voir la vidéo », ni sa feuille", () => {
    render(<ExportScreen initialApp="whatsapp" />);
    expect(screen.queryByRole("button", { name: /Voir la vidéo/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  it("avec une vidéo pour cette appli : le bouton ouvre la feuille, qui la joue (contrôles, muette au départ, dans la page)", () => {
    videos.whatsapp = "/videos/export-whatsapp.mp4";
    render(<ExportScreen initialApp="whatsapp" />);
    fireEvent.click(screen.getByRole("button", { name: /Voir la vidéo/ }));
    const video = screen.getByRole("dialog").querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/videos/export-whatsapp.mp4");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
  });

  it("une vidéo pour une autre appli seulement : pas de bouton sur celle-ci", () => {
    videos.instagram = "/videos/export-instagram.mp4";
    render(<ExportScreen initialApp="whatsapp" />);
    expect(screen.queryByRole("button", { name: /Voir la vidéo/ })).toBeNull();
  });
});
