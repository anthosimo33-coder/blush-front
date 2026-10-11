import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactContext, FilDeLaConv } from "@/app/app/accueil/bulles";
import type { HomeContact } from "@/app/app/accueil/contact";
import type { Msg } from "@/app/app/accueil/conv/modele";
import { MotionContext } from "@/app/app/accueil/mouvement/contexte";
import { copyText } from "@/lib/hooks";

/*
 * Les bulles de la conv de l’accueil (src/app/app/accueil/bulles.tsx), sans l’accueil autour : ce que chaque message
 * montre, et ce qu’on y touche (copier la réponse à envoyer, « Réessayer », « Partager », l’historique plus ancien)
 * remonte à l’accueil. Les sons sont muets, et la copie répond ce que le test lui dit.
 */
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/lib/hooks", async (vrai) => ({ ...(await vrai<typeof import("@/lib/hooks")>()), copyText: vi.fn() }));
const copier = vi.mocked(copyText);

afterEach(() => {
  copier.mockReset();
  vi.useRealTimers();
});

const CONTACT: HomeContact = {
  report: { verdict: { emoji: "🤏", short: "À deux doigts", title: "Elle hésite encore", subtitle: "Un pas de plus" }, level: "dit", trend: "En hausse", nextStep: "Propose-lui un verre" },
  fiche: { person: { id: "p1", name: "Maëlys", initial: "M", pronoun: "il" }, summaryShort: "Son exam jeudi" },
  period: "4 sept. → 7 sept.",
};

/* Une heure fixe (le 10 octobre 2026, 18 h) : les messages s’y posent, l’écran est ouvert juste après */
const A = new Date(2026, 9, 10, 18, 0).getTime();

type Props = ComponentProps<typeof FilDeLaConv>;

function monter(msgs: Msg[], plus: Partial<Props> = {}) {
  const props: Props = {
    threadRef: createRef<HTMLDivElement>(),
    hautRef: createRef<HTMLDivElement>(),
    msgs,
    opened: A + 60_000,
    depuis: 1,
    plus: false,
    anciens: false,
    chargerAnciens: vi.fn(async () => {}),
    partager: vi.fn(),
    relancer: vi.fn(),
    ...plus,
  };
  render(
    <ContactContext value={CONTACT}>
      <MotionContext value={{ arriving: false }}>
        <FilDeLaConv {...props} />
      </MotionContext>
    </ContactContext>,
  );
  return { props, fil: screen.getByRole("log", { name: "Ta conv avec BLUSH" }) };
}

describe("les bulles de la conv de l’accueil", () => {
  it("ta question : son texte, et le point creusé rappelé au-dessus", () => {
    const { fil } = monter([{ type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", about: "Elle hésite encore", at: A }]);
    expect(within(fil).getByText("je lui dis quoi ?")).toBeTruthy();
    expect(within(fil).getByText("Elle hésite encore")).toBeTruthy();
    /* Le jour en tête de la conv, puis l’heure du groupe sous la bulle */
    expect([...fil.querySelectorAll("time")].map((t) => t.textContent)).toEqual(["Aujourd’hui 18:00", "18:00"]);
  });

  it("un export : son nom et sa taille à la française", () => {
    const { fil } = monter([
      { type: "fichier", id: 1, from: "toi", file: { name: "WhatsApp Chat.zip", size: 340 * 1024 }, at: A },
      { type: "fichier", id: 2, from: "toi", file: { name: "_chat.txt", size: 2.4 * 1024 * 1024 }, at: A },
    ]);
    expect(within(fil).getByText("340 ko")).toBeTruthy();
    expect(within(fil).getByText("2,4 Mo")).toBeTruthy();
  });

  it("des captures : les quatre premières, et combien d’autres sur la dernière", () => {
    const images = ["a", "b", "c", "d", "e", "f"].map((n) => `blob:${n}`);
    const { fil } = monter([{ type: "images", id: 1, from: "toi", images, at: A }]);
    expect(within(fil).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual(["Capture 1", "Capture 2", "Capture 3", "Capture 4"]);
    expect(within(fil).getByText("+2")).toBeTruthy();
  });

  it("une réponse de BLUSH : ses bulles, la réponse à envoyer qui se copie en un geste, et « Partager » son échange", async () => {
    const { props, fil } = monter([
      { type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", at: A },
      { type: "reponse", id: 2, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "il attend que tu relances" }], send: ["t’es dispo jeudi ?", "j’ai un plan"], why: "Court et léger.", echange: 1 }, at: A },
    ]);
    expect(within(fil).getByText("il attend que tu relances")).toBeTruthy();
    expect(within(fil).getByText("Ta meilleure réponse")).toBeTruthy();
    expect(within(fil).getByText("Court et léger.")).toBeTruthy();

    copier.mockResolvedValue(true);
    vi.useFakeTimers();
    await act(async () => fireEvent.click(within(fil).getByRole("button", { name: "Copier" })));
    expect(copier).toHaveBeenCalledExactlyOnceWith("t’es dispo jeudi ?\nj’ai un plan");
    expect(within(fil).getByRole("button", { name: "Copié" })).toBeTruthy();
    /* « Copié » deux secondes, puis la pastille revient */
    act(() => void vi.advanceTimersByTime(2000));
    expect(within(fil).getByRole("button", { name: "Copier" })).toBeTruthy();

    fireEvent.click(within(fil).getByRole("button", { name: "Partager" }));
    expect(props.partager).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("une copie refusée par le navigateur : la pastille ne dit pas « Copié »", async () => {
    copier.mockResolvedValue(false);
    const { fil } = monter([{ type: "reponse", id: 2, from: "blush", result: { kind: "bubbles", bubbles: [], send: ["t’es dispo ?"] }, at: A }]);
    await act(async () => fireEvent.click(within(fil).getByRole("button", { name: "Copier" })));
    expect(within(fil).queryByRole("button", { name: "Copié" })).toBeNull();
  });

  it("une réponse coupée par le réseau : ce qui est arrivé reste, et « Réessayer » relance cette réponse", () => {
    const { props, fil } = monter([
      { type: "texte", id: 1, from: "toi", text: "et là ?", at: A },
      { type: "ecrit", id: 2, from: "blush", reading: "BLUSH analyse sa réponse", recues: [{ text: "alors déjà" }], coupee: true, at: A },
    ]);
    expect(within(fil).getByText("alors déjà")).toBeTruthy();
    expect(within(fil).getByText("j’ai eu un bug, renvoie-moi ça")).toBeTruthy();
    fireEvent.click(within(fil).getByRole("button", { name: "Réessayer" }));
    expect(props.relancer).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("l’intro : « il vient de répondre ? » d’après son pronom, et un niveau franchi pendant la visite", () => {
    const { fil } = monter([
      { type: "intro", id: -1, from: "blush", intro: "hint", at: A },
      { type: "niveau", id: 1, from: "event", level: "ensemble", at: A },
    ]);
    expect(within(fil).getByText(/^Il vient de répondre/)).toBeTruthy();
    expect(within(fil).getByText("On est ensemble")).toBeTruthy();
    expect(within(fil).getByText(/Nouveau niveau/)).toBeTruthy();
  });

  it("l’historique plus ancien : un toucher le charge", () => {
    const { props } = monter([{ type: "texte", id: 1, from: "toi", text: "salut", at: A }], { plus: true });
    fireEvent.click(screen.getByRole("button", { name: "Voir les messages plus anciens" }));
    expect(props.chargerAnciens).toHaveBeenCalledOnce();
  });

  it("l’historique plus ancien, pendant qu’il arrive : les trois points le disent, plus de bouton", () => {
    monter([{ type: "texte", id: 1, from: "toi", text: "salut", at: A }], { plus: true, anciens: true });
    expect(screen.getByRole("status", { name: "Chargement des messages plus anciens" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Voir les messages plus anciens" })).toBeNull();
  });

  it("tout l’historique est là : ni bouton ni points en haut", () => {
    monter([{ type: "texte", id: 1, from: "toi", text: "salut", at: A }]);
    expect(screen.queryByRole("button", { name: "Voir les messages plus anciens" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Chargement des messages plus anciens" })).toBeNull();
  });
});
