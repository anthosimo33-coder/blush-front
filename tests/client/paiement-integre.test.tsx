import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FeuilleFormule } from "@/components/paiement/FeuilleFormule";
import { OffreAvantDePartir } from "@/components/paiement/OffreAvantDePartir";
import { PiedGratuit } from "@/components/paiement/PiedGratuit";
import { DANS_LA_FEUILLE, FEUILLE_FORMULE, OFFRE_SUITE, PIED_GRATUIT } from "@/contenu/paiement";
import { prixDe } from "@/contenu/offres";
import { jourEnLettres } from "@/lib/format";
import { invalidate } from "@/lib/query";
import { commencerPaiement, etatDuPaiement, lireFeuilleDuPaiement, utiliserAvance } from "@/services/api";
import type { FeuilleDuPaiement } from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Le paiement dans la feuille (PayerDansLaFeuille), dans le DOM simulé, posé dans « Ta formule » : la carte de test du
 * faux Whop (payée, refusée), les Elements de Whop simulés (le bouton d’Apple Pay, ouvert dans le geste ; la carte ; la
 * 3-D Secure que finit handleNextAction), « C’est payé » puis « C’est débloqué », et les avoirs du compte (le rapport
 * d’avance, le −50 % gardé). Le serveur est simulé (services/api), les Elements aussi (leurs cadres n’existent pas ici).
 */

const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/rapport" }));
vi.mock("@/services/api", async (vrai) => ({
  ...(await vrai<typeof import("@/services/api")>()),
  commencerPaiement: vi.fn(),
  etatDuPaiement: vi.fn(),
  proposerOffreUnique: vi.fn(async () => ({ offre: null })),
  lireFeuilleDuPaiement: vi.fn(),
  utiliserAvance: vi.fn(),
  getAccount: vi.fn(async () => ({ email: "toi@example.com", bulles: 0, client: false, equipe: false, storyDeleted: false })),
}));

/* Les Elements de Whop simulés : le portefeuille (paymentRequest), l’étape de la banque (handleNextAction), la carte */
/** Une simulation d’une méthode des Elements, appelée avec n’importe quoi. */
type Simulee = Mock<(...a: unknown[]) => Promise<unknown>>;
const whop = vi.hoisted(() => ({
  portefeuille: { applePay: false, googlePay: false } as { applePay: boolean; googlePay: boolean },
  show: null as unknown as Simulee,
  update: null as unknown as Mock<(...a: unknown[]) => void>,
  handleNextAction: null as unknown as Simulee,
  createConfirmationToken: null as unknown as Simulee,
}));
vi.mock("@whop/elements", () => ({ loadWhop: () => Promise.resolve(() => ({})) }));
/* L’instance de Whop, la même à chaque rendu (comme la vraie) : ses appels lisent les simulations du test en cours */
const instance = vi.hoisted(() => ({
  payments: {
    paymentRequest: {
      create: () => ({
        canMakePayment: async () => ({ ...whop.portefeuille, wallets: { apple_pay: { button: { light: { color: "#000000", image: "data:image/svg+xml,apple" } } } } }),
        show: (...a: unknown[]) => whop.show(...a),
        update: (...a: unknown[]) => whop.update(...a),
      }),
    },
    handleNextAction: (...a: unknown[]) => whop.handleNextAction(...a),
  },
}));
vi.mock("@whop/elements-react", () => ({
  WhopElements: ({ children }: { children: ReactNode }) => children,
  useWhop: () => instance,
  Payments: ({ children }: { children: ReactNode }) => children,
  usePayments: () => ({ createConfirmationToken: whop.createConfirmationToken }),
  PaymentElement: ({ onChange }: { onChange: (e: { complete: boolean }) => void }) => (
    <button type="button" onClick={() => onChange({ complete: true })}>
      la carte de Whop
    </button>
  ),
  BrandingElement: () => <p>Whop, vendeur en titre</p>,
}));

const commencer = vi.mocked(commencerPaiement);
const etat = vi.mocked(etatDuPaiement);
const lireFeuille = vi.mocked(lireFeuilleDuPaiement);
const avance = vi.mocked(utiliserAvance);
const { getAnimations } = Element.prototype;

/** Ce que la feuille sait, pour ce test. */
const sait = (f: Partial<FeuilleDuPaiement>) => lireFeuille.mockResolvedValue({ paiement: { mode: "factice" }, roue: { etat: "aucune" }, avance: null, garde: null, ...f });

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.getAnimations = () => [];
  Object.assign(whop, {
    portefeuille: { applePay: false, googlePay: false },
    show: vi.fn(async () => ({ ctok: "ctok_apple", type: "apple_pay", payer: {}, billing: null, shipping: null })),
    update: vi.fn(),
    handleNextAction: vi.fn(async () => ({ status: "succeeded", redirected: false, lastPaymentError: null })),
    createConfirmationToken: vi.fn(async () => ({ confirmationToken: "ctok_carte", type: "card" })),
  });
  sait({});
  commencer.mockResolvedValue({ achat: "a1", checkout: null, url: null, paiement: { id: "pay_1", statut: "paid", secret: null } });
  etat.mockResolvedValue({ achat: "a1", offre: "premium", statut: "paye", bulles: 90, conv: "c1" });
  sessionStorage.clear();
  invalidate("feuille", "account");
});

afterEach(() => {
  Element.prototype.getAnimations = getAnimations;
  vi.clearAllMocks();
});

const tel = (texte: string) => texte.replace(/\s+/g, " ");
const promesses = () => act(async () => {});
const ouvrir = async () => {
  render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" chapitres={7} />);
  await promesses();
  await promesses();
};
const formule = () => screen.getByRole("dialog", { name: FEUILLE_FORMULE.titre("Maëlys") });
const carte = () => screen.getByRole("dialog", { name: DANS_LA_FEUILLE.carte.titre });

describe("le faux Whop : sa carte de test, dans la feuille", () => {
  it("« Débloquer » ouvre la carte ; payée : « C’est payé » prend la feuille, la livraison attendue, puis « C’est débloqué »", async () => {
    await ouvrir();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) }));
    fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("premium")) }));
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium", true, { jeton: "ctok_faux_payer" });
    /* La livraison se lit avec le paiement de Whop : le serveur le vérifie si le webhook tarde */
    expect(etat).toHaveBeenCalledWith("a1", "pay_1");
    expect(routeur.replace).toHaveBeenCalledWith("/rapport/debloque?achat=a1");
    expect(screen.getByText(DANS_LA_FEUILLE.paye.titre)).toBeTruthy();
    /* Les formules s’effacent derrière « C’est payé » */
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("refusée par la banque (402 « carte ») : la feuille le dit, rien n’est parti ailleurs, on peut réessayer", async () => {
    commencer.mockRejectedValueOnce(new ErreurApi("carte", 402));
    await ouvrir();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) }));
    fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.refuser }));
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium", true, { jeton: "ctok_faux_refuser" });
    expect(within(carte()).getByText(tel(DANS_LA_FEUILLE.carteRefusee))).toBeTruthy();
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("premium")) })).toBeTruthy();
  });
});

describe("un paiement en route ne se perd pas", () => {
  /** Un paiement parti, dont le serveur n’a pas encore répondu (et ne répondra pas pendant le test). */
  const enRoute = () => commencer.mockImplementationOnce(() => new Promise(() => {}));

  it("« Ta formule » ne se ferme pas pendant « Paiement en cours » (UI-2) : son suivi serait coupé", async () => {
    const onClose = vi.fn();
    enRoute();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" chapitres={7} />);
    await promesses();
    await promesses();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) }));
    fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("premium")) }));
    await promesses();
    fireEvent(formule(), new Event("cancel", { cancelable: true }));
    await promesses();
    expect(onClose).not.toHaveBeenCalled();
    expect(formule()).toBeTruthy();
  });

  it("l’offre ① : son compte à rebours à zéro ne la ferme pas pendant le paiement (UI-3), et ne la dit pas passée", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    try {
      enRoute();
      const rappels = { onRefus: vi.fn(), onPassee: vi.fn(), onClosed: vi.fn() };
      render(<OffreAvantDePartir fin={Date.now() + 2_000} chapitres={7} {...rappels} />);
      await promesses();
      await promesses();
      const offre = () => screen.getByRole("dialog", { name: OFFRE_SUITE.titre });
      fireEvent.click(within(offre()).getByRole("button", { name: OFFRE_SUITE.prendre }));
      fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("suite")) }));
      await promesses();
      act(() => void vi.advanceTimersByTime(3_000));
      expect(offre()).toBeTruthy();
      expect(within(offre()).queryByRole("button", { name: OFFRE_SUITE.non })).toBeNull();
      expect(rappels.onPassee).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Whop sans réponse sûre (PAY-1) : pas de « souci », la page du retour attend la livraison", async () => {
    commencer.mockResolvedValueOnce({ achat: "a1", checkout: null, url: null, paiement: null });
    await ouvrir();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) }));
    fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("premium")) }));
    await promesses();
    expect(routeur.replace).toHaveBeenCalledWith("/paiement/retour?achat=a1");
    expect(screen.queryByText(tel(FEUILLE_FORMULE.souci))).toBeNull();
  });
});

describe("les Elements de Whop", () => {
  beforeEach(() => sait({ paiement: { mode: "whop", compte: "biz_test", bacASable: false } }));

  it("Apple Pay sur cet appareil : son bouton officiel, ouvert dans le geste avec l’email du compte ; la 3-D Secure finie, « C’est débloqué »", async () => {
    whop.portefeuille = { applePay: true, googlePay: false };
    commencer.mockResolvedValueOnce({ achat: "a1", checkout: null, url: null, paiement: { id: "pay_1", statut: "open", secret: "pay_1_secret" } });
    await ouvrir();
    const bouton = within(formule()).getByRole("button", { name: DANS_LA_FEUILLE.portefeuille.apple_pay });
    expect(within(formule()).getByText(tel(DANS_LA_FEUILLE.garder))).toBeTruthy();
    fireEvent.click(bouton);
    /* Dans le geste, avant toute attente : Apple refuse une feuille ouverte plus tard */
    expect(whop.show).toHaveBeenCalledWith("apple_pay", { email: "toi@example.com" });
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium", true, { jeton: "ctok_apple" });
    expect(whop.handleNextAction).toHaveBeenCalledWith({ clientSecret: "pay_1_secret" });
    expect(routeur.replace).toHaveBeenCalledWith("/rapport/debloque?achat=a1");
  });

  it("la feuille d’Apple Pay fermée : rien ne part, aucun souci dit", async () => {
    whop.portefeuille = { applePay: true, googlePay: false };
    whop.show.mockRejectedValueOnce(new Error("payment_request_cancelled"));
    await ouvrir();
    fireEvent.click(within(formule()).getByRole("button", { name: DANS_LA_FEUILLE.portefeuille.apple_pay }));
    await promesses();
    expect(commencer).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sans portefeuille : la carte de Whop, payée quand elle est complète ; l’étape de la banque pas passée, la feuille le dit", async () => {
    commencer.mockResolvedValueOnce({ achat: "a1", checkout: null, url: null, paiement: { id: "pay_1", statut: "open", secret: "pay_1_secret" } });
    whop.handleNextAction.mockResolvedValueOnce({ status: "requires_payment_method", redirected: false, lastPaymentError: { message: "declined" } });
    await ouvrir();
    expect(within(formule()).queryByRole("button", { name: DANS_LA_FEUILLE.portefeuille.apple_pay })).toBeNull();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) }));
    const payer = within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("premium")) });
    expect((payer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(carte()).getByRole("button", { name: "la carte de Whop" }));
    fireEvent.click(payer);
    await promesses();
    expect(whop.createConfirmationToken).toHaveBeenCalledWith({ billingDetails: { email: "toi@example.com" } });
    expect(commencer).toHaveBeenCalledWith("premium", true, { jeton: "ctok_carte" });
    expect(within(carte()).getByText(tel(DANS_LA_FEUILLE.carteRefusee))).toBeTruthy();
    expect(routeur.replace).not.toHaveBeenCalled();
  });

  it("une autre formule choisie : le portefeuille montre son prix", async () => {
    whop.portefeuille = { applePay: true, googlePay: false };
    await ouvrir();
    fireEvent.click(within(formule()).getByRole("radio", { name: new RegExp(`^${FEUILLE_FORMULE.rapport.titre}`) }));
    expect(whop.update).toHaveBeenLastCalledWith({ amount: 1390, lineItems: [{ label: "Le rapport", amount: 1390 }] });
  });
});

describe("les avoirs du compte, dans la feuille et sous l’aperçu", () => {
  it("un rapport d’avance : en tête et choisi d’avance, « Débloquer · 0 € » sans payer, puis « C’est débloqué »", async () => {
    sait({ avance: { fin: "2027-10-13T12:00:00.000Z" } });
    avance.mockResolvedValueOnce({ achat: "a9" });
    await ouvrir();
    const enTete = within(formule()).getAllByRole("radio")[0]!;
    expect(enTete.getAttribute("aria-checked")).toBe("true");
    expect(within(enTete).getByText(FEUILLE_FORMULE.avance.titre)).toBeTruthy();
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.avance.debloquer }));
    await promesses();
    expect(avance).toHaveBeenCalled();
    expect(commencer).not.toHaveBeenCalled();
    expect(routeur.replace).toHaveBeenCalledWith("/rapport/debloque?achat=a9");
  });

  it("le −50 % gardé : le rapport seul à 6,95 € (13,90 € barré, jusqu’à quand), payé comme rapport_garde", async () => {
    sait({ garde: { fin: "2026-10-20T12:00:00.000Z" } });
    await ouvrir();
    const rapport = within(formule()).getByRole("radio", { name: new RegExp(`^${FEUILLE_FORMULE.rapport.titre}`) });
    expect(within(rapport).getByText(tel(prixDe("rapport_garde")))).toBeTruthy();
    expect(within(rapport).getByText(tel(FEUILLE_FORMULE.garde(jourEnLettres("2026-10-20T12:00:00.000Z"))))).toBeTruthy();
    /* Choisi d’avance, au prix que le bouton d’ouverture annonce (SUP16-1) : payer sans rien toucher paie 6,95 € */
    expect(rapport.getAttribute("aria-checked")).toBe("true");
    expect(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("rapport_garde")) })).toBeTruthy();
    fireEvent.click(rapport);
    fireEvent.click(within(formule()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("rapport_garde")) }));
    fireEvent.click(within(carte()).getByRole("button", { name: DANS_LA_FEUILLE.carte.payer(prixDe("rapport_garde")) }));
    await promesses();
    expect(commencer).toHaveBeenCalledWith("rapport_garde", true, { jeton: "ctok_faux_payer" });
  });

  it("le bas de l’aperçu gratuit le dit : le rapport d’avance, ou le prix à −50 %", async () => {
    sait({ avance: { fin: "2027-10-13T12:00:00.000Z" } });
    const { unmount } = render(<PiedGratuit ouvrirPaiement={() => {}} expliquer={() => {}} />);
    await promesses();
    expect(screen.getByRole("button", { name: PIED_GRATUIT.lireAvance })).toBeTruthy();
    unmount();
    invalidate("feuille");
    sait({ garde: { fin: "2026-10-20T12:00:00.000Z" } });
    render(<PiedGratuit ouvrirPaiement={() => {}} expliquer={() => {}} />);
    await promesses();
    expect(screen.getByRole("button", { name: PIED_GRATUIT.lireGarde })).toBeTruthy();
  });
});
