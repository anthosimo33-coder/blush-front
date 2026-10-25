import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauBulles, etatDuBandeau } from "@/app/app/accueil/BandeauBulles";
import { CompteurBulles } from "@/components/bulles/CompteurBulles";
import { FeuilleRecharge } from "@/components/bulles/FeuilleRecharge";
import { CASE_IMPORT, CASE_RENONCIATION, texteRenonciation } from "@/contenu/consentements";
import { CATALOGUE } from "@/contenu/offres";
import { lePack, PACK_CONSEILLE } from "@/contenu/recharge";
import { partirPayer } from "@/lib/paiement";
import { invalidate } from "@/lib/query";
import { getAccount, proposerOffreUnique } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Les bulles dans le chat, à l’écran (le prototype validé des bulles) : le compteur à côté du bouton du compte, la carte
 * au-dessus du champ (la première apparition expliquée, la dernière bulle, une réponse prête, plus de bulles) et la
 * recharge (le bonus de la première recharge, ④, arrêté le 23 octobre 2026, ne s’y demande plus). Le paiement et le serveur
 * sont simulés : ici, ce que l’écran en fait. La feuille s’ouvre sans animation (le DOM simulé n’en a pas). getByText
 * compare un texte où l’insécable devient une espace : ses textes attendus s’écrivent avec des espaces.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
vi.mock("@/lib/paiement", async (vrai) => ({ ...(await vrai<typeof import("@/lib/paiement")>()), partirPayer: vi.fn(async () => {}) }));
/* Sans paiement dans la feuille (le mode null) : la recharge paie sur la page de Whop, par partirPayer (simulé) */
vi.mock("@/services/api", async (vrai) => ({
  ...(await vrai<typeof import("@/services/api")>()),
  proposerOffreUnique: vi.fn(),
  lireFeuilleDuPaiement: vi.fn(async () => ({ paiement: { mode: null }, avance: null, garde: null })),
  getAccount: vi.fn(async () => ({ email: "toi@example.com", bulles: 0, client: false, equipe: false, storyDeleted: false })),
}));
const payer = vi.mocked(partirPayer);
const proposer = vi.mocked(proposerOffreUnique);

const { getAnimations } = Element.prototype;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.getAnimations = () => [];
});

afterEach(() => {
  Element.prototype.getAnimations = getAnimations;
  payer.mockClear();
  proposer.mockReset();
});

describe("le compteur de bulles", () => {
  it("son solde, dit au lecteur d’écran ; un toucher ouvre « C’est quoi une bulle ? »", () => {
    const ouvrir = vi.fn();
    render(<CompteurBulles bulles={9} ouvrir={ouvrir} />);
    const compteur = screen.getByRole("button", { name: "Tes bulles\u00a0: 9" });
    expect(compteur.textContent).toBe("9");
    expect(compteur.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(compteur);
    expect(ouvrir).toHaveBeenCalledOnce();
  });

  it("rose à la dernière bulle (pas à 2 : le rapport n’en donne que 3), gris et sa perle vide à 0 ; un solde négatif (un remboursement) se montre tel quel, en gris (SUP14-1)", () => {
    const { rerender } = render(<CompteurBulles bulles={CATALOGUE.rapport.bulles} ouvrir={() => {}} />);
    const compteur = () => screen.getByRole("button");
    expect(compteur().className).toContain("bg-white");
    expect(compteur().className).not.toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={2} ouvrir={() => {}} />);
    expect(compteur().className).toContain("bg-white");
    expect(compteur().className).not.toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={1} ouvrir={() => {}} />);
    expect(compteur().className).toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={-3} ouvrir={() => {}} />);
    expect(compteur().getAttribute("aria-label")).toBe("Tes bulles\u00a0: -3");
    expect(compteur().textContent).toBe("\u22123");
    expect(compteur().className).toContain("text-grey");
    expect(compteur().querySelector('[data-perle="vide"]')).not.toBeNull();
  });

  it("l’équipe : illimitées", () => {
    render(<CompteurBulles bulles={null} ouvrir={() => {}} />);
    expect(screen.getByRole("button", { name: "Tes bulles\u00a0: illimitées" }).textContent).toBe("∞");
  });
});

describe("la carte au-dessus du champ", () => {
  it("laquelle : rien pour l’équipe ; une réponse prête d’abord ; puis plus de bulles ; la première apparition ; la dernière bulle", () => {
    expect(etatDuBandeau({ solde: null, prete: true, expliquees: false })).toBeNull();
    expect(etatDuBandeau({ solde: 0, prete: true, expliquees: true })).toBe("prete");
    expect(etatDuBandeau({ solde: -2, prete: false, expliquees: false })).toBe("finies");
    expect(etatDuBandeau({ solde: CATALOGUE.rapport.bulles, prete: false, expliquees: false })).toBe("offertes");
    expect(etatDuBandeau({ solde: 6, prete: false, expliquees: true })).toBeNull();
    expect(etatDuBandeau({ solde: 3, prete: false, expliquees: true })).toBeNull();
    /* Le rapport en donne 3 : à 2, après une seule réponse, rien encore */
    expect(etatDuBandeau({ solde: 2, prete: false, expliquees: true })).toBeNull();
    expect(etatDuBandeau({ solde: 1, prete: false, expliquees: true })).toBe("peu");
  });

  const cartes = { autre: "Maëlys", pronom: "elle" as const, recharger: vi.fn(), lire: vi.fn(), expliquer: vi.fn(), fermer: vi.fn() };

  it("à 2 bulles : « Plus que 2 bulles », deux perles pleines et trois vides (comme le prototype), et « Recharger » ; « Plus qu’une bulle » à 1", () => {
    const { container, rerender } = render(<BandeauBulles etat="peu" bulles={2} {...cartes} />);
    expect(screen.getByText("Plus que 2 bulles")).toBeTruthy();
    expect(screen.getByText("Elle va te répondre. Tu auras de quoi lui répondre ?")).toBeTruthy();
    /* La rangée : 5 places, 2 pleines et 3 vides (et une perle sur le bouton) */
    expect(container.querySelectorAll('[data-perle="vide"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Recharger" }));
    expect(cartes.recharger).toHaveBeenCalledOnce();
    rerender(<BandeauBulles etat="peu" bulles={1} {...cartes} />);
    expect(screen.getByText("Plus qu’une bulle")).toBeTruthy();
  });

  it("la première apparition : les bulles offertes du rapport, « comment ça marche », et « Fermer »", () => {
    const { rerender } = render(<BandeauBulles etat="offertes" bulles={CATALOGUE.rapport.bulles} {...cartes} />);
    expect(screen.getByText("Tes 3 bulles offertes sont là")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 bulle = 1 réponse de BLUSH · comment ça marche" }));
    expect(cartes.expliquer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(cartes.fermer).toHaveBeenCalledOnce();
    rerender(<BandeauBulles etat="offertes" bulles={CATALOGUE.premium.bulles} {...cartes} />);
    expect(screen.getByText("Tes 25 bulles sont là")).toBeTruthy();
  });

  it("une réponse prête : « La lire » ; plus de bulles : « Recharger »", () => {
    const { rerender } = render(<BandeauBulles etat="prete" bulles={0} {...cartes} />);
    expect(screen.getByText("Ta réponse à Maëlys est écrite")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "La lire" }));
    expect(cartes.lire).toHaveBeenCalledOnce();
    rerender(<BandeauBulles etat="finies" bulles={0} {...cartes} />);
    expect(screen.getByText("Tes bulles sont finies")).toBeTruthy();
    expect(screen.getByText("BLUSH garde tout en mémoire.")).toBeTruthy();
  });

  it("aucune carte : rien", () => {
    const { container } = render(<BandeauBulles etat={null} bulles={30} {...cartes} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("la recharge", () => {
  /** La feuille ouverte. */
  async function ouvrir(plus: { reponsePrete?: boolean } = {}) {
    const suite = vi.fn((bulles: number) => `/app?recharge=${bulles}`);
    await act(async () => void render(<FeuilleRecharge open onClose={() => {}} autre="Maëlys" suite={suite} {...plus} />));
    return { feuille: screen.getByRole("dialog", { name: "Recharge tes bulles" }), suite };
  }

  it("un solde sous zéro (un remboursement) : la feuille le dit, avec ce que le pack choisi en fera (SUP14-1) ; à 0 ou plus, rien", async () => {
    vi.mocked(getAccount).mockResolvedValueOnce({ email: "toi@example.com", bulles: -25, client: true, equipe: false, storyDeleted: false });
    invalidate("account");
    const { feuille } = await ouvrir();
    await act(async () => {});
    /* Le pack conseillé, 25 bulles : −25 + 25 */
    expect(within(feuille).getByText(/^Ton solde est à .25 bulles \(après un remboursement\) : ce pack le remonte à 0\.$/)).toBeTruthy();
    /* Le petit pack, 10 bulles : −25 + 10 */
    fireEvent.click(within(feuille).getAllByRole("radio")[0]!);
    expect(within(feuille).getByText(/ce pack le remonte à .15\.$/)).toBeTruthy();
  });

  it("trois packs (10, 25, 60), le conseillé choisi d’avance, le prix de la bulle sous chacun ; plus de bonus ④, ni demandé au serveur, ni montré", async () => {
    invalidate("account");
    const { feuille } = await ouvrir();
    expect(proposer).not.toHaveBeenCalled();
    const packs = within(feuille).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(within(packs[0]!).getByText("10 bulles")).toBeTruthy();
    expect(within(packs[0]!).getByText("0,69 € la bulle")).toBeTruthy();
    expect(within(packs[1]!).getByText("25 bulles")).toBeTruthy();
    expect(within(packs[1]!).getByText("0,60 € la bulle")).toBeTruthy();
    expect(within(packs[2]!).getByText("60 bulles")).toBeTruthy();
    expect(within(packs[2]!).getByText("0,58 € la bulle")).toBeTruthy();
    expect(within(feuille).queryByText(/offertes|1re recharge/)).toBeNull();
    expect(feuille.querySelector("[data-bonus]")).toBeNull();
    expect(within(feuille).getByText("Elles n’expirent jamais.")).toBeTruthy();
    expect(within(feuille).getByRole("button", { name: "Payer · 14,90\u00a0€" })).toBeTruthy();
    expect(lePack(PACK_CONSEILLE)).toMatchObject({ titre: "25 bulles", offertes: 0, total: CATALOGUE.pack25.bulles, tag: null });
  });

  it("ouverte depuis une réponse prête, elle le rappelle", async () => {
    const { feuille } = await ouvrir({ reponsePrete: true });
    expect(within(feuille).getByText("Ta réponse à Maëlys s’affiche dès que c’est payé.")).toBeTruthy();
  });

  it("payer : pas de case, la ligne de la renonciation sous le bouton ; le pack choisi part au premier toucher, et revient avec ses bulles", async () => {
    const { feuille, suite } = await ouvrir();
    const bouton = within(feuille).getByRole("button", { name: "Payer · 14,90\u00a0€" });
    expect(within(feuille).queryByRole("checkbox")).toBeNull();
    expect(bouton.nextElementSibling?.textContent).toBe(texteRenonciation("bulles"));
    expect(within(feuille).getByRole("link", { name: CASE_RENONCIATION.lien }).getAttribute("href")).toBe(CASE_RENONCIATION.ancre);
    /* Le grand pack, au clavier : les flèches du groupe passent d’un pack à l’autre */
    const radios = within(feuille).getAllByRole("radio");
    /* Un seul arrêt de tabulation : le pack conseillé, coché */
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(radios[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2]!.getAttribute("aria-checked")).toBe("true");
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: "Payer · 34,90\u00a0€" })));
    expect(payer).toHaveBeenCalledOnce();
    expect(payer.mock.calls[0]![0]).toBe("pack60");
    expect(payer.mock.calls[0]![1]).toMatchObject({ renonciation: true, suite: "/app?recharge=60" });
    expect(suite).toHaveBeenCalledWith(60);
  });

  it("sans paiement branché : « Le paiement arrive très vite » ; une autre erreur : réessayer", async () => {
    const { feuille } = await ouvrir();
    payer.mockRejectedValueOnce(new ErreurApi("bientot", 402));
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(within(feuille).getByText("Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.")).toBeTruthy();
    payer.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(within(feuille).getByRole("alert").textContent).toBe("Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.");
  });

  it("la renonciation refusée par le serveur (son texte a changé depuis l’ouverture) : recharger la page, et plus aucun paiement avec l’ancienne", async () => {
    const { feuille } = await ouvrir();
    payer.mockRejectedValueOnce(new ErreurApi("renonciation", 422));
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(payer).toHaveBeenCalledOnce();
    /* Ni « vérifie ta connexion » (réessayer renverrait la même version, refusée sans fin), mais le nouveau texte à lire */
    expect(within(feuille).queryByText("Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.")).toBeNull();
    expect(within(feuille).getByText(CASE_IMPORT.perimee, { exact: false })).toBeTruthy();
    const recharger = within(feuille).getByRole("button", { name: CASE_IMPORT.recharger });
    /* Retouché, « Payer » ne repart pas : l’onglet n’a que l’ancienne version ; le focus va au rechargement */
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(payer).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(recharger);
  });
});
