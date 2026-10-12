import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportScreen } from "@/app/rapport/ReportScreen";
import { LIBELLES_RAPPORT } from "@/contenu/rapport";
import type { Report, SoberReport, Story } from "@/types";
import type { ReportPayload } from "@/types/api";

/*
 * Une alerte de danger (`ReportPayload.alerte`) dans le rapport (src/app/rapport/ReportScreen.tsx) : tant que le rapport
 * doux n’est pas écrit, son attente sobre (AttenteSobre), ni verdict, ni « Partager », ni pastille de l’écriture ; dès
 * que la relecture du rapport apporte `sober`, le rapport doux ; et l’échec de son écriture, dit sans « suite » ni
 * « verdict ». `fixed` : le rapport affiché est celui passé à l’écran, que le test remplace comme le ferait la relecture.
 * Des exemples inventés.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/rapport" }));
/* Les polices de next/font ne se chargent que dans la compilation de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "", className: "" } }));

const story = { id: "histoire-inventee", participants: [], sources: [] } as unknown as Story;
const report = { storyId: "histoire-inventee", chapters: [] } as unknown as Report;
const SOBRE: SoberReport = {
  intro: "On va parler doucement.",
  title: "Ce que tu vis n’est pas normal.",
  facts: "Il revient sans cesse sur tes sorties.",
  reassurance: "Tu n’y es pour rien.",
  steps: ["Parles-en à quelqu’un de confiance."],
  draftLabel: "Si tu veux lui écrire",
  draft: "",
  helpLabel: "Besoin d’en parler à quelqu’un ?",
};

/** Le rapport d’une alerte, le rapport doux pas encore écrit (sauf ce que `p` change). */
const alerte = (p: Partial<ReportPayload> = {}): ReportPayload => ({ report, sober: null, alerte: true, access: "gratuit", generating: true, ...p });
const ecran = (initial: ReportPayload) => <ReportScreen initial={initial} story={story} openPaywall={false} fixed />;

describe("ReportScreen : une alerte de danger", () => {
  it("le rapport doux pas encore écrit : son attente, sans partage ni pastille, puis le rapport doux dès qu’il arrive", async () => {
    const { rerender } = render(ecran(alerte()));
    expect(await screen.findByRole("heading", { name: "Ton rapport arrive." })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("BLUSH l’écrit au calme.");
    expect(screen.queryByText(/Partager/)).toBeNull();
    expect(screen.queryByText(/BLUSH écrit ton rapport/)).toBeNull();
    expect(screen.getByRole("button", { name: LIBELLES_RAPPORT.aide })).toBeTruthy();

    /* La relecture apporte le rapport doux */
    rerender(ecran(alerte({ sober: SOBRE, generating: false })));
    expect(await screen.findByText("Ce que tu vis n’est pas normal.")).toBeTruthy();
    expect(screen.queryByText("Ton rapport arrive.")).toBeNull();
  });

  it("une panne : l’échec à la place de l’attente, qui se relance", async () => {
    render(ecran(alerte({ generating: false, echec: "panne" })));
    expect(await screen.findByRole("heading", { name: "Ton rapport" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Ton rapport n’a pas pu s’écrire.");
    expect(screen.getByRole("button", { name: "Relancer l’écriture" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("un refus du modèle : ni « suite » ni « verdict » (jamais montré sur une alerte), l’aide reste là, rien à relancer", async () => {
    render(ecran(alerte({ generating: false, echec: "refus" })));
    const texte = (await screen.findByText(/BLUSH ne peut pas écrire ce rapport/)).textContent ?? "";
    expect(texte).not.toMatch(/suite|verdict/);
    expect(screen.queryByRole("button", { name: "Relancer l’écriture" })).toBeNull();
    expect(screen.getByRole("button", { name: LIBELLES_RAPPORT.aide })).toBeTruthy();
  });

  it("le budget du jour atteint : l’échec dit qu’il reprendra, sans relance", async () => {
    render(ecran(alerte({ generating: false, echec: "souffle" })));
    expect(await screen.findByText(/l’écriture reprendra quand tu reviendras/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Relancer l’écriture" })).toBeNull();
  });
});
