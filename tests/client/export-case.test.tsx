import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportScreen } from "@/app/importer/export/ExportScreen";
import { CASE_IMPORT } from "@/contenu/consentements";
import { uploadExport } from "@/services/api";

/*
 * La case de l’import sur l’écran de l’export (src/app/importer/export/ExportScreen.tsx) : l’export ne part qu’avec elle
 * cochée au moment où le fichier arrive, pas seulement à l’ouverture du choix du fichier. L’envoi est simulé.
 */
const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/importer/export", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), uploadExport: vi.fn(), prechargerExport: vi.fn() }));
const envoi = vi.mocked(uploadExport);

beforeEach(() => {
  for (const f of Object.values(routeur)) f.mockReset();
  envoi.mockReset();
  envoi.mockResolvedValue({ id: "s1", app: "whatsapp", mode: "export", fileName: "_chat.txt", label: "WhatsApp", period: "", messageCount: 2 });
});

const caseImport = () => screen.getByRole("checkbox", { name: /^J’ai 18 ans ou plus/ }) as HTMLInputElement;
/** Le fichier qui arrive du choix du système (l’entrée cachée de l’écran). */
const fichierChoisi = () =>
  act(async () => {
    fireEvent.change(screen.getByLabelText("Fichier de la conversation exportée"), { target: { files: [new File(["x"], "_chat.txt", { type: "text/plain" })] } });
  });

describe("l’écran de l’export et sa case", () => {
  it("cochée : le fichier part, avec la version de la case", async () => {
    render(<ExportScreen initialApp="whatsapp" />);
    fireEvent.click(caseImport());
    fireEvent.click(screen.getByRole("button", { name: "Choisir le fichier enregistré" }));
    await fichierChoisi();
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(envoi.mock.calls[0]?.[1]).toBe(CASE_IMPORT.version);
  });

  it("décochée pendant que le choix du fichier était ouvert : le fichier ne part pas, et la case le dit", async () => {
    render(<ExportScreen initialApp="whatsapp" />);
    fireEvent.click(caseImport());
    fireEvent.click(screen.getByRole("button", { name: "Choisir le fichier enregistré" }));
    fireEvent.click(caseImport());
    await fichierChoisi();
    expect(envoi).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(CASE_IMPORT.manquante);
    expect(document.activeElement).toBe(caseImport());
  });
});
