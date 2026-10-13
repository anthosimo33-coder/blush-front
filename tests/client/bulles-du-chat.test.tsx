import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauBulles, etatDuBandeau } from "@/app/app/accueil/BandeauBulles";
import { CompteurBulles } from "@/components/bulles/CompteurBulles";
import { FeuilleRecharge } from "@/components/bulles/FeuilleRecharge";
import { CASE_IMPORT, CASE_RENONCIATION, texteRenonciation } from "@/contenu/consentements";
import { CATALOGUE, PREMIERE_RECHARGE } from "@/contenu/offres";
import { lePack } from "@/contenu/recharge";
import { partirPayer } from "@/lib/paiement";
import { proposerOffreUnique } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Les bulles dans le chat, à l’écran (le prototype validé des bulles) : le compteur à côté du bouton du compte, la carte
 * au-dessus du champ (la première apparition expliquée, plus que 2 bulles, une réponse prête, plus de bulles) et la
 * recharge, avec le bonus de la première recharge (④) seulement quand le serveur le montre. Le paiement et le serveur
 * sont simulés : ici, ce que l’écran en fait. La feuille s’ouvre sans animation (le DOM simulé n’en a pas). getByText
 * compare un texte où l’insécable devient une espace : ses textes attendus s’écrivent avec des espaces.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
vi.mock("@/lib/paiement", async (vrai) => ({ ...(await vrai<typeof import("@/lib/paiement")>()), partirPayer: vi.fn(async () => {}) }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), proposerOffreUnique: vi.fn() }));
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

  it("rose quand il en reste 2 ou moins (comme le prototype), gris et sa perle vide à 0 ; un solde négatif (un remboursement) se montre à 0", () => {
    const { rerender } = render(<CompteurBulles bulles={3} ouvrir={() => {}} />);
    const compteur = () => screen.getByRole("button");
    expect(compteur().className).toContain("bg-white");
    expect(compteur().className).not.toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={2} ouvrir={() => {}} />);
    expect(compteur().className).toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={1} ouvrir={() => {}} />);
    expect(compteur().className).toContain("text-elle-ink");
    rerender(<CompteurBulles bulles={-3} ouvrir={() => {}} />);
    expect(compteur().getAttribute("aria-label")).toBe("Tes bulles\u00a0: 0");
    expect(compteur().className).toContain("text-grey");
    expect(compteur().querySelector('[data-perle="vide"]')).not.toBeNull();
  });

  it("l’équipe : illimitées", () => {
    render(<CompteurBulles bulles={null} ouvrir={() => {}} />);
    expect(screen.getByRole("button", { name: "Tes bulles\u00a0: illimitées" }).textContent).toBe("∞");
  });
});

describe("la carte au-dessus du champ", () => {
  it("laquelle : rien pour l’équipe ; une réponse prête d’abord ; puis plus de bulles ; la première apparition ; 2 ou moins", () => {
    expect(etatDuBandeau({ solde: null, prete: true, expliquees: false })).toBeNull();
    expect(etatDuBandeau({ solde: 0, prete: true, expliquees: true })).toBe("prete");
    expect(etatDuBandeau({ solde: -2, prete: false, expliquees: false })).toBe("finies");
    expect(etatDuBandeau({ solde: 10, prete: false, expliquees: false })).toBe("offertes");
    expect(etatDuBandeau({ solde: 6, prete: false, expliquees: true })).toBeNull();
    expect(etatDuBandeau({ solde: 5, prete: false, expliquees: true })).toBeNull();
    expect(etatDuBandeau({ solde: 3, prete: false, expliquees: true })).toBeNull();
    expect(etatDuBandeau({ solde: 2, prete: false, expliquees: true })).toBe("peu");
    expect(etatDuBandeau({ solde: 1, prete: false, expliquees: true })).toBe("peu");
  });

  const cartes = { autre: "Maëlys", pronom: "elle" as const, recharger: vi.fn(), lire: vi.fn(), expliquer: vi.fn(), fermer: vi.fn() };

  it("à 2 bulles : « Plus que 2 bulles », deux perles pleines et trois vides (comme le prototype), et « Recharger » ; au singulier à 1", () => {
    const { container, rerender } = render(<BandeauBulles etat="peu" bulles={2} {...cartes} />);
    expect(screen.getByText("Plus que 2 bulles")).toBeTruthy();
    expect(screen.getByText("Elle va te répondre. Tu auras de quoi lui répondre ?")).toBeTruthy();
    /* La rangée : 5 places, 2 pleines et 3 vides (et une perle sur le bouton) */
    expect(container.querySelectorAll('[data-perle="vide"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Recharger" }));
    expect(cartes.recharger).toHaveBeenCalledOnce();
    rerender(<BandeauBulles etat="peu" bulles={1} {...cartes} />);
    expect(screen.getByText("Plus que 1 bulle")).toBeTruthy();
  });

  it("la première apparition : les bulles offertes du rapport, « comment ça marche », et « Fermer »", () => {
    const { rerender } = render(<BandeauBulles etat="offertes" bulles={CATALOGUE.rapport.bulles} {...cartes} />);
    expect(screen.getByText("Tes 10 bulles offertes sont là")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 bulle = 1 réponse de BLUSH · comment ça marche" }));
    expect(cartes.expliquer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(cartes.fermer).toHaveBeenCalledOnce();
    rerender(<BandeauBulles etat="offertes" bulles={90} {...cartes} />);
    expect(screen.getByText("Tes 90 bulles sont là")).toBeTruthy();
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
  /** La feuille ouverte, le serveur ayant dit (ou non) que le bonus de la première recharge vaut. */
  async function ouvrir(bonus: boolean, plus: { reponsePrete?: boolean } = {}) {
    proposer.mockResolvedValue(bonus ? { offre: "premiere_recharge", fin: null, reste: null, enUnGeste: false } : { offre: null });
    const suite = vi.fn((bulles: number) => `/app?recharge=${bulles}`);
    await act(async () => void render(<FeuilleRecharge open onClose={() => {}} autre="Maëlys" suite={suite} {...plus} />));
    return { feuille: screen.getByRole("dialog", { name: "Recharge tes bulles" }), suite };
  }

  it("trois packs, le conseillé choisi d’avance et ouvert (70 + 10 offertes) ; sans le bonus, pas de bandeau ④", async () => {
    const { feuille } = await ouvrir(false);
    expect(proposer).toHaveBeenCalledExactlyOnceWith("premiere_recharge");
    const packs = within(feuille).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(within(packs[0]!).getByText("30 bulles")).toBeTruthy();
    expect(within(packs[1]!).getByText("70 bulles")).toBeTruthy();
    expect(within(packs[1]!).getByText("+10 offertes")).toBeTruthy();
    expect(within(packs[1]!).getByText("80 bulles · 0,12 € la bulle")).toBeTruthy();
    expect(within(packs[2]!).getByText("150 bulles")).toBeTruthy();
    expect(feuille.querySelector("[data-bonus]")).toBeNull();
    expect(within(feuille).getByText("Elles n’expirent jamais.")).toBeTruthy();
    expect(within(feuille).getByRole("button", { name: "Payer · 9,90\u00a0€" })).toBeTruthy();
  });

  it("le bonus ④, quand le serveur le montre : en tête, et sur le pack conseillé (120 bulles, 0,08 € la bulle)", async () => {
    const { feuille } = await ouvrir(true);
    expect(within(feuille).getByText(`Ta 1re recharge : +${PREMIERE_RECHARGE.bonus} offertes`)).toBeTruthy();
    const conseille = within(feuille).getAllByRole("radio")[1]!;
    expect(within(conseille).getByText("+50 offertes")).toBeTruthy();
    expect(within(conseille).getByText("120 bulles · 0,08 € la bulle")).toBeTruthy();
    expect(lePack("pack80", true).total).toBe(CATALOGUE.pack80.bulles + PREMIERE_RECHARGE.bonus);
  });

  it("ouverte depuis une réponse prête, elle le rappelle", async () => {
    const { feuille } = await ouvrir(false, { reponsePrete: true });
    expect(within(feuille).getByText("Ta réponse à Maëlys s’affiche dès que c’est payé.")).toBeTruthy();
  });

  it("payer : pas de case, la ligne de la renonciation sous le bouton ; le pack choisi part au premier toucher, et revient avec ses bulles", async () => {
    const { feuille, suite } = await ouvrir(true);
    const bouton = within(feuille).getByRole("button", { name: "Payer · 9,90\u00a0€" });
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
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: "Payer · 19,90\u00a0€" })));
    expect(payer).toHaveBeenCalledOnce();
    expect(payer.mock.calls[0]![0]).toBe("pack200");
    expect(payer.mock.calls[0]![1]).toMatchObject({ renonciation: true, suite: "/app?recharge=200" });
    expect(suite).toHaveBeenCalledWith(200);
  });

  it("sans paiement branché : « Le paiement arrive très vite » ; une autre erreur : réessayer", async () => {
    const { feuille } = await ouvrir(false);
    payer.mockRejectedValueOnce(new ErreurApi("bientot", 402));
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(within(feuille).getByText("Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.")).toBeTruthy();
    payer.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await act(async () => fireEvent.click(within(feuille).getByRole("button", { name: /^Payer/ })));
    expect(within(feuille).getByRole("alert").textContent).toBe("Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.");
  });

  it("la renonciation refusée par le serveur (son texte a changé depuis l’ouverture) : recharger la page, et plus aucun paiement avec l’ancienne", async () => {
    const { feuille } = await ouvrir(false);
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
