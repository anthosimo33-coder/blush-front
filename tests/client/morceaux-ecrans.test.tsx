import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoireScreen } from "@/app/importer/histoire/HistoireScreen";
import { ConvOkScreen } from "@/app/importer/ok/ConvOkScreen";
import type { Source, Story } from "@/types";
import { HISTOIRE } from "../aide/rapport-exemple";

/*
 * Une conv en plusieurs morceaux, côté écrans (src/server/morceaux.ts pour le serveur) : la conv reçue, encore trop
 * courte, fait ajouter un morceau ; l’histoire réunie montre ses morceaux, les doublons retirés, et rouvre la feuille
 * « Ajoute un morceau », dont les tuiles mènent aux écrans de l’import en mode ajout. Les prénoms sont inventés.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/importer/ok",
  useSearchParams: () => new URLSearchParams(),
}));

const exportDe = (id: string, messageCount: number, period: string): Source => ({
  id,
  app: "whatsapp",
  mode: "export",
  fileName: "WhatsApp Chat - Elias.zip",
  label: "WhatsApp",
  period,
  messageCount,
});
const captures: Source = { id: "s2", app: "instagram", mode: "captures", screenshotCount: 2, label: "Instagram · 2 captures", period: "20 oct. → 21 oct.", messageCount: 24 };
const participants: Story["participants"] = [
  { id: "p0", name: "Noé", initial: "N" },
  { id: "p1", name: "Elias", initial: "E" },
];

describe("la conv reçue", () => {
  it("encore trop courte : ce qu’il manque, et ajouter un morceau à la place de « Continuer »", async () => {
    const source = exportDe("s1", 30, "4 sept. → 5 sept.");
    render(<ConvOkScreen story={{ ...HISTOIRE, participants, sources: [source], totalMessages: 30, me: undefined }} source={source} ajout />);
    expect(screen.getByText(/il faut au moins 50 messages/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continuer" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ajouter un morceau" }));
    });
    expect(screen.getByRole("dialog").textContent).toContain("Ajoute un morceau");
  });

  it("assez longue : « Continuer » mène à « Qui es-tu ? », la ligne propose d’ajouter un bout", () => {
    const source = exportDe("s1", 64, "4 sept. → 7 sept.");
    render(<ConvOkScreen story={{ ...HISTOIRE, participants, sources: [source], totalMessages: 64, me: undefined }} source={source} ajout />);
    expect(screen.getByRole("link", { name: "Continuer" }).getAttribute("href")).toBe("/qui");
    expect(screen.getByRole("button", { name: /Il manque un bout de votre histoire/ })).toBeTruthy();
  });

  it("sans ajout possible (le mode tournage) : ni la ligne, ni la feuille", () => {
    const source = exportDe("s1", 64, "4 sept. → 7 sept.");
    render(<ConvOkScreen story={{ ...HISTOIRE, participants, sources: [source], totalMessages: 64 }} source={source} ajout={false} />);
    expect(screen.queryByRole("button", { name: /Il manque un bout/ })).toBeNull();
  });
});

describe("l’histoire réunie", () => {
  const story: Story = {
    ...HISTOIRE,
    participants,
    me: undefined,
    other: "p1",
    sources: [exportDe("s1", 30, "4 sept. → 5 sept."), exportDe("s3", 64, "4 sept. → 7 sept."), captures],
    totalMessages: 88,
    durationLabel: "7 semaines",
    duplicatesRemoved: 30,
  };

  it("ses morceaux du plus ancien au plus récent, l’autre nommé, les doublons retirés", () => {
    render(<HistoireScreen story={story} ajout />);
    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText(/messages · 7 semaines · 3 morceaux/)).toBeTruthy();
    expect(screen.getAllByText(/^Avec Elias · /)).toHaveLength(2);
    expect(screen.getByText(/^2 captures · /)).toBeTruthy();
    expect(screen.getByText(/^30 messages en double retirés\s:\sils étaient dans deux morceaux à la fois\.$/)).toBeTruthy();
  });

  it("deux exports seuls : « dans les deux exports » ; un seul doublon, au singulier", () => {
    render(<HistoireScreen story={{ ...story, sources: story.sources.slice(0, 2), duplicatesRemoved: 1 }} ajout />);
    expect(screen.getByText(/^1 message en double retiré\s:\sil était dans les deux exports\.$/)).toBeTruthy();
  });

  it("« Ajouter un autre morceau » ouvre la feuille : les quatre tuiles, vers l’import en mode ajout", async () => {
    render(<HistoireScreen story={story} ajout />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ajouter un autre morceau" }));
    });
    const liens = [...screen.getByRole("navigation", { name: "Ce que tu ajoutes" }).querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(liens).toEqual([
      "/importer/export?app=whatsapp&mode=ajout",
      "/importer/captures?app=imessage&mode=ajout",
      "/importer/export?app=instagram&mode=ajout",
      "/importer/captures?app=autre&mode=ajout",
    ]);
  });

  it("cinq morceaux (ou le mode tournage) : plus de ligne pour en ajouter", () => {
    render(<HistoireScreen story={story} ajout={false} />);
    expect(screen.queryByRole("button", { name: "Ajouter un autre morceau" })).toBeNull();
  });
});
