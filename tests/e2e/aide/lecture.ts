import { expect, type Page } from "@playwright/test";
import { RESEAU } from "./page";

/**
 * Attend la fin de la lecture sur l’écran /lecture, comme l’utilisateur : l’écran interroge le serveur chaque seconde, la
 * chaîne de tâches (le verdict) tourne après la réponse de /api/analyse, puis « Voir mon rapport » apparaît. Une lecture
 * en échec fait échouer tout de suite, avec le texte affiché. Pour un rapport ouvert, la chaîne continue après le verdict
 * (rapport, vocal, mémoire) : attendreTaches (aide/base.ts) attend sa fin.
 */
export async function attendreLecture(page: Page, { timeout = RESEAU }: { timeout?: number } = {}): Promise<void> {
  /* Arriver ici est déjà long : le code vérifié, le compte créé, la lecture lancée (plusieurs requêtes au serveur) */
  await expect(page).toHaveURL(/\/lecture(\?|$)/, { timeout });
  const pret = page.getByRole("link", { name: "Voir mon rapport" });
  /* Dans l’écran : Next annonce aussi chaque page dans un role="alert", hors de <main> */
  const echec = page.getByRole("main").getByRole("alert");
  await expect(pret.or(echec).first()).toBeVisible({ timeout });
  if (await echec.isVisible()) throw new Error(`la lecture a échoué : « ${(await echec.innerText()).trim()} »`);
}
