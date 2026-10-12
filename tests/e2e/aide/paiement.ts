import { expect, type Page, type Request } from "@playwright/test";
import { CASE_RENONCIATION } from "../../../src/contenu/consentements";
import type { OffreId } from "../../../src/types";
import { URL_APPLI } from "../reglages";
import { sql } from "./base";
import { RESEAU } from "./page";

/*
 * Le paiement par le faux Whop (BLUSH_PAIEMENT_FACTICE, posé par playwright.config.ts) : sa page de paiement est locale,
 * et son bouton « Payer » poste un vrai webhook signé à /api/paiement/whop, que le serveur vérifie et livre comme ceux
 * de Whop. Les états d’un achat se lisent en base (aide/base.ts, compteDe).
 */

/** Ce que l’écran envoie de la case de renonciation cochée : la version de son texte. */
export const RENONCIATION = CASE_RENONCIATION.version;

/** Le paiement commencé comme l’écran le fait (POST /api/paiement, la case de renonciation cochée) : l’achat, et la page où le payer. */
export async function commencerPaiement(page: Page, offre: OffreId): Promise<{ achat: string; url: string }> {
  const r = await page.request.post("/api/paiement", { headers: { origin: URL_APPLI }, data: { offre, renonciation: RENONCIATION }, timeout: RESEAU });
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

/** L’achat tel qu’il est en base : son offre, son statut, et la case de renonciation gardée avec lui (sa version, son heure). */
export async function achatEnBase(achat: string): Promise<{ offre: OffreId; statut: string; renonciationVersion: string | null; renonciationLe: Date | null }> {
  const [a] = await sql()<{ offre: OffreId; statut: string; renonciationVersion: string | null; renonciationLe: Date | null }[]>`
    select offre, statut, renonciation_version as "renonciationVersion", renonciation_le as "renonciationLe" from achats where id = ${achat}`;
  if (!a) throw new Error(`l’achat ${achat} n’est pas en base`);
  return a;
}

/** Le dernier achat de ce compte (le plus récent commandé) : son id. */
export async function dernierAchat(email: string): Promise<string> {
  const [a] = await sql()<{ id: string }[]>`
    select a.id from achats a join users u on u.id = a.user_id where u.email = ${email.toLowerCase()} order by a.cree_le desc limit 1`;
  if (!a) throw new Error(`aucun achat pour ${email}`);
  return a.id;
}

/**
 * Le moyen de test du compte à rebours de l’offre ① : la fin de l’offre déjà montrée à ce compte, ramenée à `secondes`
 * d’ici, en base (le serveur la relit et la redonne telle quelle). Seulement ici : rien dans le code de l’appli ne la
 * raccourcit, en production comme ailleurs.
 */
export async function raccourcirLaSuite(email: string, secondes: number): Promise<void> {
  const fait = await sql()`
    update offres_uniques o set expire_le = now() + make_interval(secs => ${secondes})
    from users u where u.id = o.user_id and u.email = ${email.toLowerCase()} and o.offre = 'suite' and o.prise_le is null`;
  if (fait.count !== 1) throw new Error(`pas d’offre ① montrée à ${email}`);
}

/**
 * Ce qui est à l’écran tient en 375 × 667 (le plus petit iPhone encore courant) sans défiler, comme le prototype des
 * bulles : la dernière feuille ouverte (son panneau, qui défile s’il dépasse), sinon la page. L’écran revient ensuite à
 * sa taille. `quoi` : ce qu’on mesure, pour le message.
 */
export async function tientEnPetitEcran(page: Page, quoi: string): Promise<void> {
  const avant = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 667 });
  try {
    /* La mise en page refaite, et le panneau d’une feuille monté jusqu’en haut (son entrée dure 0,35 s) */
    await page.waitForTimeout(500);
    const { haut, visible } = await page.evaluate(() => {
      const feuille = [...document.querySelectorAll("dialog[open]")].at(-1)?.querySelector<HTMLElement>(":scope [tabindex='-1']");
      const el = feuille ?? document.documentElement;
      return { haut: el.scrollHeight, visible: feuille ? feuille.clientHeight : window.innerHeight };
    });
    expect(haut, `${quoi} : tient en 375 × 667 sans défiler (${visible} px visibles)`).toBeLessThanOrEqual(visible + 1);
  } finally {
    if (avant) await page.setViewportSize(avant);
  }
}
