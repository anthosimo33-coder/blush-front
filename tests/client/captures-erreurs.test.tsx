import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapturesScreen } from "@/app/importer/captures/CapturesScreen";
import { SOUFFLE } from "@/lib/messages-erreur";
import { uploadScreenshots } from "@/services/api";
import { ErreurApi, type CodeApi } from "@/types/erreurs-api";

/*
 * L’écran des captures (src/app/importer/captures/CapturesScreen.tsx) quand la lecture échoue. Seuls les codes du
 * parcours (la conv trop courte, de groupe, la vidéo) et « capture » (rien de lisible) ouvrent l’écran d’erreur
 * (?erreur=<code>, « Cette capture est illisible ») ; un refus de l’IA, une panne, une limite, le budget du jour, une
 * réponse sans code (un 504) ou le réseau se disent sur l’écran (MESSAGES.captures), et les captures restent là.
 * L’envoi est simulé ; le Worker des vignettes aussi. Les textes se lisent comme à l’écran : la recherche par texte
 * ramène l’insécable à une espace.
 */
const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/importer/captures", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), uploadScreenshots: vi.fn(), prechargerVideo: vi.fn() }));
vi.mock("@/services/preparer-captures", () => ({ prereduire: vi.fn(), vignette: vi.fn(async () => null) }));
const envoi = vi.mocked(uploadScreenshots);

beforeEach(() => {
  for (const f of Object.values(routeur)) f.mockReset();
  envoi.mockReset();
  /* La barre de la lecture s’anime (BarreLecture) ; happy-dom rejette la promesse d’une animation annulée, que personne n’attend */
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(() => new Animation());
});

const erreur = (code: CodeApi, status: number) => new ErreurApi(code, status);

/** L’écran avec deux captures choisies, puis « Continuer » touché alors que l’envoi échoue sur `e`. */
async function continuerAvec(e: unknown) {
  envoi.mockRejectedValue(e);
  render(<CapturesScreen app="hinge" addMode={false} />);
  const png = (nom: string) => new File(["png"], nom, { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Captures d’écran de la conversation"), { target: { files: [png("1.png"), png("2.png")] } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  });
}

describe("l’import de captures en échec", () => {
  it.each([
    ["capture", erreur("capture", 422)],
    ["courte", erreur("courte", 422)],
    ["groupe", erreur("groupe", 422)],
    ["video", erreur("video", 422)],
  ])("« %s » : la conv ou les captures en cause, l’écran d’erreur prévu", async (code, e) => {
    await continuerAvec(e);
    expect(routeur.replace).toHaveBeenCalledWith(`/importer/captures?app=hinge&erreur=${code}`, { scroll: false });
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it.each([
    ["un refus de l’IA", erreur("refus", 502), "BLUSH ne peut pas lire ces captures. Essaie avec d’autres."],
    ["une panne", erreur("panne", 502), "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie."],
    ["un 504 sans code", erreur("erreur", 504), "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie."],
    ["la limite du jour", erreur("trop", 429), "BLUSH a lu beaucoup de captures d’un coup : réessaie un peu plus tard. Tes captures restent là."],
    ["le budget de l’IA", erreur("souffle", 503), `${SOUFFLE} Tes captures restent là.`],
    ["le réseau", new TypeError("Failed to fetch"), "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie."],
  ])("%s : un message sur l’écran, les captures restent là, pas d’écran « illisible »", async (_, e, message) => {
    await continuerAvec(e);
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture 2 sur 2" })).toBeTruthy();
    /* On peut réessayer */
    expect(screen.getByRole("button", { name: "Continuer" }).hasAttribute("disabled")).toBe(false);
  });

  it("sans session (401) : la connexion, puis retour sur les captures", async () => {
    await continuerAvec(erreur("connexion", 401));
    expect(routeur.push).toHaveBeenCalledWith(expect.stringMatching(/^\/connexion\?suite=%2Fimporter%2Fcaptures%3Fapp%3Dhinge$/));
    expect(routeur.replace).not.toHaveBeenCalled();
  });
});

describe("ce que l’écran des captures dit d’abord", () => {
  it("Instagram s’exporte : l’écran ne dit pas le contraire ; Hinge ne s’exporte pas, il le dit", () => {
    const { unmount } = render(<CapturesScreen app="instagram" addMode={false} />);
    expect(screen.queryByText(/ne permett?(ent)? pas d’exporter/)).toBeNull();
    expect(screen.getByText("Les captures suffisent aussi : on reconnaît les messages, les dates et qui parle.")).toBeTruthy();
    unmount();
    render(<CapturesScreen app="hinge" addMode={false} />);
    expect(screen.getByText("Hinge ne permet pas d’exporter : les captures suffisent. On reconnaît les messages, les dates et qui parle.")).toBeTruthy();
  });

  it("iMessage : « Comment filmer » est une carte, sa liste hors de tout bouton, et son titre un vrai bouton", () => {
    render(<CapturesScreen app="imessage" addMode={false} />);
    const etapes = screen.getByText("Ouvre votre conv dans Messages").closest("ol");
    expect(etapes).not.toBeNull();
    expect(etapes?.closest("button")).toBeNull();
    expect(etapes?.querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Enregistre ton écran" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Choisir mon enregistrement" })).toHaveLength(1);
  });
});
