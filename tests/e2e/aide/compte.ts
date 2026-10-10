import { readFileSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { attendreTaches, sql } from "./base";
import { dernierCode } from "./boite";
import { exportWhatsApp, NOE_ET_MAELYS, type Ajout, type Personnes } from "./exports";
import { RESEAU } from "./page";

/*
 * Préparer vite un compte et ses convs par les routes /api que l’appli appelle elle-même, depuis le navigateur du test
 * (page.request partage ses cookies : la session et le brouillon posés par le serveur valent ensuite pour la page). Les
 * parcours d’import et de connexion à l’écran ont leurs propres tests ; ici, ils ne sont que le décor.
 */

/* Les routes qui modifient quelque chose vérifient l’origine (src/server/http.ts, memeOrigine) : celle de l’appli */
export const origine = (testInfo: TestInfo) => ({ origin: String(testInfo.project.use.baseURL) });

/**
 * Se connecter sans passer par l’écran : le code demandé, lu dans la boîte à mails, puis vérifié, dans le même navigateur
 * (le code ne vaut que là où il a été demandé). Le compte naît au premier bon code (gratuit, ou BLUSH+ pour un invité). La
 * page garde ensuite la session.
 */
export async function connecterParApi(page: Page, testInfo: TestInfo, email: string): Promise<void> {
  const depuis = Date.now();
  const code = await page.request.post("/api/auth/code", { headers: origine(testInfo), data: { email }, timeout: RESEAU });
  expect(code.status(), "le code de connexion est demandé").toBe(200);
  const verif = await page.request.post("/api/auth/verifier", { headers: origine(testInfo), data: { email, code: await dernierCode(email, { depuis }) }, timeout: RESEAU });
  expect(await verif.json(), "le code ouvre la session").toMatchObject({ ok: true });
}

/** Une lecture à préparer : les deux personnes de la conv (`toi` est celui qui importe), et qui utilise BLUSH. */
export type Lecture = {
  /** Par défaut, Noé et Maëlys. */
  personnes?: Personnes;
  /** « Un garçon » (par défaut) parle d’elle ; « Une fille » parle de lui. */
  jeSuis?: "Un garçon" | "Une fille";
  /** Un dernier message en plus dans la conv (un déclencheur du modèle factice, aide/exports.ts). */
  ajout?: Ajout;
  /** « En couple » à « Qui es-tu ? » (et « Que ça aille mieux ») : le verdict passe à la température. */
  enCouple?: boolean;
};

/**
 * Une conv WhatsApp fictive importée puis lue pour le compte connecté (comme « Qui es-tu ? » rempli : toi, on s’est vus,
 * qu’on soit ensemble, ou en couple avec `enCouple` ; puis « Lancer la lecture ») : elle devient la conv ouverte. Renvoie son identifiant. La lecture
 * tourne ensuite sur le serveur : attendreTaches (aide/base.ts) attend sa fin.
 */
export async function lireUneConvParApi(page: Page, testInfo: TestInfo, { personnes = NOE_ET_MAELYS, jeSuis = "Un garçon", ajout, enCouple = false }: Lecture = {}): Promise<string> {
  const conv = exportWhatsApp(testInfo, { personnes, ajout });
  const envoi = await page.request.post("/api/import", {
    headers: origine(testInfo),
    multipart: { fichier: { name: conv.nom, mimeType: "application/zip", buffer: readFileSync(conv.chemin) } },
    timeout: RESEAU,
  });
  expect(envoi.status(), `l’export de la conv avec ${personnes.autre} est importé`).toBe(200);
  const { story } = (await envoi.json()) as { story: { id: string } };
  /* Le premier de l’export (p0) est celui qui importe : il écrit le plus (aide/exports.ts) */
  const lecture = await page.request.post("/api/analyse", {
    headers: origine(testInfo),
    data: { me: "p0", pronom: jeSuis === "Une fille" ? "elle" : "il", guess: enCouple ? "ensemble" : "vus", goal: enCouple ? "mieux" : "ensemble" },
    timeout: RESEAU,
  });
  expect(lecture.status(), `la lecture de la conv avec ${personnes.autre} part`).toBe(200);
  return story.id;
}

/**
 * Un compte dont une conv est lue, préparé par les routes /api : connecté dans ce navigateur (le compte naît au premier
 * bon code : gratuit, ou BLUSH+ pour un invité), la conv importée puis lue, et toute la chaîne finie (le verdict seul
 * pour un compte gratuit ; le rapport, le vocal et la mémoire pour BLUSH+). La page n’a rien affiché : à elle d’aller où
 * le test commence. Renvoie l’identifiant de l’histoire.
 */
export async function lectureFaite(page: Page, testInfo: TestInfo, email: string, lecture: Lecture = {}, { echecPermis = false } = {}): Promise<string> {
  await connecterParApi(page, testInfo, email);
  const histoire = await lireUneConvParApi(page, testInfo, lecture);
  await attendreTaches(email, { echecPermis });
  return histoire;
}

/**
 * Se déconnecter par la route de l’appli (POST /api/auth/deconnexion), sans passer par Mon compte : `partout`, de tous les
 * appareils ; `autreSite`, la même requête venue d’un autre site. Renvoie le statut de la réponse.
 */
export async function deconnecterParApi(page: Page, testInfo: TestInfo, { autreSite = false, partout = false } = {}): Promise<number> {
  const r = await page.request.post("/api/auth/deconnexion", { headers: autreSite ? { origin: "https://exemple.test" } : origine(testInfo), data: { partout }, timeout: RESEAU });
  return r.status();
}

/** Les sessions ouvertes du compte (0 : plus aucune, ou plus de compte). */
export async function sessionsDe(email: string): Promise<number> {
  const [{ n }] = await sql()<{ n: number }[]>`
    select count(*)::int as n from sessions s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()}`;
  return n;
}

/** Ferme les sessions du compte côté serveur, comme une session expirée : le navigateur garde son cookie, qui n’ouvre plus rien. */
export async function fermerLesSessions(email: string): Promise<void> {
  await sql()`delete from sessions where user_id = (select id from users where email = ${email.toLowerCase()})`;
}

/** BLUSH est-il en pause pour ce compte (« Mettre en pause », dans Mon compte) ? */
export async function enPause(email: string): Promise<boolean> {
  const [u] = await sql()<{ paused: boolean }[]>`select paused from users where email = ${email.toLowerCase()}`;
  return u.paused;
}

/** Combien de messages (les tiens et ceux de BLUSH) le chat de cette histoire garde. */
export async function messagesDeLHistoire(storyId: string): Promise<number> {
  const [{ n }] = await sql()<{ n: number }[]>`select count(*)::int as n from chat_messages where story_id = ${storyId}`;
  return n;
}
