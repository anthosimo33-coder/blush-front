import { expect, type Page, type Response, type TestInfo } from "@playwright/test";
import { attendreTaches } from "./base";
import { dernierCode } from "./boite";
import { lectureFaite, type Lecture } from "./compte";
import { nouvelInvite } from "./emails";
import type { Fichier } from "./exports";
import { choisirFichier, reponseAuGeste } from "./page";

/*
 * Les gestes du parcours, par l’interface, comme quelqu’un qui découvre BLUSH : importer sa conv, répondre à « Qui
 * es-tu ? », recevoir son code. Le parcours lui-même est figé par parcours-temoin.spec.ts et les import*.spec.ts ;
 * ailleurs, un compte et sa conv lue se préparent par les routes /api (lectureFaite, lectureBlushPlus).
 */

/** Depuis /commencer : la tuile WhatsApp mène à l’écran de l’export. */
export async function ouvrirExportWhatsApp(page: Page): Promise<void> {
  await page.goto("/commencer");
  await page.getByRole("link", { name: /WhatsApp/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
}

/**
 * Importe cet export sur l’écran de l’export WhatsApp, jusqu’à « C’est bon, on a votre conv. ». Renvoie l’identifiant
 * de l’histoire (un brouillon, tant qu’aucun compte ne l’a lue) que /api/import a créée.
 */
export async function importerWhatsApp(page: Page, fichier: Fichier): Promise<string> {
  await page.goto("/importer/export?app=whatsapp");
  const reponse = await reponseAuGeste(page, { chemin: "/api/import" }, () => choisirFichier(page, fichier.chemin));
  expect(reponse.status(), `l’import de ${fichier.nom}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
  return ((await reponse.json()) as { story: { id: string } }).story.id;
}

/** Les réponses de « Qui es-tu ? », par le texte de leurs tuiles (`moi` : le prénom tel qu’il s’affiche). */
export type Reponses = { moi: string; tuEs: "Un garçon" | "Une fille"; ou: string; veux: string };

/** Les réponses de Noé (celui qui importe, dans les exports par défaut). */
export const REPONSES_NOE: Reponses = { moi: "Noé", tuEs: "Un garçon", ou: "On s’est vus", veux: "Qu’on soit ensemble" };

/** Répond à « Qui es-tu ? » (sans valider). */
export async function repondreQui(page: Page, { moi, tuEs, ou, veux }: Reponses): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv ?" })).toBeVisible();
  for (const nom of [moi, tuEs, ou, veux]) await page.getByRole("radio", { name: nom }).click();
}

/**
 * Sur l’écran de l’email (« On t’envoie ton rapport où ? », ou la connexion) : l’email, puis « Recevoir mon code ».
 * Renvoie la réponse du serveur (POST /api/auth/code), et l’instant pris juste avant l’envoi (pour dernierCode).
 */
export async function envoyerEmail(page: Page, email: string): Promise<{ reponse: Response; depuis: number }> {
  await page.getByLabel("Ton email").fill(email);
  const depuis = Date.now();
  const reponse = await reponseAuGeste(page, { chemin: "/api/auth/code" }, () => page.getByRole("button", { name: "Recevoir mon code" }).click());
  return { reponse, depuis };
}

/**
 * Sur l’écran de l’email : l’email, puis « Recevoir mon code ». Attend l’écran du code et renvoie l’instant pris juste
 * avant l’envoi (pour dernierCode).
 */
export async function demanderCode(page: Page, email: string): Promise<number> {
  const { depuis } = await envoyerEmail(page, email);
  /* Le mail est écrit avant la réponse du serveur : une fois l’écran du code là, il est dans la boîte */
  await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
  return depuis;
}

/** Le champ du code, sur l’écran « Entre ton code. ». Un code complet se valide tout seul, sans bouton. */
export const champDuCode = (page: Page) => page.getByLabel("Code à 6 chiffres reçu par email");

/**
 * Saisit un code complet (il se valide tout seul) et attend la réponse du serveur : `ok` dit s’il l’a pris. Plusieurs
 * essais de suite ne se marchent pas dessus.
 */
export async function saisirCode(page: Page, code: string): Promise<boolean> {
  const reponse = await reponseAuGeste(page, { chemin: "/api/auth/verifier" }, () => champDuCode(page).fill(code));
  return ((await reponse.json()) as { ok?: boolean }).ok === true;
}

/** Saisit le dernier code reçu par cet email depuis `depuis` (l’instant que demanderCode renvoie), lu dans la boîte à mails. */
export async function saisirLeCodeRecu(page: Page, email: string, depuis: number): Promise<void> {
  await champDuCode(page).fill(await dernierCode(email, { depuis }));
}

/**
 * Se connecter par l’interface, comme quelqu’un qui revient sur un autre appareil : /connexion, l’email, puis le code lu
 * dans la boîte à mails. Le compte naît au premier bon code. `suite` : la page où aller ensuite (par défaut, l’accueil).
 * Pour une page sans session (déjà connecté, /connexion renvoie tout de suite à l’accueil). Attend d’avoir quitté la connexion.
 */
export async function seConnecter(page: Page, email: string, { suite }: { suite?: string } = {}): Promise<void> {
  await page.goto(suite ? `/connexion?suite=${encodeURIComponent(suite)}` : "/connexion");
  await saisirLeCodeRecu(page, email, await demanderCode(page, email));
  await expect(page).not.toHaveURL(/\/connexion(\/|\?|$)/);
}

/**
 * Un nouveau venu, de l’import jusqu’à l’écran de l’email : l’export, « Qui es-tu ? » (par défaut, les réponses de
 * Noé), puis « Continuer ». Renvoie l’identifiant de l’histoire brouillon que l’import a créée.
 */
export async function jusquALEmail(page: Page, fichier: Fichier, reponses: Reponses = REPONSES_NOE): Promise<string> {
  const histoire = await importerWhatsApp(page, fichier);
  await page.getByRole("link", { name: "Continuer" }).click();
  await repondreQui(page, reponses);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où ?" })).toBeVisible();
  return histoire;
}

/** Un nouveau venu, de l’import jusqu’à l’écran du code (jusquALEmail, puis l’email). Renvoie l’instant pris juste avant l’envoi du code. */
export async function jusquAuCode(page: Page, fichier: Fichier, email: string): Promise<number> {
  await jusquALEmail(page, fichier);
  return demanderCode(page, email);
}

/**
 * Un compte BLUSH+ (un invité, nouvelInvite) dont une conv est lue et toute la suite écrite, sans échec : le rapport,
 * le vocal, puis la mémoire (sa fiche, les questions toutes prêtes) ; le chat répond dès qu’on lui écrit. Préparé par
 * les routes /api (lectureFaite) : connecté dans ce navigateur, la conv de Noé et Maëlys (par défaut) ouverte. À appeler
 * au début du test, avant tout autre geste avec cet invité. Renvoie l’email du compte.
 */
export async function lectureBlushPlus(page: Page, testInfo: TestInfo, lecture: Lecture = {}): Promise<string> {
  const email = await nouvelInvite(testInfo);
  await lectureFaite(page, testInfo, email, lecture);
  const taches = await attendreTaches(email);
  expect(taches.map((t) => t.genre), "toute la chaîne de BLUSH+").toEqual(expect.arrayContaining(["verdict", "rapport_plan", "rapport_chapitres", "vocal", "memoire"]));
  return email;
}
