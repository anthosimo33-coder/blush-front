import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { dechiffrer, sql } from "./base";
import { origine } from "./compte";
import { RESEAU, reponseAuGeste } from "./page";

/*
 * Les aides du chat (/app) et de sa fiche (/app/fiche) : le fil de la conv avec BLUSH, son champ, ce que la base en
 * garde, et l’enregistrement de sa fiche.
 */

/** La conv avec BLUSH, sur l’accueil (le fil : une région nommée, pas une région live). */
export const filDuChat = (page: Page) => page.getByRole("region", { name: "Ta conv avec BLUSH" });

/** Le champ du chat, par son seul nom (« Écris à BLUSH, ou colle sa réponse ») : ses boutons sont à côté de son <label>. */
export const champDuChat = (page: Page) => page.getByRole("textbox", { name: "Écris à BLUSH, ou colle sa réponse", exact: true });

/**
 * Écrit à BLUSH depuis le champ du chat, et attend sa réponse (POST /api/chat) en entier. Renvoie son statut. La réponse
 * part en flux (ses bulles, la réponse enregistrée, puis son vocal) : le statut arrive avant elle, et le vocal n’est
 * enregistré qu’à la fin du flux.
 */
export async function ecrireABlush(page: Page, texte: string): Promise<number> {
  await champDuChat(page).fill(texte);
  const reponse = await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Envoyer" }).click());
  /*
   * La fin du flux : body() attend que la requête se termine, même quand Chromium la marque « interrompue » une fois tout
   * lu (finished() ne rendrait alors jamais la main). Son contenu ne sert pas ici.
   */
  await reponse.body().catch(() => undefined);
  return reponse.status();
}

/**
 * Écrit à BLUSH par la route du chat (POST /api/chat), sans l’écran : de quoi remplir l’historique d’un compte au rapport ouvert
 * dont la mémoire est faite. Le modèle factice répond toujours pareil (src/server/ia/factice.ts).
 */
export async function ecrireParApi(page: Page, testInfo: TestInfo, texte: string): Promise<void> {
  const r = await page.request.post("/api/chat", { headers: origine(testInfo), data: { texte }, timeout: RESEAU });
  expect(r.status(), `« ${texte} » envoyé au chat`).toBe(200);
}

/** Les messages du chat gardés en base pour ce compte, dans l’ordre : qui parle (« toi », « blush »). Leur contenu est chiffré. */
export async function messagesDuChat(email: string): Promise<string[]> {
  const lignes = await sql()<{ role: string }[]>`
    select c.role from chat_messages c join stories s on s.id = c.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by c.id`;
  return lignes.map((l) => l.role);
}

/** Ce que tu as dit à BLUSH, message par message (déchiffré), tel que le serveur le garde et le relit au modèle. */
export async function tesMessagesAuChat(email: string): Promise<string[]> {
  const lignes = await sql()<{ data: Uint8Array }[]>`
    select c.data from chat_messages c join stories s on s.id = c.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} and c.role = 'toi' order by c.id`;
  return lignes.map((l) => dechiffrer<{ texte: string }>(l.data).texte);
}

/** Le dernier vocal de BLUSH dans le chat de ce compte (son identifiant : /api/vocal/chat/<id>), ou null. */
export async function dernierVocalDuChat(email: string): Promise<number | null> {
  const [v] = await sql()<{ id: string }[]>`
    select v.id from chat_vocals v join stories s on s.id = v.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by v.id desc limit 1`;
  return v ? Number(v.id) : null;
}

/** Le chat de la conv ouverte est-il en vocal (BLUSH répond en vocal), tel que la base le garde ? */
export async function chatEnVocal(email: string): Promise<boolean> {
  const [s] = await sql()<{ vocal: boolean }[]>`
    select s.chat_vocal as vocal from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1`;
  return !!s?.vocal;
}

/**
 * Efface la mémoire de la conv ouverte du compte (sa fiche, ce que BLUSH retient), comme avant la fin de son écriture :
 * le chat attend alors qu’elle soit faite.
 */
export async function oublierLaMemoire(email: string): Promise<void> {
  await sql()`delete from memories where story_id in (select s.id from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()})`;
}

/**
 * Fait `geste` et attend l’enregistrement de sa fiche qu’il déclenche (PUT /api/fiche) : celui qui contient `texte`, s’il
 * est donné (les enregistrements partent l’un après l’autre). Il part après l’écran : on attend qu’il soit fait.
 */
export async function enregistrerLaFiche(page: Page, geste: () => Promise<unknown>, texte?: string) {
  return reponseAuGeste(page, { chemin: "/api/fiche", methode: "PUT", filtre: (r) => texte === undefined || (r.request().postData() ?? "").includes(texte) }, geste);
}

/**
 * Un glissé au doigt sur `cible`, de `dx` pixels vers la droite (négatif : vers la gauche), en quelques pas : les gestes
 * de la conv ne répondent qu’au toucher, pas à la souris. Joué par le protocole de Chromium (Input.dispatchTouchEvent) :
 * Chromium seulement. Le doigt se pose une fois la cible immobile (la même place trois images de suite) : une réponse
 * de BLUSH arrive en flux, puis la conv glisse en place, et la bulle bougerait sous le doigt.
 */
export async function glisserAuDoigt(page: Page, cible: Locator, dx: number): Promise<void> {
  const immobile = await cible.evaluate(
    (el, delai) =>
      new Promise<boolean>((ok) => {
        const fin = performance.now() + delai;
        let avant = "";
        let pareilles = 0;
        const relever = () => {
          const r = el.getBoundingClientRect();
          const ici = `${r.x} ${r.y} ${r.width} ${r.height}`;
          pareilles = ici === avant ? pareilles + 1 : 0;
          avant = ici;
          if (pareilles >= 2) ok(true);
          else if (performance.now() > fin) ok(false);
          else requestAnimationFrame(relever);
        };
        requestAnimationFrame(relever);
      }),
    RESEAU,
  );
  if (!immobile) throw new Error("la cible du glissé bouge encore");
  const b = await cible.boundingBox();
  if (!b) throw new Error("la cible du glissé n’est pas à l’écran");
  const cdp = await page.context().newCDPSession(page);
  try {
    const [x, y] = [b.x + Math.min(16, b.width / 4), b.y + b.height / 2];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let k = 1; k <= 10; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * k) / 10, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}
