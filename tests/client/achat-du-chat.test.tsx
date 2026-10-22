import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchatDuChatContext, OffreDuChatCarte, useAchatDuChat } from "@/app/app/accueil/achat";
import { CATALOGUE, PREMIERE_RECHARGE, prixDe } from "@/contenu/offres";
import { OFFRE_PREMIUM_AJOUT } from "@/contenu/paiement";
import { VENTE_DU_CHAT } from "@/contenu/vente-du-chat";
import { commencerPaiement, etatDuPaiement, noterUnGesteDeVente, proposerOffreUnique } from "@/services/api";
import type { OffreDuChat } from "@/types";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Les cartes d’achat du chat (src/app/app/accueil/achat.tsx), avec le vrai paiement de l’accueil (useAchatDuChat) et un
 * serveur simulé : la recharge payée en un geste (le pack conseillé, le bonus de la première recharge), la banque qui dit
 * non, la feuille de la recharge sans carte gardée, Premium qui part sur la page du paiement, les cartes qui mènent à
 * l’import, et « Pas maintenant ».
 */

const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/app" }));
vi.mock("@/services/api", async (vrai) => ({
  ...(await vrai<typeof import("@/services/api")>()),
  commencerPaiement: vi.fn(),
  etatDuPaiement: vi.fn(),
  proposerOffreUnique: vi.fn(async () => ({ offre: null })),
  noterUnGesteDeVente: vi.fn(async () => {}),
}));

const commencer = vi.mocked(commencerPaiement);
const etat = vi.mocked(etatDuPaiement);
const proposer = vi.mocked(proposerOffreUnique);
const noter = vi.mocked(noterUnGesteDeVente);

/* Testing Library compare le texte de l’écran, espaces ramenés à une seule, à la chaîne telle quelle : ses insécables aussi */
const enEspaces = (t: string) => t.replace(/\s+/g, " ");

const surBulles = vi.fn();
const recharger = vi.fn();

/** Le chat de l’accueil : son paiement, et la carte sous une réponse. */
function Chat({ offre, attend = false }: { offre: OffreDuChat; attend?: boolean }) {
  const achat = useAchatDuChat({ surBulles, recharger });
  return (
    <AchatDuChatContext value={achat}>
      <OffreDuChatCarte offre={offre} attend={attend} />
    </AchatDuChatContext>
  );
}

beforeEach(() => {
  for (const f of [commencer, etat, noter, surBulles, recharger, routeur.push]) f.mockReset();
  proposer.mockReset();
  proposer.mockResolvedValue({ offre: null });
  noter.mockResolvedValue(undefined);
});

describe("la recharge dans le chat", () => {
  it("en un geste : le pack conseillé, payé sans quitter la conv, puis les bulles livrées", async () => {
    commencer.mockResolvedValue({ achat: "a1", checkout: null, url: null, paiement: null });
    etat.mockResolvedValue({ achat: "a1", offre: "pack80", statut: "paye", bulles: CATALOGUE.pack80.bulles, conv: null });
    render(<Chat offre={{ genre: "bulles", solde: 2, enUnGeste: true }} />);
    expect(screen.getByText(VENTE_DU_CHAT.bulles.reste(2))).toBeTruthy();
    expect(screen.getByRole("radio", { checked: true }).textContent).toContain(String(CATALOGUE.pack80.bulles));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: VENTE_DU_CHAT.bulles.recharger(prixDe("pack80")) })));
    expect(commencer).toHaveBeenCalledWith("pack80", true, { geste: true, vente: "bulles" });
    expect(noter).toHaveBeenCalledWith("touchee", "bulles");
    expect(surBulles).toHaveBeenCalledWith(CATALOGUE.pack80.bulles);
    expect(screen.getByRole("status").textContent).toBe(VENTE_DU_CHAT.bulles.paye(CATALOGUE.pack80.bulles, 2 + CATALOGUE.pack80.bulles));
  });

  it("le bonus de la première recharge, quand le serveur le montre : sur le pack conseillé", async () => {
    proposer.mockResolvedValue({ offre: "premiere_recharge", fin: null, reste: null, enUnGeste: true });
    render(<Chat offre={{ genre: "bulles", solde: 1, enUnGeste: true }} />);
    await act(async () => {});
    expect(proposer).toHaveBeenCalledWith("premiere_recharge");
    expect(screen.getByRole("radio", { checked: true }).textContent).toContain(String(CATALOGUE.pack80.bulles + PREMIERE_RECHARGE.bonus));
  });

  it("la banque dit non : rien n’est débité, il réessaie ; un autre pack se choisit", async () => {
    commencer.mockRejectedValueOnce(new ErreurApi("carte", 402));
    render(<Chat offre={{ genre: "bulles", solde: 0, enUnGeste: true }} attend />);
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(String(CATALOGUE.pack30.bulles)) }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: VENTE_DU_CHAT.bulles.recharger(prixDe("pack30")) })));
    expect(screen.getByRole("alert").textContent).toBe(VENTE_DU_CHAT.refus.carte);
    /* Sa réponse attend au-dessus : pas de « Pas maintenant » */
    expect(screen.queryByRole("button", { name: VENTE_DU_CHAT.pasMaintenant })).toBeNull();
  });

  it("sans carte gardée : la feuille de la recharge s’ouvre", () => {
    render(<Chat offre={{ genre: "bulles", solde: 2, enUnGeste: false }} />);
    fireEvent.click(screen.getByRole("button", { name: VENTE_DU_CHAT.bulles.voir }));
    expect(recharger).toHaveBeenCalled();
    expect(noter).toHaveBeenCalledWith("touchee", "bulles");
    expect(commencer).not.toHaveBeenCalled();
  });

  it("« Pas maintenant » : la carte s’efface, et c’est compté", () => {
    const { container } = render(<Chat offre={{ genre: "bulles", solde: 2, enUnGeste: true }} />);
    fireEvent.click(screen.getByRole("button", { name: VENTE_DU_CHAT.pasMaintenant }));
    expect(noter).toHaveBeenCalledWith("refusee", "bulles");
    expect(container.textContent).toBe("");
  });
});

describe("Premium, et les cartes qui mènent à l’import", () => {
  it("Premium sans paiement en un geste : la page du paiement s’ouvre, le bouton reste occupé", async () => {
    commencer.mockResolvedValue({ achat: "a2", checkout: null, url: "/paiement/factice?achat=a2", paiement: null });
    render(<Chat offre={{ genre: "premium", enUnGeste: false }} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre })));
    expect(commencer).toHaveBeenCalledWith("premium_ajout", true, { geste: true, vente: "premium" });
    expect(routeur.push).toHaveBeenCalledWith("/paiement/factice?achat=a2");
    expect(screen.getByRole("button", { name: VENTE_DU_CHAT.enCours })).toBeTruthy();
  });

  it("Premium passé entre-temps : il le dit, rien n’est débité", async () => {
    commencer.mockRejectedValue(new ErreurApi("offre", 409));
    render(<Chat offre={{ genre: "premium", enUnGeste: true }} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: OFFRE_PREMIUM_AJOUT.prendre })));
    expect(screen.getByRole("alert").textContent).toBe(VENTE_DU_CHAT.refus.passee);
  });

  it("une autre conv, le rapport à jour, le réimport : vers l’import, le geste compté", () => {
    const { unmount } = render(<Chat offre={{ genre: "autre", prenom: "Léa" }} />);
    const lien = screen.getByRole("link", { name: new RegExp(VENTE_DU_CHAT.autre.lire("Léa")) });
    expect(lien.getAttribute("href")).toBe("/commencer");
    fireEvent.click(lien);
    expect(noter).toHaveBeenCalledWith("touchee", "autre");
    unmount();
    render(<Chat offre={{ genre: "a_jour", prenom: "Sophie", depuis: "2 octobre" }} />);
    expect(screen.getByText(enEspaces(VENTE_DU_CHAT.aJour.texte("Sophie", "2 octobre")))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: VENTE_DU_CHAT.pasMaintenant }));
    expect(noter).toHaveBeenCalledWith("refusee", "a_jour");
  });

  it("le réimport, qu’il a demandé, n’a pas de « Pas maintenant » ; sans le paiement du chat, aucune carte", () => {
    render(<Chat offre={{ genre: "reimport", prenom: "Sophie" }} />);
    expect(screen.getByText(enEspaces(VENTE_DU_CHAT.reimport.texte("Sophie")))).toBeTruthy();
    expect(screen.queryByRole("button", { name: VENTE_DU_CHAT.pasMaintenant })).toBeNull();
    render(<Chat offre={{ genre: "a_jour", prenom: "Sophie", depuis: null }} />);
    expect(screen.getByText(enEspaces(VENTE_DU_CHAT.aJour.texte("Sophie", null)))).toBeTruthy();
    render(<Chat offre={{ genre: "autre", prenom: null }} />);
    expect(screen.getByRole("link", { name: new RegExp(VENTE_DU_CHAT.autre.lire(null)) })).toBeTruthy();
    const { container } = render(<OffreDuChatCarte offre={{ genre: "autre", prenom: null }} />);
    expect(container.textContent).toBe("");
  });
});
