import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EcranDebloque } from "@/app/rapport/debloque/EcranDebloque";
import { RetourScreen } from "@/app/paiement/retour/RetourScreen";
import { FeuilleFormule } from "@/components/paiement/FeuilleFormule";
import { OffreAvantDePartir, restant } from "@/components/paiement/OffreAvantDePartir";
import { PiedGratuit } from "@/components/paiement/PiedGratuit";
import { CEST_QUOI, FEUILLE_BULLE } from "@/contenu/bulles";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import { DUREE_SUITE_MS, prixDe } from "@/contenu/offres";
import { DEBLOQUE, FEUILLE_FORMULE, OFFRE_PREMIUM_AJOUT, OFFRE_SUITE, PIED_GRATUIT, RETOUR_PAIEMENT } from "@/contenu/paiement";
import { commencerPaiement, etatDuPaiement, proposerOffreUnique } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";
import type { EtatAchat } from "@/types/api";

/*
 * Les écrans du paiement (le prototype validé des bulles), dans le DOM simulé : la feuille « Ta formule » (Premium
 * choisie d’avance, les flèches, la case obligatoire, « C’est quoi une bulle ? », l’offre ① en la fermant), l’offre ① et
 * son compte à rebours (l’heure de fin du serveur), le bas de l’aperçu gratuit, la page du retour (l’attente, l’échec,
 * l’annulation, les bulles reçues) et « C’est débloqué » avec l’offre ③. Le serveur est simulé (services/api), le routeur
 * aussi ; les feuilles s’ouvrent sans animation (le DOM simulé n’en a pas : moins de mouvement).
 */

const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/rapport" }));
vi.mock("@/lib/sound", async (vrai) => ({ ...(await vrai<typeof import("@/lib/sound")>()), useSoundOnce: () => {} }));
vi.mock("@/services/api", async (vrai) => ({
  ...(await vrai<typeof import("@/services/api")>()),
  commencerPaiement: vi.fn(),
  proposerOffreUnique: vi.fn(),
  etatDuPaiement: vi.fn(),
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
  commencer.mockResolvedValue({ achat: "a1", checkout: "ch_1", url: "/paiement/factice?achat=a1" });
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
const case_ = () => within(feuille()).getByRole("checkbox", { name: CASE_RENONCIATION.textes.rapport });

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

  it("la case est obligatoire : sans elle, rien ne part, la case le dit et prend le focus ; cochée, la formule choisie part payer", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    render(<FeuilleFormule open onClose={() => {}} autre="Maëlys" suite="/app" />);
    /* Le focus posé sur la feuille à l’ouverture, d’abord */
    act(() => void vi.advanceTimersToNextFrame());
    const payer = within(feuille()).getByRole("button", { name: FEUILLE_FORMULE.payer(prixDe("premium")) });
    fireEvent.click(payer);
    await promesses();
    expect(commencer).not.toHaveBeenCalled();
    expect(within(feuille()).getByRole("alert").textContent).toBe(CASE_RENONCIATION.manquante);
    expect(document.activeElement).toBe(case_());
    fireEvent.click(case_());
    expect(within(feuille()).queryByRole("alert")).toBeNull();
    fireEvent.click(payer);
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium", true);
    /* Le faux Whop est une page de l’appli : le routeur y va ; où reprendre ensuite est gardé dans l’onglet */
    expect(routeur.push).toHaveBeenCalledWith("/paiement/factice?achat=a1");
    expect(sessionStorage.getItem("blush.paiement.suite.a1")).toContain("/app");
  });

  it("refusé par le serveur : la case périmée demande de recharger, « bientot » se dit, le rapport déjà ouvert ferme la feuille", async () => {
    const onClose = vi.fn();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" />);
    fireEvent.click(case_());
    const payer = () => fireEvent.click(within(feuille()).getByRole("button", { name: /^Débloquer/ }));

    commencer.mockRejectedValueOnce(new ErreurApi("renonciation", 422));
    payer();
    await promesses();
    expect(within(feuille()).getByRole("alert").textContent).toContain(CASE_RENONCIATION.perimee);
    expect(within(feuille()).getByRole("button", { name: CASE_RENONCIATION.recharger })).toBeTruthy();
    expect((case_() as HTMLInputElement).checked).toBe(false);

    commencer.mockClear();
    payer();
    await promesses();
    /* Périmée, elle ne laisse plus rien partir avant le rechargement de la page */
    expect(commencer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sans paiement branché, la feuille dit « bientôt » ; le rapport déjà payé ailleurs la ferme, relu", async () => {
    const onClose = vi.fn();
    render(<FeuilleFormule open onClose={onClose} autre="Maëlys" />);
    fireEvent.click(case_());
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
    const fin = new Date(Date.now() + 4 * 60_000 + 30_000).toISOString();
    proposer.mockResolvedValue({ offre: "suite", fin, enUnGeste: false });
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
    render(<OffreAvantDePartir fin={new Date(Date.now() + resteMs).toISOString()} chapitres={7} {...rappels} {...props} />);
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

  it("« Je la prends » demande la case ; cochée, la suite part payer. « Non merci » la refuse", async () => {
    const { onRefus } = ouvrir(120_000, { suite: "/rapport" });
    const prendre = within(offre()).getByRole("button", { name: OFFRE_SUITE.prendre });
    fireEvent.click(prendre);
    await promesses();
    expect(commencer).not.toHaveBeenCalled();
    expect(within(offre()).getByRole("alert").textContent).toBe(CASE_RENONCIATION.manquante);
    fireEvent.click(within(offre()).getByRole("checkbox", { name: CASE_RENONCIATION.textes.rapport }));
    fireEvent.click(prendre);
    await promesses();
    expect(commencer).toHaveBeenCalledWith("suite", true);
    fireEvent.click(within(offre()).getByRole("button", { name: OFFRE_SUITE.non }));
    expect(onRefus).toHaveBeenCalledTimes(1);
  });

  it("passée entre-temps côté serveur (« offre ») : elle se ferme, comme à zéro", async () => {
    const { onPassee } = ouvrir(120_000);
    commencer.mockRejectedValueOnce(new ErreurApi("offre", 422));
    fireEvent.click(within(offre()).getByRole("checkbox"));
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
  const debloque = (offre: "rapport" | "premium") => render(<EcranDebloque achat="a1" offre={offre} bulles={10} next={null} restants={7} total={8} reprise={2} />);

  it("après le rapport seul, l’offre ③ du serveur prend la place de la liste : la case, « Ta carte est enregistrée » en un geste", async () => {
    proposer.mockResolvedValue({ offre: "premium_ajout", fin: null, enUnGeste: true });
    debloque("rapport");
    /* Tant que le serveur n’a pas répondu, ni la liste ni l’offre : rien ne se remplace sous les yeux */
    expect(screen.queryByText(DEBLOQUE.restants(7))).toBeNull();
    await promesses();
    expect(proposer).toHaveBeenCalledWith("premium_ajout");
    const offre = screen.getByRole("region", { name: OFFRE_PREMIUM_AJOUT.titre });
    expect(within(offre).getByText(tel(OFFRE_PREMIUM_AJOUT.carte))).toBeTruthy();
    expect(screen.queryByText(DEBLOQUE.restants(7))).toBeNull();
    fireEvent.click(within(offre).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre }));
    await promesses();
    expect(commencer).not.toHaveBeenCalled();
    fireEvent.click(within(offre).getByRole("checkbox", { name: CASE_RENONCIATION.textes.bulles }));
    fireEvent.click(within(offre).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre }));
    await promesses();
    expect(commencer).toHaveBeenCalledWith("premium_ajout", true);
    fireEvent.click(within(offre).getByRole("button", { name: OFFRE_PREMIUM_AJOUT.non }));
    expect(routeur.push).toHaveBeenCalledWith("/rapport#chapitre-2", { scroll: true });
  });

  it("sans moyen de paiement gardé, l’offre ③ ne promet pas un geste", async () => {
    proposer.mockResolvedValue({ offre: "premium_ajout", fin: null, enUnGeste: false });
    debloque("rapport");
    await promesses();
    expect(screen.queryByText(tel(OFFRE_PREMIUM_AJOUT.carte))).toBeNull();
  });

  it("après Premium : pas d’offre demandée, la liste (les chapitres, les bulles) et « Lire la suite »", async () => {
    debloque("premium");
    await promesses();
    expect(proposer).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: DEBLOQUE.titre })).toBeTruthy();
    expect(screen.getByText(tel(DEBLOQUE.phrase(8, 10)))).toBeTruthy();
    for (const texte of [DEBLOQUE.restants(7), DEBLOQUE.reprise(2), DEBLOQUE.bulles(10), DEBLOQUE.bullesSous]) expect(screen.getByText(texte)).toBeTruthy();
    expect(screen.getByRole("link", { name: DEBLOQUE.lire }).getAttribute("href")).toBe("/rapport#chapitre-2");
  });
});
