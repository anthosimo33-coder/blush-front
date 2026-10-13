import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactContext, CreditContext, FilDeLaConv } from "@/app/app/accueil/bulles";
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
  report: {
    verdict: { emoji: "🤏", short: "À deux doigts", title: "Elle hésite encore", subtitle: "Un pas de plus" },
    level: "dit",
    trend: "En hausse",
    nextStep: "Propose-lui un verre",
  },
  fiche: { person: { id: "p1", name: "Maëlys", initial: "M", pronoun: "il" }, summaryShort: "Son exam jeudi" },
  period: "4 sept. → 7 sept.",
};

/* Une heure fixe (le 10 octobre 2026, 18 h) : les messages s’y posent, l’écran est ouvert juste après */
const A = new Date(2026, 9, 10, 18, 0).getTime();

type Props = ComponentProps<typeof FilDeLaConv>;

/** Les bulles du compte que l’accueil donne au fil (CreditContext) : le solde, et la recharge. */
type Credit = { solde: number | null; recharger: () => void };

function monter(msgs: Msg[], plus: Partial<Props> = {}, credit: Credit = { solde: null, recharger: vi.fn() }) {
  const props: Props = {
    threadRef: createRef<HTMLElement>(),
    hautRef: createRef<HTMLDivElement>(),
    msgs,
    opened: A + 60_000,
    depuis: 1,
    plus: false,
    anciens: false,
    chargerAnciens: vi.fn(async () => {}),
    partager: vi.fn(),
    relancer: vi.fn(),
    lire: vi.fn(async () => {}),
    ...plus,
  };
  render(
    <ContactContext value={CONTACT}>
      <MotionContext value={{ arriving: false }}>
        <CreditContext value={credit}>
          <FilDeLaConv {...props} />
        </CreditContext>
      </MotionContext>
    </ContactContext>,
  );
  return { props, fil: screen.getByRole("region", { name: "Ta conv avec BLUSH" }) };
}

describe("les bulles de la conv de l’accueil", () => {
  it("le fil est une région nommée, pas une région live : un lecteur d’écran ne relit pas chaque bulle posée", () => {
    const { fil } = monter([{ type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", at: A }]);
    expect(fil.tagName).toBe("SECTION");
    expect(fil.hasAttribute("aria-live")).toBe(false);
    expect(screen.queryByRole("log")).toBeNull();
  });

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
    expect(
      within(fil)
        .getAllByRole("img")
        .map((i) => i.getAttribute("alt")),
    ).toEqual(["Capture 1", "Capture 2", "Capture 3", "Capture 4"]);
    expect(within(fil).getByText("+2")).toBeTruthy();
  });

  it("une réponse de BLUSH : ses bulles, la réponse à envoyer qui se copie en un geste, et « Partager » son échange", async () => {
    const { props, fil } = monter([
      { type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", at: A },
      {
        type: "reponse",
        id: 2,
        from: "blush",
        result: { kind: "bubbles", bubbles: [{ text: "il attend que tu relances" }], send: ["t’es dispo jeudi ?", "j’ai un plan"], why: "Court et léger.", echange: 1 },
        at: A,
      },
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

  it("ce que coûte chaque réponse, sous elle : « 1 bulle · il t’en reste N » ; offerte (une alerte) ou de l’historique, rien", () => {
    const { fil } = monter([
      { type: "texte", id: 1, from: "toi", text: "et là ?", at: A },
      { type: "reponse", id: 2, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "elle te cherche" }], bulles: { depensees: 1, restantes: 9 } }, at: A },
      { type: "texte", id: 3, from: "toi", text: "voilà ses captures", at: A },
      { type: "reponse", id: 4, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "je vois" }], bulles: { depensees: 3, restantes: 6 } }, at: A },
      { type: "texte", id: 5, from: "toi", text: "ça va pas", at: A },
      { type: "reponse", id: 6, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "je suis là" }], bulles: { depensees: 0, restantes: 6 } }, at: A },
      { type: "texte", id: 7, from: "toi", text: "merci", at: A },
      { type: "reponse", id: 8, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "de rien" }] }, at: A },
    ]);
    expect([...fil.querySelectorAll("[data-recu]")].map((r) => r.textContent)).toEqual(["1 bulle · il t’en reste 9", "3 bulles · il t’en reste 6"]);
  });

  /** Le texte qu’un lecteur d’écran entend d’un élément : sans ce qui lui est caché (aria-hidden). */
  const texteLu = (el: Element): string =>
    [...el.childNodes].map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : n instanceof Element && n.getAttribute("aria-hidden") !== "true" ? texteLu(n) : "")).join("");
  /** Les lignes floutées d’une réponse prête : leur texte (neutre) et leur longueur. */
  const floutees = (el: Element) => [...el.querySelectorAll("[data-ligne-floutee]")].map((l) => l.textContent ?? "");

  it("une réponse verrouillée avec une réponse à envoyer : la lecture de BLUSH se lit en clair ; « Ta meilleure réponse » et « Recommandée », la réponse floutée en lignes neutres de sa longueur, « Ta réponse est prête »", () => {
    const recharger = vi.fn();
    const { fil } = monter(
      [
        { type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", at: A },
        {
          type: "reponse",
          id: 2,
          from: "blush",
          result: {
            kind: "bubbles",
            bubbles: [{ text: "elle te teste encore un peu" }, { text: "réponds léger", messages: [{ from: "elle", text: "on verra 🙂", caption: "Elle · hier" }] }],
            verrouillee: { message: 77, cout: 1, cache: { quoi: "reponse", lignes: [19, 42] } },
            echange: 1,
          },
          at: A,
        },
      ],
      {},
      { solde: 0, recharger },
    );
    /* La lecture, en clair, avec le message qu’elle cite */
    expect(within(fil).getByText("elle te teste encore un peu")).toBeTruthy();
    expect(within(fil).getByText("réponds léger")).toBeTruthy();
    expect(within(fil).getByText("on verra 🙂")).toBeTruthy();
    /* Puis ce qui attend : le dessin du prototype, la réponse floutée en deux lignes de 19 et 42 caractères neutres */
    const prete = fil.querySelector("[data-verrouillee=reponse]")!;
    expect(within(prete as HTMLElement).getByText("Ta meilleure réponse")).toBeTruthy();
    expect(within(prete as HTMLElement).getByText("Recommandée")).toBeTruthy();
    expect(within(prete as HTMLElement).getByText("Ta réponse est prête")).toBeTruthy();
    expect(floutees(prete).map((l) => l.length)).toEqual([19, 42]);
    for (const l of floutees(prete)) expect(l).toMatch(/^[x ]+$/);
    expect([...prete.querySelectorAll("[data-ligne-floutee]")].every((l) => l.getAttribute("aria-hidden") === "true" && l.className.includes("blur-"))).toBe(true);
    expect(texteLu(prete)).toBe("Ta meilleure réponseRecommandéeTa réponse est prêteRecharger pour la lire");
    /* Ni « Copier » (rien à copier), ni « Partager », ni reçu */
    expect(within(fil).queryByRole("button", { name: "Copier" })).toBeNull();
    expect(within(fil).queryByRole("button", { name: "Partager" })).toBeNull();
    expect(fil.querySelector("[data-recu]")).toBeNull();
    fireEvent.click(within(fil).getByRole("button", { name: "Recharger pour la lire" }));
    expect(recharger).toHaveBeenCalledOnce();
  });

  it("une réponse verrouillée sans réponse à envoyer (écrite à 0 bulle) : verrouillée en entier, floutée en lignes neutres de la forme de ses bulles, ni « Ta meilleure réponse », ni « Partager » ; « Recharger pour la lire » ouvre la recharge", () => {
    const recharger = vi.fn();
    const { props, fil } = monter(
      [
        { type: "texte", id: 1, from: "toi", text: "je lui dis quoi ?", at: A },
        {
          type: "reponse",
          id: 2,
          from: "blush",
          result: { kind: "bubbles", bubbles: [], verrouillee: { message: 77, cout: 1, cache: { quoi: "tout", lignes: [17, 28, 23] } }, echange: 1 },
          at: A,
        },
      ],
      {},
      { solde: 0, recharger },
    );
    const prete = fil.querySelector("[data-verrouillee=tout]")!;
    expect(within(fil).getByText("Ta réponse est prête")).toBeTruthy();
    /* Floutée : des lignes neutres de la longueur de ses bulles, jamais son texte (le serveur le garde) ; ce qui se lit, c’est « prête » et le bouton */
    expect(texteLu(prete)).toBe("Ta réponse est prêteRecharger pour la lire");
    expect(floutees(prete).map((l) => l.length)).toEqual([17, 28, 23]);
    expect(within(fil).queryByText("Ta meilleure réponse")).toBeNull();
    expect(within(fil).queryByRole("button", { name: "Partager" })).toBeNull();
    const bouton = within(fil).getByRole("button", { name: "Recharger pour la lire" });
    expect(bouton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(bouton);
    expect(recharger).toHaveBeenCalledOnce();
    expect(props.lire).not.toHaveBeenCalled();
  });

  it("une réponse verrouillée que le solde couvre déjà (rechargé ailleurs) : « La lire » la demande", async () => {
    const recharger = vi.fn();
    const { props, fil } = monter(
      [{ type: "reponse", id: 2, from: "blush", result: { kind: "bubbles", bubbles: [], verrouillee: { message: 77, cout: 3, cache: { quoi: "tout", lignes: [20] } } }, at: A }],
      {},
      { solde: 3, recharger },
    );
    await act(async () => fireEvent.click(within(fil).getByRole("button", { name: "La lire" })));
    expect(props.lire).toHaveBeenCalledExactlyOnceWith(2, 77);
    expect(recharger).not.toHaveBeenCalled();
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
