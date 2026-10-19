import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { CASE_IMPORT } from "../../../src/contenu/consentements";
import { STORY_COOKIE } from "../../../src/services/session";
import { ADMINS_DU_TOURNAGE, URL_APPLI } from "../reglages";
import { dechiffrer, oublierEmail, sql, type Tache } from "./base";
import { prouverHumain } from "./captcha";
import { connecterParApi, lireUneConvParApi, origine } from "./compte";
import { RESEAU } from "./page";

/*
 * Le mode tournage vu par l’équipe (src/server/tournage.ts) : une conv de tournage créée comme dans /admin/tournage, par
 * un compte de BLUSH_ADMINS, depuis une conv de son compte lue en entier ; puis son lien ouvert dans ce navigateur, et
 * des prises (l’export sans fichier, sa lecture rejouée). Pour la galerie et tournage-repere.spec.ts.
 */

/** L’équipe du mode tournage de ce worker (ADMINS_DU_TOURNAGE), effacée d’abord : un compte neuf, qui n’a fait aucune prise. */
export async function nouvelAdminDuTournage(testInfo: TestInfo): Promise<string> {
  const email = ADMINS_DU_TOURNAGE[testInfo.parallelIndex];
  if (!email) throw new Error(`pas d’admin du tournage pour le worker ${testInfo.parallelIndex} : agrandis WORKERS_MAX (tests/e2e/reglages.ts)`);
  await oublierEmail(email);
  return email;
}

/** Attend la fin de la chaîne de cette conv (plus rien en attente ni en cours), et rend ses tâches. Un échec fait échouer. */
async function chaineFinie(histoire: string): Promise<Tache[]> {
  const fin = Date.now() + RESEAU;
  for (;;) {
    const taches = await sql()<Tache[]>`
      select kind as genre, status as statut, attempts as essais, error as erreur from tasks where story_id = ${histoire} order by created_at`;
    if (taches.length && taches.every((t) => t.statut === "fini" || t.statut === "echec" || t.statut === "paiement")) {
      const echecs = taches.filter((t) => t.statut === "echec");
      if (echecs.length) throw new Error(`la chaîne de ${histoire} a échoué : ${echecs.map((t) => `${t.genre} (${t.erreur ?? "sans code"})`).join(", ")}`);
      return taches;
    }
    if (Date.now() > fin) throw new Error(`la chaîne de ${histoire} tourne encore après ${RESEAU} ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Une conv de tournage nommée `nom`, prête, créée par `email` (un compte de BLUSH_ADMINS, connecté ici par les routes) :
 * une conv de son compte lue, son rapport ouvert comme un achat livré (l’ouvrir lance le rapport, le vocal, la mémoire),
 * puis POST /api/admin. Rend le secret de son lien (/tournage/<cle>), lu en base comme /admin le remontre.
 */
export async function convDeTournage(page: Page, testInfo: TestInfo, email: string, nom: string): Promise<string> {
  await connecterParApi(page, testInfo, email);
  const histoire = await lireUneConvParApi(page, testInfo);
  await chaineFinie(histoire);
  await sql()`update stories set debloque_le = now() where id = ${histoire}`;
  /* La conv que GET /api/rapport ouvre : celle-ci, comme si « Tes convs » l’avait choisie */
  await page.context().addCookies([{ name: STORY_COOKIE, value: histoire, url: URL_APPLI }]);
  expect((await page.request.get("/api/rapport", { timeout: RESEAU })).status(), "le rapport s’ouvre et lance sa suite").toBe(200);
  expect(
    (await chaineFinie(histoire)).map((t) => t.genre),
    "toute la suite écrite",
  ).toEqual(expect.arrayContaining(["rapport_chapitres", "memoire"]));
  const cree = await page.request.post("/api/admin", { headers: origine(testInfo), data: { action: "tournage", conv: histoire, nom }, timeout: RESEAU });
  expect(await cree.json(), "la conv de tournage est créée").toEqual({ action: "tournage", refus: null });
  const [t] = await sql()<{ cle: Uint8Array }[]>`select cle from tournages where story_id = ${histoire}`;
  if (!t) throw new Error(`aucune conv de tournage pour ${histoire}`);
  return dechiffrer<string>(t.cle);
}

/** Ouvre le lien d’une conv de tournage dans ce navigateur : il pose le mode tournage, et mène à /tournage. */
export async function ouvrirLeLienDuTournage(page: Page, cle: string): Promise<void> {
  await page.goto(`/tournage/${cle}`);
  await expect(page).toHaveURL(/\/tournage$/);
}

/** Une prise en mode tournage, par les routes : l’export sans fichier, le brouillon de la conv du lien (POST /api/import). Rend son identifiant. */
export async function priseDuTournage(page: Page, testInfo: TestInfo): Promise<string> {
  await prouverHumain(page.request, testInfo);
  const envoi = await page.request.post("/api/import", { headers: origine(testInfo), multipart: { tournage: "whatsapp", consentement: CASE_IMPORT.version }, timeout: RESEAU });
  expect(envoi.status(), "l’export sans fichier fait le brouillon de la conv du lien").toBe(200);
  return ((await envoi.json()) as { story: { id: string } }).story.id;
}

/** La prise ouverte lancée, par les routes : « Qui es-tu ? » rempli, et sa lecture rejouée (POST /api/analyse). */
export async function lancerLaPrise(page: Page, testInfo: TestInfo): Promise<void> {
  const lecture = await page.request.post("/api/analyse", { headers: origine(testInfo), data: { me: "p0", pronom: "elle", guess: "vus", goal: "ensemble" }, timeout: RESEAU });
  expect(lecture.status(), "la lecture de la prise est rejouée").toBe(200);
}
