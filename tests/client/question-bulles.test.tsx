import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionChat } from "@/app/rapport/question/QuestionChat";
import { URGENCES } from "@/contenu/aide";
import { FEUILLE_BULLE } from "@/contenu/bulles";
import { partirPayer } from "@/lib/paiement";
import { askQuestion, proposerOffreUnique } from "@/services/api";
import type { QuestionAnswer, Story } from "@/types";
import type { Account } from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Les bulles sur « Ta question » (src/app/rapport/question/QuestionChat.tsx) : sa réponse se paie une bulle, comme une
 * réponse du chat, et l’écran le montre avec les pièces du chat : le compteur en haut (« C’est quoi une bulle ? », d’où
 * l’on recharge ; illimitées pour l’équipe), le reçu « 1 bulle · il t’en reste N » sous la réponse et le compteur qui le
 * suit, puis à 0 bulle la recharge : ouverte d’elle-même quand la question est refusée (402 « bulles », ses numéros
 * d’aide restent affichés), ou par « Recharger pour la lire » sous la réponse écrite verrouillée. Le serveur et le
 * paiement sont simulés : ici, ce que l’écran en fait. Le compteur est posé deux fois (en haut sur mobile, à côté de
 * « Mon compte » sur ordinateur : le CSS en cache un, que le DOM simulé n’applique pas). getByText compare un texte où
 * l’insécable devient une espace : ses textes attendus s’écrivent avec des espaces.
 */

/* Le compte que la page a rendu, changé par chaque test ; le cache des requêtes, le vrai (le compteur suit setQueryData) */
const page = vi.hoisted(() => ({ compte: null as unknown as Account }));
vi.mock("@/lib/requetes", async () => {
  const { useQuery } = await import("@/lib/query");
  return { useCompte: () => useQuery("account", async () => page.compte, page.compte, { fetch: false }), apresDeblocage: vi.fn() };
});
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/components/shell/Reveil", () => ({ reveiller: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/rapport/question",
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
/* Les polices de Next ne se chargent pas hors de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));
vi.mock("@/lib/paiement", async (vrai) => ({ ...(await vrai<typeof import("@/lib/paiement")>()), partirPayer: vi.fn(async () => {}) }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), askQuestion: vi.fn(), proposerOffreUnique: vi.fn() }));
const poser = vi.mocked(askQuestion);
const payer = vi.mocked(partirPayer);
const proposer = vi.mocked(proposerOffreUnique);

const STORY: Story = {
  id: "conv-test",
  participants: [
    { id: "a", name: "Tom", initial: "T" },
    { id: "b", name: "Léa", initial: "L" },
  ],
  sources: [],
  totalMessages: 1200,
  voiceCount: 0,
  period: "14 déc. → 12 mars",
  durationLabel: "3 mois",
  updatedLabel: "hier",
  me: "a",
};

/** Un compte qui paie, à `bulles` bulles ; `equipe` : un compte de l’équipe (bulles illimitées). */
const compte = (bulles: number, equipe = false) => ({ email: "test@example.com", bulles, client: true, equipe }) as Account;

const reponse = (question: string, plus: Partial<QuestionAnswer> = {}): QuestionAnswer => ({
  question,
  title: "oui, clairement",
  evidenceLabel: "Ce que je vois",
  evidence: "elle relance chaque soir",
  confidence: "probable",
  limits: "",
  ...plus,
});

const { getAnimations } = Element.prototype;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.getAnimations = () => [];
  proposer.mockResolvedValue({ offre: null });
});

afterEach(() => {
  Element.prototype.getAnimations = getAnimations;
  vi.clearAllMocks();
});

/** L’écran, rendu pour ce compte (la feuille de la recharge demande au serveur si le bonus ④ vaut : ici, non). */
async function ecran(c: Account) {
  page.compte = c;
  await act(async () => void render(<QuestionChat ideas={[]} story={STORY} />));
}

/** Les compteurs de l’écran (mobile et ordinateur), d’après leur nom. */
const compteurs = (n: number | string) => screen.queryAllByRole("button", { name: `Tes bulles\u00a0: ${n}` });

/** Écrit cette question et l’envoie. */
async function envoyer(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Ta question à BLUSH" }), { target: { value: question } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Poser ma question" })));
}

/** La recharge ouverte : « Payer », au premier toucher (pas de case) ; ce que le paiement a reçu. */
async function payerLaRecharge(feuille: HTMLElement) {
  await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
  expect(payer).toHaveBeenCalledOnce();
  return payer.mock.calls[0]![1];
}

describe("le compteur de « Ta question »", () => {
  it("le solde du compte, en haut ; un toucher ouvre « C’est quoi une bulle ? », d’où l’on recharge, et l’on revient ici", async () => {
    await ecran(compte(10));
    expect(compteurs(10)).toHaveLength(2);
    expect(compteurs(10)[0]!.textContent).toBe("10");
    fireEvent.click(compteurs(10)[0]!);
    const bulle = screen.getByRole("dialog", { name: FEUILLE_BULLE.titre });
    await act(async () => fireEvent.click(within(bulle).getByRole("button", { name: "Recharger · il t’en reste 10" })));
    const recharge = screen.getByRole("dialog", { name: "Recharge tes bulles" });
    expect(within(recharge).getByText("Elles n’expirent jamais.")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: FEUILLE_BULLE.titre })).toBeNull();
    /* Rien n’attend la recharge : une fois payé, retour à la question */
    expect(await payerLaRecharge(recharge)).toMatchObject({ renonciation: true, suite: "/rapport/question" });
  });

  it("l’équipe : illimitées ; « C’est quoi une bulle ? » sans recharge, et aucun reçu sous la réponse", async () => {
    await ecran(compte(0, true));
    expect(compteurs("illimitées")).toHaveLength(2);
    expect(compteurs("illimitées")[0]!.textContent).toBe("∞");
    fireEvent.click(compteurs("illimitées")[0]!);
    const bulle = screen.getByRole("dialog", { name: FEUILLE_BULLE.titre });
    expect(within(bulle).getByRole("button", { name: "Compris" })).toBeTruthy();
    expect(within(bulle).queryByRole("button", { name: /^Recharger/ })).toBeNull();
    fireEvent.click(within(bulle).getByRole("button", { name: "Compris" }));
    /* Le serveur ne dit rien des bulles de l’équipe : la réponse, sans reçu */
    poser.mockResolvedValueOnce(reponse("il pense à moi ?"));
    await envoyer("il pense à moi ?");
    expect(await screen.findByText("oui, clairement")).toBeTruthy();
    expect(document.querySelector("[data-recu]")).toBeNull();
    expect(compteurs("illimitées")).toHaveLength(2);
  });
});

describe("le reçu sous la réponse", () => {
  it("« 1 bulle · il t’en reste 9 », dit par le serveur avec la réponse ; le compteur le suit", async () => {
    await ecran(compte(10));
    poser.mockResolvedValueOnce(reponse("il pense à moi ?", { bulles: { depensees: 1, restantes: 9 } }));
    await envoyer("il pense à moi ?");
    expect(await screen.findByText("oui, clairement")).toBeTruthy();
    expect(document.querySelector("[data-recu]")?.textContent).toBe("1 bulle · il t’en reste 9");
    expect(compteurs(10)).toHaveLength(0);
    expect(compteurs(9)).toHaveLength(2);
  });

  it("une réponse offerte (une alerte, 0 bulle dépensée) : pas de reçu", async () => {
    await ecran(compte(4));
    poser.mockResolvedValueOnce(reponse("ça va pas", { bulles: { depensees: 0, restantes: 4 } }));
    await envoyer("ça va pas");
    expect(await screen.findByText("oui, clairement")).toBeTruthy();
    expect(document.querySelector("[data-recu]")).toBeNull();
    expect(compteurs(4)).toHaveLength(2);
  });
});

describe("à 0 bulle", () => {
  it("refusée (402 « bulles ») : la recharge s’ouvre ; fermée, le souci et ses numéros d’aide restent, même en réécrivant, et « Recharger » la rouvre", async () => {
    await ecran(compte(0));
    expect(compteurs(0)).toHaveLength(2);
    poser.mockRejectedValueOnce(new ErreurApi("bulles", 402));
    await envoyer("et là ?");
    const recharge = screen.getByRole("dialog", { name: "Recharge tes bulles" });
    expect(within(recharge).getByText("Elles n’expirent jamais.")).toBeTruthy();
    fireEvent(recharge, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Recharge tes bulles" })).toBeNull();
    const souci = screen.getByRole("alert");
    expect(souci.textContent).toContain(URGENCES);
    /* La question revient dans le champ ; la réécrire ne retire pas les numéros d’aide */
    const champ = screen.getByRole("textbox", { name: "Ta question à BLUSH" }) as HTMLTextAreaElement;
    expect(champ.value).toBe("et là ?");
    fireEvent.change(champ, { target: { value: "et là, alors ?" } });
    expect(screen.getByRole("alert").textContent).toContain(URGENCES);
    await act(async () => fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Recharger" })));
    expect(await payerLaRecharge(screen.getByRole("dialog", { name: "Recharge tes bulles" }))).toMatchObject({ suite: "/rapport/question" });
  });

  it("un autre souci (le réseau) s’efface quand on réécrit, sans recharge", async () => {
    await ecran(compte(0));
    poser.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await envoyer("et là ?");
    expect(screen.queryByRole("dialog", { name: "Recharge tes bulles" })).toBeNull();
    expect(within(screen.getByRole("alert")).queryByRole("button")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Ta question à BLUSH" }), { target: { value: "et là, alors ?" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("la réponse écrite, verrouillée : « Recharger pour la lire » ouvre la recharge, qui la rappelle ; payé, elle se lit dans le chat", async () => {
    await ecran(compte(0));
    poser.mockResolvedValueOnce(reponse("il pense à moi ?", { title: "Ta réponse est prête", verrouillee: true }));
    await envoyer("il pense à moi ?");
    expect(await screen.findByText("Ta réponse est prête")).toBeTruthy();
    expect(document.querySelector("[data-recu]")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Recharger pour la lire" })));
    const recharge = screen.getByRole("dialog", { name: "Recharge tes bulles" });
    expect(within(recharge).getByText("Ta réponse à Léa s’affiche dès que c’est payé.")).toBeTruthy();
    /* Le pack conseillé (80 bulles, sans le bonus ④ ici) : le chat lit la réponse prête au retour */
    expect(await payerLaRecharge(recharge)).toMatchObject({ suite: "/app?recharge=80" });
  });
});
