import { expect, type Page, type Request } from "@playwright/test";
import type { OffreId } from "../../../src/types";
import { URL_APPLI } from "../reglages";
import { RESEAU } from "./page";

/*
 * Le paiement par le faux Whop (BLUSH_PAIEMENT_FACTICE, posé par playwright.config.ts) : sa page de paiement est locale,
 * et son bouton « Payer » poste un vrai webhook signé à /api/paiement/whop, que le serveur vérifie et livre comme ceux
 * de Whop. Les états d’un achat se lisent en base (aide/base.ts, compteDe).
 */

/** Le paiement commencé comme l’écran le fait (POST /api/paiement, la case de renonciation cochée) : l’achat, et la page où le payer. */
export async function commencerPaiement(page: Page, offre: OffreId): Promise<{ achat: string; url: string }> {
  const r = await page.request.post("/api/paiement", { headers: { origin: URL_APPLI }, data: { offre, renonciation: true }, timeout: RESEAU });
  expect(r.status(), `le paiement de ${offre} commence`).toBe(200);
  return (await r.json()) as { achat: string; url: string };
}

/**
 * Paie cette offre au faux Whop, comme un acheteur : le paiement commencé, sa page, « Payer », puis la page où mène le
 * retour (« C’est débloqué » pour un rapport, l’accueil pour des bulles). Rend l’id de l’achat, et le webhook posté
 * (de quoi le rejouer).
 */
export async function payer(page: Page, offre: OffreId): Promise<{ achat: string; webhook: Request }> {
  const { achat, url } = await commencerPaiement(page, offre);
  await page.goto(url);
  const [webhook] = await Promise.all([
    page.waitForRequest((r) => new URL(r.url()).pathname === "/api/paiement/whop", { timeout: RESEAU }),
    page.getByRole("button", { name: "Payer", exact: true }).click(),
  ]);
  await page.waitForURL((u) => !u.pathname.startsWith("/paiement/"), { timeout: RESEAU });
  return { achat, webhook };
}

/** Rejoue un webhook déjà posté (son corps et ses en-têtes de signature, tels quels), ou touché par `changer` : la réponse. */
export async function rejouerWebhook(page: Page, webhook: Request, changer: (corps: string) => string = (c) => c) {
  const entetes = await webhook.allHeaders();
  const signes = Object.fromEntries(["webhook-id", "webhook-timestamp", "webhook-signature"].map((nom) => [nom, entetes[nom] ?? ""]));
  return page.request.post("/api/paiement/whop", { headers: { ...signes, "content-type": "application/json" }, data: changer(webhook.postData() ?? ""), timeout: RESEAU });
}

/** Le moyen de test du faux Whop : rembourse cet achat payé, comme depuis le tableau de bord de Whop (le webhook refund.created, posté). */
export async function rembourser(page: Page, achat: string): Promise<void> {
  const r = await page.request.post("/api/paiement/factice", { headers: { origin: URL_APPLI }, data: { achat, issue: "rembourser" }, timeout: RESEAU });
  expect(r.status(), "le faux Whop rembourse").toBe(200);
  const { webhook } = (await r.json()) as { webhook: { corps: string; entetes: Record<string, string> } };
  const poste = await page.request.post("/api/paiement/whop", { headers: { ...webhook.entetes, "content-type": "application/json" }, data: webhook.corps, timeout: RESEAU });
  expect(poste.status(), "le webhook du remboursement est reçu").toBe(200);
}
