import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOUFFLE } from "@/lib/messages-erreur";
import { getAnalysisProgress, resumeAnalysis } from "@/services/api";
import type { AnalysisProgress } from "@/types";
import { LectureScreen } from "@/app/lecture/LectureScreen";

/*
 * L’écran de lecture (src/app/lecture/LectureScreen.tsx) à l’arrivée : il lit où en est la lecture avant de la relancer.
 * Arrêtée par le budget de l’IA du jour (« souffle »), il le dit sans bouton et ne la relance pas (une relance du jour
 * usée, une lecture planifiée pour rien) : le suivi la reprend après minuit. Le serveur est simulé.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), getAnalysisProgress: vi.fn(), resumeAnalysis: vi.fn() }));
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));

const suivi = vi.mocked(getAnalysisProgress);
const relance = vi.mocked(resumeAnalysis);
const arretee = (failReason: AnalysisProgress["failReason"]): AnalysisProgress => ({
  progress: 0.1,
  messagesRead: 0,
  stepsDone: 0,
  discoveries: [],
  done: false,
  failed: true,
  failReason,
});

beforeEach(() => {
  suivi.mockReset();
  relance.mockReset();
  relance.mockResolvedValue(undefined);
});

describe("l’écran de lecture, à l’arrivée", () => {
  it("arrêtée par le budget de l’IA du jour : « BLUSH souffle un peu », sans bouton, et sans relancer la lecture", async () => {
    suivi.mockResolvedValue(arretee("souffle"));
    render(<LectureScreen total={120} />);
    expect(await screen.findByRole("heading", { level: 1, name: SOUFFLE })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Relancer la lecture" })).toBeNull();
    expect(relance).not.toHaveBeenCalled();
  });

  it("arrêtée par une panne : la lecture est relancée, comme avant", async () => {
    suivi.mockResolvedValueOnce(arretee("panne")).mockResolvedValue({ progress: 0.2, messagesRead: 10, stepsDone: 1, discoveries: [], done: false });
    render(<LectureScreen total={120} />);
    await waitFor(() => expect(relance).toHaveBeenCalledTimes(1));
  });
});
