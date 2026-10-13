import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EcranDebloque } from "@/app/rapport/debloque/EcranDebloque";
import { RetourScreen } from "@/app/paiement/retour/RetourScreen";
import { FeuilleFormule } from "@/components/paiement/FeuilleFormule";
import { OffreAvantDePartir, restant } from "@/components/paiement/OffreAvantDePartir";
import { PiedGratuit } from "@/components/paiement/PiedGratuit";
import { CEST_QUOI, FEUILLE_BULLE } from "@/contenu/bulles";
import { CASE_IMPORT, CASE_RENONCIATION, texteRenonciation, type AchatImmediat } from "@/contenu/consentements";
import { DUREE_SUITE_MS, prixDe } from "@/contenu/offres";
import { DEBLOQUE, FEUILLE_FORMULE, OFFRE_GARDE, OFFRE_PREMIUM_AJOUT, OFFRE_SECOND, OFFRE_SUITE, PIED_GRATUIT, RETOUR_PAIEMENT } from "@/contenu/paiement";
import { jourEnLettres } from "@/lib/format";
import { commencerPaiement, etatDuPaiement, proposerOffreUnique } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";
import type { EtatAchat } from "@/types/api";

/*
 * Les écrans du paiement (le prototype validé des bulles), dans le DOM simulé : la feuille « Ta formule » (Premium
 * choisie d’avance, les flèches, le paiement au premier toucher et la ligne de la renonciation sous le bouton, « C’est
 * quoi une bulle ? », l’offre ① en la fermant), l’offre ① et
 * son compte à rebours (l’heure de fin du serveur), le bas de l’aperçu gratuit, la page du retour (l’attente, l’échec,
 * l’annulation, les bulles reçues) et « C’est débloqué » avec ses offres (③, le 2e rapport, le −50 % gardé). Le serveur
 * est simulé (services/api), le routeur aussi ; les feuilles s’ouvrent sans animation (le DOM simulé n’en a pas : moins
 * de mouvement). Sans paiement dans la feuille (le mode null de GET /api/paiement/feuille) : la page de Whop, comme
 * avant ; le paiement dans la feuille a ses tests (tests/client/paiement-integre.test.tsx).
 */

const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/rapport" }));
vi.mock("@/lib/sound", async (vrai) => ({ ...(await vrai<typeof import("@/lib/sound")>()), useSoundOnce: () => {} }));
vi.mock("@/services/api", async (vrai) => ({
  ...(await vrai<typeof import("@/services/api")>()),
  commencerPaiement: vi.fn(),
  proposerOffreUnique: vi.fn(),
  etatDuPaiement: vi.fn(),
  lireFeuilleDuPaiement: vi.fn(async () => ({ paiement: { mode: null }, avance: null, garde: null })),
  getAccount: vi.fn(async () => ({ email: "toi@example.com", bulles: 10, client: true, equipe: false, storyDeleted: false })),
}));

const commencer = vi.mocked(commencerPaiement);
const proposer = vi.mocked(proposerOffreUnique);
const etat = vi.mocked(etatDuPaiement);
const { getAnimations } = Element.prototype;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.getAnimations = () => [];
  commencer.mockResolvedValue({ achat: "a1", checkout: "ch_1", url: "/paiement/factice?achat=a1", paiement: null });
  proposer.mockResolvedValue({ offre: null });
  sessionStorage.clear();
});

afterEach(() => {
  Element.prototype.getAnimations = getAnimations;
  vi.useRealTimers();
  vi.clearAllMocks();
});

/**
 * Un texte tel que getByText le cherche : il compare au texte du DOM normalisé (les espaces, insécables comprises,
 * ramenés à une espace), sans normaliser ce qu’on lui donne.
 */
const tel = (texte: string) => texte.replace(/\s+/g, " ");

/** Laisse passer les promesses en cours (une réponse simulée du serveur, et ce qui la suit). */
const promesses = () => act(async () => {});

const feuille = () => screen.getByRole("dialog", { name: FEUILLE_FORMULE.titre("Maëlys") });
const formule = (nom: RegExp) => within(feuille()).getByRole("radio", { name: nom });
/**
 * La ligne de la renonciation dans `ici`, juste sous le bouton qui paie (`bouton`) : son texte, son lien vers la section
 * des conditions, et aucune case à cocher.
 */
function renonciationSous(ici: HTMLElement, bouton: HTMLElement, quoi: AchatImmediat) {
  expect(within(ici).queryByRole("checkbox")).toBeNull();
  const ligne = bouton.nextElementSibling;
  expect(ligne?.textContent).toBe(texteRenonciation(quoi));
  expect(
    within(ligne as HTMLElement)
      .getByRole("link", { name: CASE_RENONCIATION.lien })
      .getAttribute("href"),
  ).toBe(CASE_RENONCIATION.ancre);
}

describe("la feuille « Ta formule »", () => {
  it("Premium choisie d’avance, ouverte : ce qu’elle contient ligne à ligne, son badge, et le bouton à son prix ; le focus va sur la feuille", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" chapitres={7} />);
    act(() => void vi.advanceTimersToNextFrame());
    expect(feuille().contains(document.activeElement)).toBe(true);
    const premium = formule(/^Rapport \+ 60 bulles/);
    expect(premium.getAttribute("aria-checked")).toBe("true");
    expect(formule(/^Le rapport/).getAttribute("aria-checked")).toBe("false");
    const p = FEUILLE_FORMULE.premium;
    for (const texte of [p.offertes, p.note, p.bulles, p.economie, p.badge]) expect(within(premium).getByText(tel(texte))).toBeTruthy();
    /* Les prix barrés : « au lieu de » pour un lecteur d’écran */
    expect(premium.textContent).toContain(`${FEUILLE_FORMULE.auLieuDe}${p.barreOffertes}`);
    expect(premium.textContent).toContain(`${p.rapport} ${p.chapitres(7)}`);
    /* Le badge vient après le titre dans le texte lu */
    expect(premium.textContent!.startsWith(p.titre)).toBe(true);
    expect(within(feuille()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: FEUILLE_FORMULE.groupe })).toBeTruthy();
  });

  it("au clavier : les flèches passent au rapport seul, qui s’ouvre, et le bouton change de prix", () => {
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" chapitres={6} />);
    const premium = formule(/^Rapport \+ 60 bulles/);
    expect(premium.tabIndex).toBe(0);
    premium.focus();
    fireEvent.keyDown(premium, { key: "ArrowUp" });
    const rapport = formule(/^Le rapport/);
    expect(document.activeElement).toBe(rapport);
    expect(rapport.getAttribute("aria-checked")).toBe("true");
    expect(within(rapport).getByText(FEUILLE_FORMULE.rapport.contenu(6))).toBeTruthy();
    expect(within(feuille()).queryByText(FEUILLE_FORMULE.premium.bulles)).toBeNull();
    expect(within(feuille()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("rapport")) })).toBeTruthy();
  });

  it("pas de case : la ligne de la renonciation sous le bouton, qui paie au premier toucher la formule choisie", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" suite="/app" />);
    /* Le focus posé sur la feuille à l’ouverture, d’abord */
    act(() => void vi.advanceTimersToNextFrame());
    const payer = within(feuille()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) });
    renonciationSous(feuille(), payer, "rapport");
    fireEvent.click(payer);
    await promesses();
    expect(within(feuille()).queryByRole("alert")).toBeNull();
    /* Le geste de payer donne la renonciation : sa version part avec la commande (services/api) */
    expect(commencer).toHaveBeenCalledWith("premium", true);
    /* Le faux Whop est une page de l’appli : le routeur y va ; où reprendre ensuite est gardé dans l’onglet */
    expect(routeur.push).toHaveBeenCalledWith("/paiement/factice?achat=a1");
    expect(sessionStorage.getItem("blush.paiement.suite.a1")).toContain("/app");
  });

  it("refusé par le serveur : la renonciation périmée demande de recharger, « bientot » se dit, le rapport déjà ouvert ferme la feuille", async () => {
    const onClose = vi.fn();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" />);
    const payer = () => fireEvent.click(within(feuille()).getByRole("button", { name: /^Débloquer/ }));

    commencer.mockRejectedValueOnce(new ErreurApi("renonciation", 422));
    payer();
    await promesses();
    expect(within(feuille()).getByRole("alert").textContent).toContain(CASE_IMPORT.perimee);
    const recharger = within(feuille()).getByRole("button", { name: CASE_IMPORT.recharger });
    expect(within(feuille()).queryByText(texteRenonciation("rapport"))).toBeNull();

    commencer.mockClear();
    payer();
    await promesses();
    /* Périmée, elle ne laisse plus rien partir avant le rechargement de la page : le focus va au rechargement */
    expect(commencer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(recharger);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sans paiement branché, la feuille dit « bientôt » ; le rapport déjà payé ailleurs la ferme, relu", async () => {
    const onClose = vi.fn();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" />);
    commencer.mockRejectedValueOnce(new ErreurApi("bientot", 402));
    fireEvent.click(within(feuille()).getByRole("button", { name: /^Débloquer/ }));
    await promesses();
    expect(within(feuille()).getByRole("status").textContent).toBe(FEUILLE_FORMULE.bientot);

    commencer.mockRejectedValueOnce(new ErreurApi("deja", 409));
    fireEvent.click(within(feuille()).getByRole("button", { name: /^Débloquer/ }));
    await promesses();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(routeur.refresh).toHaveBeenCalled();
  });

  it("« C’est quoi une bulle ? » ouvre sa feuille par-dessus ; « Compris » y revient", () => {
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" />);
    fireEvent.click(within(feuille()).getByRole("button", { name: CEST_QUOI.nom }));
    const bulle = screen.getByRole("dialog", { name: FEUILLE_BULLE.titre });
    fireEvent.click(within(bulle).getByRole("button", { name: FEUILLE_BULLE.compris }));
    expect(screen.queryByRole("dialog", { name: FEUILLE_BULLE.titre })).toBeNull();
    expect(feuille()).toBeTruthy();
  });

  it("fermée sans payer (Échap) : l’offre ① monte une fois la feuille redescendue, à l’heure de fin du serveur", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const reste = 4 * 60_000 + 30_000;
    proposer.mockResolvedValue({ offre: "suite", fin: new Date(Date.now() + reste).toISOString(), reste, enUnGeste: false });
    const onClose = vi.fn();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" />);
    fireEvent(feuille(), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(proposer).toHaveBeenCalledWith("suite");
    await promesses();
    expect(screen.queryByRole("dialog", { name: OFFRE_SUITE.titre })).toBeNull();
    await act(async () => void vi.advanceTimersByTime(500));
    const offre = screen.getByRole("dialog", { name: OFFRE_SUITE.titre });
    expect(within(offre).getByRole("timer", { name: OFFRE_SUITE.fin }).textContent).toBe("04:30");
  });

  it("l’horloge du téléphone en avance (ou en retard) sur le serveur : le compte à rebours part du temps qu’il reste au serveur", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const reste = 4 * 60_000 + 30_000;
    for (const ecart of [10 * 60_000, -10 * 60_000]) {
      /* L’heure de fin du serveur, lue à l’horloge du serveur : le téléphone a `ecart` d’avance */
      const fin = new Date(Date.now() - ecart + reste).toISOString();
      proposer.mockResolvedValue({ offre: "suite", fin, reste, enUnGeste: false });
      const { unmount } = render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" />);
      fireEvent(feuille(), new Event("cancel", { cancelable: true }));
      await promesses();
      await act(async () => void vi.advanceTimersByTime(500));
      const offre = screen.getByRole("dialog", { name: OFFRE_SUITE.titre });
      expect(within(offre).getByRole("timer", { name: OFFRE_SUITE.fin }).textContent, `écart ${ecart}`).toBe("04:30");
      unmount();
    }
  });

  it("fermée là où la fermer quitte la page : pas d’offre ①", async () => {
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" proposerLaSuite={false} />);
    fireEvent(feuille(), new Event("cancel", { cancelable: true }));
    await promesses();
    expect(proposer).not.toHaveBeenCalled();
  });
});

describe("l’offre ① et son compte à rebours", () => {
  const offre = () => screen.getByRole("dialog", { name: OFFRE_SUITE.titre });
  const ouvrir = (resteMs: number, props: Partial<Parameters<typeof OffreAvantDePartir>[0]> = {}) => {
    const rappels = { onRefus: vi.fn(), onPassee: vi.fn(), onClosed: vi.fn() };
    render(<OffreAvantDePartir fin={Date.now() + resteMs} chapitres={7} {...rappels} {...props} />);
    return rappels;
  };

  it("le temps qu’il reste, en minutes et secondes, arrondi à la seconde au-dessus ; jamais négatif", () => {
    expect([restant(DUREE_SUITE_MS), restant(61_000), restant(59_001), restant(0), restant(-5)]).toEqual(["05:00", "01:01", "01:00", "00:00", "00:00"]);
  });

  it("il part de l’heure de fin du serveur, se vide chaque seconde (la barre aussi), et se lit à la demande", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    ouvrir(150_000);
    const minuteur = within(offre()).getByRole("timer", { name: OFFRE_SUITE.fin });
    expect(minuteur.getAttribute("aria-live")).toBe("off");
    expect(minuteur.textContent).toBe("02:30");
    const barre = offre().querySelector<HTMLElement>("[data-barre]")!;
    expect(barre.style.width).toBe("50%");
    act(() => void vi.advanceTimersByTime(1_000));
    expect(minuteur.textContent).toBe("02:29");
    /* Ce qu’elle contient, en pastilles : une liste */
    expect(
      within(offre())
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([OFFRE_SUITE.chapitres(7), OFFRE_SUITE.vocal, OFFRE_SUITE.contenu]);
  });

  it("à zéro, elle se ferme pour de bon, et l’écran le dit une fois", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    const { onPassee, onRefus } = ouvrir(2_000);
    act(() => void vi.advanceTimersByTime(2_250));
    expect(screen.queryByRole("dialog", { name: OFFRE_SUITE.titre })).toBeNull();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(onPassee).toHaveBeenCalledTimes(1);
    expect(onRefus).not.toHaveBeenCalled();
  });

  it("« Je la prends » paie la suite au premier toucher, la renonciation dite juste sous lui. « Non merci » la refuse", async () => {
    const { onRefus } = ouvrir(120_000, { suite: "/rapport" });
    const prendre = within(offre()).getByRole("button", { name: OFFRE_SUITE.prendre });
    renonciationSous(offre(), prendre, "rapport");
    fireEvent.click(prendre);
    await promesses();
    expect(commencer).toHaveBeenCalledWith("suite", true);
    fireEvent.click(within(offre()).getByRole("button", { name: OFFRE_SUITE.non }));
    expect(onRefus).toHaveBeenCalledTimes(1);
  });

  it("passée entre-temps côté serveur (« offre ») : elle se ferme, comme à zéro", async () => {
    const { onPassee } = ouvrir(120_000);
    commencer.mockRejectedValueOnce(new ErreurApi("offre", 422));
    fireEvent.click(within(offre()).getByRole("button", { name: OFFRE_SUITE.prendre }));
    await promesses();
    expect(screen.queryByRole("dialog", { name: OFFRE_SUITE.titre })).toBeNull();
    expect(onPassee).toHaveBeenCalledTimes(1);
  });
});

describe("le bas de l’aperçu gratuit", () => {
  it("« Lire la suite · 9,90 € » ouvre la feuille, la ligne rose explique les bulles : deux boutons qui ouvrent une feuille", () => {
    const ouvrirPaiement = vi.fn();
    const expliquer = vi.fn();
    render(<PiedGratuit ouvrirPaiement={ouvrirPaiement} expliquer={expliquer} />);
    const lire = screen.getByRole("button", { name: PIED_GRATUIT.lire });
    const bulles = screen.getByRole("button", { name: new RegExp(`^${PIED_GRATUIT.offertes}`) });
    expect(bulles.textContent).toBe(`${PIED_GRATUIT.offertes}${PIED_GRATUIT.regle}`);
    expect([lire.getAttribute("aria-haspopup"), bulles.getAttribute("aria-haspopup")]).toEqual(["dialog", "dialog"]);
    fireEvent.click(lire);
    fireEvent.click(bulles);
    expect([ouvrirPaiement.mock.calls.length, expliquer.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("la page du retour", () => {
  const achat = (a: Partial<EtatAchat>): EtatAchat => ({ achat: "a1", offre: "rapport", statut: "en_attente", bulles: 10, conv: "c1", ...a });

  it("un rapport payé : « C’est débloqué », qui reprendra où le paiement a commencé", async () => {
    sessionStorage.setItem("blush.paiement.suite.a1", "/app");
    etat.mockResolvedValue(achat({ statut: "paye" }));
    render(<RetourScreen achat="a1" paiement="pay_1" statut="succeeded" />);
    expect(screen.getByRole("heading", { level: 1, name: RETOUR_PAIEMENT.attente.titre })).toBeTruthy();
    await promesses();
    expect(etat).toHaveBeenCalledWith("a1", "pay_1");
    expect(routeur.replace).toHaveBeenCalledWith(`/rapport/debloque?achat=a1&suite=${encodeURIComponent("/app")}`);
  });

  it("des bulles payées : elles se disent, puis on revient au chat", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    etat.mockResolvedValue(achat({ offre: "pack80", statut: "paye", bulles: 120, conv: null }));
    render(<RetourScreen achat="a1" paiement={null} statut={null} />);
    await promesses();
    expect(screen.getByRole("heading", { level: 1, name: RETOUR_PAIEMENT.recu(120).titre })).toBeTruthy();
    expect(screen.getByRole("link", { name: RETOUR_PAIEMENT.continuer }).getAttribute("href")).toBe("/app");
    expect(routeur.replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1_800));
    expect(routeur.replace).toHaveBeenCalledWith("/app");
  });

  it("annulé chez Whop, l’achat encore en attente : on le dit tout de suite, « Réessayer » rouvre la feuille ; plus rien n’est relu", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    etat.mockResolvedValue(achat({}));
    render(<RetourScreen achat="a1" paiement={null} statut="canceled" />);
    await promesses();
    expect(screen.getByRole("status").textContent).toBe(`${RETOUR_PAIEMENT.abandon.titre}${RETOUR_PAIEMENT.abandon.texte}`);
    expect(screen.getByRole("link", { name: RETOUR_PAIEMENT.reessayer }).getAttribute("href")).toBe("/rapport?paiement=1");
    expect(screen.getByRole("link", { name: RETOUR_PAIEMENT.revenir }).getAttribute("href")).toBe("/rapport");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(etat).toHaveBeenCalledTimes(1);
  });

  it("refusé : l’échec se dit ; pour des bulles, « Réessayer » ramène où le paiement a commencé", async () => {
    sessionStorage.setItem("blush.paiement.suite.a1", "/app");
    etat.mockResolvedValue(achat({ offre: "pack30", statut: "echoue", conv: null }));
    render(<RetourScreen achat="a1" paiement="pay_1" statut="failed" />);
    await promesses();
    expect(screen.getByRole("heading", { level: 1, name: RETOUR_PAIEMENT.echoue.titre })).toBeTruthy();
    expect(screen.getByRole("link", { name: RETOUR_PAIEMENT.reessayer }).getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("link", { name: RETOUR_PAIEMENT.revenir })).toBeNull();
  });

  it("le webhook tarde : une minute, puis « met du temps », relu plus lentement, et pas sans fin", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    etat.mockResolvedValue(achat({}));
    render(<RetourScreen achat="a1" paiement={null} statut={null} />);
    for (let i = 0; i < 60; i++) await act(async () => void vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("heading", { level: 1, name: RETOUR_PAIEMENT.long.titre })).toBeTruthy();
    const lus = etat.mock.calls.length;
    await act(async () => void vi.advanceTimersByTime(1_000));
    expect(etat.mock.calls.length).toBe(lus);
    for (let i = 0; i < 200; i++) await act(async () => void vi.advanceTimersByTime(5_000));
    expect(etat.mock.calls.length).toBeLessThanOrEqual(60 + 108);
  });

  it("pas son achat : introuvable, et le retour au rapport", async () => {
    etat.mockRejectedValue(new ErreurApi("introuvable", 404));
    render(<RetourScreen achat="a1" paiement={null} statut={null} />);
    await promesses();
    expect(screen.getByRole("heading", { level: 1, name: RETOUR_PAIEMENT.introuvable.titre })).toBeTruthy();
    expect(screen.getByRole("link", { name: RETOUR_PAIEMENT.revenir })).toBeTruthy();
  });
});

describe("« C’est débloqué »", () => {
  const debloque = (offre: "rapport" | "premium" | "second") => render(<EcranDebloque achat="a1" offre={offre} bulles={10} next={null} restants={7} total={8} reprise={2} />);
  /** Le serveur montre ces offres de la page, et aucune autre. */
  const montre = (...offres: ("premium_ajout" | "second_rapport")[]) =>
    proposer.mockImplementation(async (o) => (offres.includes(o as "premium_ajout") ? { offre: o, fin: null, reste: null, enUnGeste: true } : { offre: null }));
  /** L’achat payé en un geste, livré à la première relecture. */
  const livre = (offre: EtatAchat["offre"], bulles: number) => {
    commencer.mockResolvedValueOnce({ achat: "a2", checkout: null, url: null, paiement: null });
    etat.mockResolvedValueOnce({ achat: "a2", offre, statut: "paye", bulles, conv: null });
  };

  it("après le rapport seul, l’offre ③ du serveur prend la place de la liste : « Ta carte est enregistrée », payée en un geste sans quitter la page", async () => {
    montre("premium_ajout");
    livre("premium_ajout", 80);
    debloque("rapport");
    /* Tant que le serveur n’a pas répondu, ni la liste ni l’offre : rien ne se remplace sous les yeux */
    expect(screen.queryByText(DEBLOQUE.restants(7))).toBeNull();
    await promesses();
    /* Pour l’achat qui vient d’être payé : le serveur ne la montre que dans les 15 minutes qui le suivent */
    expect(proposer).toHaveBeenCalledWith("premium_ajout", "a1");
    const offre = screen.getByRole("region", { name: OFFRE_PREMIUM_AJOUT.titre });
    expect(within(offre).getByText(tel(OFFRE_PREMIUM_AJOUT.carte))).toBeTruthy();
    expect(screen.queryByText(DEBLOQUE.restants(7))).toBeNull();
    const prendre = within(offre).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre });
    renonciationSous(offre, prendre, "bulles");
    fireEvent.click(prendre);
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium_ajout", true);
    /* Livrée : ses bulles comptées ici, la liste, et la page ne s’est pas quittée */
    expect(etat).toHaveBeenCalledWith("a2", null);
    expect(screen.getByText(tel(DEBLOQUE.phrase(8, 90)))).toBeTruthy();
    expect(screen.getByText(DEBLOQUE.bulles(90))).toBeTruthy();
    expect(routeur.push).not.toHaveBeenCalled();
    expect(routeur.replace).not.toHaveBeenCalled();
  });

  it("③ refusée : son repli, le 2e rapport à −50 % sur son billet ; refusé à son tour, la liste (après le rapport seul, pas de −50 % gardé)", async () => {
    montre("premium_ajout", "second_rapport");
    debloque("rapport");
    await promesses();
    fireEvent.click(within(screen.getByRole("region", { name: OFFRE_PREMIUM_AJOUT.titre })).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.non }));
    await promesses();
    expect(proposer).toHaveBeenLastCalledWith("second_rapport", "a1");
    const second = screen.getByRole("region", { name: `${OFFRE_SECOND.avant}${OFFRE_SECOND.remise}` });
    for (const texte of [OFFRE_SECOND.billet.titre, OFFRE_SECOND.billet.prix, OFFRE_SECOND.billet.barre, OFFRE_SECOND.pied])
      expect(within(second).getByText(tel(texte))).toBeTruthy();
    fireEvent.click(within(second).getByRole("button", { name: OFFRE_SECOND.non }));
    await promesses();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByText(DEBLOQUE.restants(7))).toBeTruthy();
    expect(screen.getByRole("link", { name: DEBLOQUE.lire }).getAttribute("href")).toBe("/rapport#chapitre-2");
  });

  it("l’offre ③ que le serveur ne vend plus (prise dans un autre onglet, 422 « offre ») : elle s’efface, la liste revient, sans « souci »", async () => {
    montre("premium_ajout");
    commencer.mockRejectedValueOnce(new ErreurApi("offre", 422));
    debloque("rapport");
    await promesses();
    const offre = screen.getByRole("region", { name: OFFRE_PREMIUM_AJOUT.titre });
    fireEvent.click(within(offre).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre }));
    await promesses();
    expect(screen.queryByRole("region", { name: OFFRE_PREMIUM_AJOUT.titre })).toBeNull();
    expect(screen.queryByText(OFFRE_PREMIUM_AJOUT.souci)).toBeNull();
    expect(screen.getByText(DEBLOQUE.restants(7))).toBeTruthy();
    expect(screen.getByRole("link", { name: DEBLOQUE.lire }).getAttribute("href")).toBe("/rapport#chapitre-2");
  });

  it("sans moyen de paiement gardé, l’offre ③ ne promet pas un geste", async () => {
    proposer.mockResolvedValue({ offre: "premium_ajout", fin: null, reste: null, enUnGeste: false });
    debloque("rapport");
    await promesses();
    expect(screen.queryByText(tel(OFFRE_PREMIUM_AJOUT.carte))).toBeNull();
    expect(screen.getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre })).toBeTruthy();
  });

  it("après Premium : le 2e rapport à −50 %, payé en un geste ; le tampon « À toi », puis la liste dit le rapport d’avance", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montre("second_rapport");
    livre("second", 0);
    debloque("premium");
    await promesses();
    expect(proposer).toHaveBeenCalledWith("second_rapport", "a1");
    const second = screen.getByRole("region", { name: `${OFFRE_SECOND.avant}${OFFRE_SECOND.remise}` });
    const prendre = within(second).getByRole("button", { name: OFFRE_SECOND.prendre });
    /* Livré seulement à son usage : aucune renonciation à son achat, ni dite, ni envoyée ; le délai de 14 jours, lui, est dit */
    expect(within(second).queryByRole("link", { name: CASE_RENONCIATION.lien })).toBeNull();
    expect(within(second).getByText(tel(OFFRE_SECOND.pied))).toBeTruthy();
    fireEvent.click(prendre);
    await promesses();
    expect(commencer).toHaveBeenCalledWith("second", false);
    expect(within(second).getByText(OFFRE_SECOND.billet.tampon)).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(1_600));
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByText(DEBLOQUE.avance)).toBeTruthy();
    /* Le 2e rapport ne donne pas de bulles tout de suite : celles du rapport, à son usage */
    expect(screen.getByText(DEBLOQUE.bulles(10))).toBeTruthy();
  });

  it("après Premium, le 2e rapport refusé : le −50 % gardé 7 jours, sans rien payer ; « Garde-le-moi » le fait garder au serveur, et la liste le dit", async () => {
    montre("second_rapport");
    debloque("premium");
    await promesses();
    fireEvent.click(within(screen.getByRole("region", { name: `${OFFRE_SECOND.avant}${OFFRE_SECOND.remise}` })).getByRole("button", { name: OFFRE_SECOND.non }));
    await promesses();
    /* Le repli se montre sans appeler le serveur : il ne garde rien tant qu’on ne le demande pas */
    expect(proposer).toHaveBeenCalledTimes(1);
    const garde = screen.getByRole("region", { name: OFFRE_GARDE.titre });
    const fin = new Date(Date.now() + 7 * 864e5).toISOString();
    proposer.mockResolvedValueOnce({ offre: "garde_second", fin, reste: null, enUnGeste: false });
    fireEvent.click(within(garde).getByRole("button", { name: OFFRE_GARDE.garder }));
    await promesses();
    expect(proposer).toHaveBeenLastCalledWith("garde_second", "a1");
    expect(screen.getByText(tel(OFFRE_GARDE.garde(jourEnLettres(fin))))).toBeTruthy();
    expect(screen.getByText(tel(DEBLOQUE.garde))).toBeTruthy();
    expect(commencer).not.toHaveBeenCalled();
  });

  it("après un rapport d’avance utilisé : aucune offre demandée, la liste (les chapitres, ses bulles) et « Lire la suite »", async () => {
    debloque("second");
    await promesses();
    expect(proposer).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: DEBLOQUE.titre })).toBeTruthy();
    expect(screen.getByText(tel(DEBLOQUE.phrase(8, 10)))).toBeTruthy();
    for (const texte of [DEBLOQUE.restants(7), DEBLOQUE.reprise(2), DEBLOQUE.bulles(10), DEBLOQUE.bullesSous]) expect(screen.getByText(texte)).toBeTruthy();
    expect(screen.getByRole("link", { name: DEBLOQUE.lire }).getAttribute("href")).toBe("/rapport#chapitre-2");
  });
});
