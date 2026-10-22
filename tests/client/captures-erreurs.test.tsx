import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapturesScreen } from "@/app/importer/captures/CapturesScreen";
import { CASE_IMPORT } from "@/contenu/consentements";
import { SOUFFLE } from "@/lib/messages-erreur";
import { prechargerVideo, uploadScreenshots } from "@/services/api";
import { ErreurApi, type CodeApi } from "@/types/erreurs-api";
import { HISTOIRE } from "../aide/rapport-exemple";

/*
 * L’écran des captures (src/app/importer/captures/CapturesScreen.tsx) quand la lecture échoue. Seuls les codes du
 * parcours (la conv trop courte, de groupe, la vidéo), « capture » et « fichier » (rien de lisible) ouvrent l’écran d’erreur
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
  vi.mocked(prechargerVideo).mockReset();
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
  /* Pas de case : « Continuer » donne l’accord de l’import (src/components/juridique/cases.tsx) */
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  });
}

describe("l’import de captures en échec", () => {
  it.each([
    ["capture", erreur("capture", 422), "capture"],
    /* Des images refusées, ou une sortie du modèle illisible (src/server/captures.ts) : rien ne s’est lu non plus */
    ["fichier", erreur("fichier", 422), "capture"],
    ["courte", erreur("courte", 422), "courte"],
    ["groupe", erreur("groupe", 422), "groupe"],
    ["video", erreur("video", 422), "video"],
  ])("« %s » : la conv ou les captures en cause, l’écran d’erreur prévu", async (_, e, ecran) => {
    await continuerAvec(e);
    expect(routeur.replace).toHaveBeenCalledWith(`/importer/captures?app=hinge&erreur=${ecran}`, { scroll: false });
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

  it("l’accord refusé par le serveur (une version périmée) : la ligne demande de recharger la page, les captures restent là", async () => {
    await continuerAvec(erreur("consentement", 422));
    /* L’envoi portait la version de l’accord */
    expect(envoi.mock.calls[0]?.[1]).toMatchObject({ consentement: CASE_IMPORT.version });
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    const recharger = screen.getByRole("button", { name: CASE_IMPORT.recharger });
    expect(screen.getByRole("button", { name: "Capture 2 sur 2" })).toBeTruthy();
    /* « Continuer » n’envoie plus rien : la même version périmée serait refusée de nouveau, sans fin. Le focus va au rechargement */
    envoi.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    });
    expect(envoi).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    expect(document.activeElement).toBe(recharger);
  });

  it("aucune case à cocher : la ligne de l’accord, juste au-dessus du bouton, et « Continuer » envoie avec sa version", async () => {
    const source = { id: "s1", app: "hinge", mode: "captures", screenshotCount: 1, label: "Hinge", period: "", messageCount: 2 } as const;
    envoi.mockResolvedValue({ source, messagesRead: 2, story: { ...HISTOIRE, sources: [source] } });
    render(<CapturesScreen app="hinge" addMode={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const ligne = screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "En continuant, tu acceptes les conditions et que BLUSH lise toute ta conv.");
    expect(screen.getByRole("link", { name: "conditions" }).getAttribute("href")).toBe("/conditions");
    /* Juste au-dessus du bouton */
    expect(ligne.nextElementSibling?.textContent).toBe("Choisir mes captures");
    fireEvent.change(screen.getByLabelText("Captures d’écran de la conversation"), { target: { files: [new File(["png"], "1.png", { type: "image/png" })] } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    });
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(envoi.mock.calls[0]?.[1]).toMatchObject({ consentement: CASE_IMPORT.version });
  });

  it("sans session (401) : la connexion, puis retour sur les captures", async () => {
    await continuerAvec(erreur("connexion", 401));
    expect(routeur.push).toHaveBeenCalledWith(expect.stringMatching(/^\/connexion\?suite=%2Fimporter%2Fcaptures%3Fapp%3Dhinge$/));
    expect(routeur.replace).not.toHaveBeenCalled();
  });
});

describe("ce que l’écran des captures dit d’abord", () => {
  it("Instagram s’exporte : l’écran ne dit pas le contraire ; Hinge ne s’exporte pas, il le dit ; « Captures ou vidéo » : n’importe quelle appli", () => {
    const { unmount } = render(<CapturesScreen app="instagram" addMode={false} />);
    expect(screen.queryByText(/ne permett?(ent)? pas d’exporter/)).toBeNull();
    expect(screen.getByText("Les captures suffisent aussi : on reconnaît les messages, les dates et qui parle.")).toBeTruthy();
    unmount();
    render(<CapturesScreen app="hinge" addMode={false} />);
    expect(screen.getByText("Hinge ne permet pas d’exporter : les captures suffisent. On reconnaît les messages, les dates et qui parle.")).toBeTruthy();
    cleanup();
    /* La tuile « Captures ou vidéo » : n’importe quelle appli, Instagram et WhatsApp compris, sans rien dire de leur export */
    render(<CapturesScreen app="autre" addMode={false} />);
    expect(screen.queryByText(/ne permett?(ent)? pas d’exporter/)).toBeNull();
    expect(screen.getByText("Des captures de n’importe quelle appli suffisent : on reconnaît les messages, les dates et qui parle.")).toBeTruthy();
  });

  it("iMessage : « Comment filmer » est une carte, sa liste hors de tout bouton, et la carte un bouton nommé comme celui du pied", () => {
    render(<CapturesScreen app="imessage" addMode={false} />);
    const etapes = screen.getByText("Ouvre votre conv dans Messages").closest("ol");
    expect(etapes).not.toBeNull();
    expect(etapes?.closest("button")).toBeNull();
    expect(etapes?.querySelectorAll("li")).toHaveLength(4);
    /* La carte ne filme rien : elle ouvre le choix de la vidéo, comme le bouton du pied d’écran, et porte son nom */
    expect(screen.queryByRole("button", { name: "Enregistre ton écran" })).toBeNull();
    const boutons = screen.getAllByRole("button", { name: "Choisir mon enregistrement" });
    expect(boutons).toHaveLength(2);
    expect(boutons[0]?.closest("ol")).toBeNull();
    /* Toucher la carte charge déjà l’extraction de la vidéo, comme le bouton du pied */
    fireEvent.click(boutons[0]!);
    expect(prechargerVideo).toHaveBeenCalledTimes(1);
  });
});
