import { expect, type Page } from "@playwright/test";
import { sql } from "./base";
import { RESEAU } from "./page";

/**
 * Attend la fin de la lecture sur l’écran /lecture, comme l’utilisateur : l’écran interroge le serveur chaque seconde, la
 * chaîne de tâches (le verdict) tourne après la réponse de /api/analyse, puis « Voir mon rapport » apparaît. Une lecture
 * en échec fait échouer tout de suite, avec le texte affiché. Pour un rapport ouvert, la chaîne continue après le verdict
 * (rapport, vocal, mémoire) : attendreTaches (aide/base.ts) attend sa fin.
 *
 * Le paywall d’abord (16 octobre) : la conv d’un compte qui n’a rien payé ne se lit pas, l’écran déroule ce que le code a
 * compté et « Voir mon rapport » (un bouton, cette fois) mène au paywall. `paywall` : « offrir » (par défaut) offre le
 * verdict comme à un compte d’avant le paywall, puis attend la lecture, pour les tests qui la suivent jusqu’au verdict ;
 * « garder » s’arrête au paywall. Rend ce que l’écran a montré au bout.
 */
export async function attendreLecture(
  page: Page,
  { timeout = RESEAU, paywall = "offrir" }: { timeout?: number; paywall?: "offrir" | "garder" } = {},
): Promise<"verdict" | "paywall"> {
  /* Arriver ici est déjà long : le code vérifié, le compte créé, la lecture lancée (plusieurs requêtes au serveur) */
  await expect(page).toHaveURL(/\/lecture(\?|$)/, { timeout });
  const pret = page.getByRole("link", { name: "Voir mon rapport" });
  const versLePaywall = page.getByRole("button", { name: "Voir mon rapport" });
  /* Dans l’écran : Next annonce aussi chaque page dans un role="alert", hors de <main> */
  const echec = page.getByRole("main").getByRole("alert");
  const sansEchec = async () => {
    if (await echec.isVisible()) throw new Error(`la lecture a échoué : « ${(await echec.innerText()).trim()} »`);
  };
  await expect(pret.or(versLePaywall).or(echec).first()).toBeVisible({ timeout });
  await sansEchec();
  if (await pret.isVisible()) return "verdict";
  if (paywall === "garder") return "paywall";
  await offrirLeVerdictDuCompte(page);
  await page.reload();
  await expect(pret.or(echec).first()).toBeVisible({ timeout });
  await sansEchec();
  return "verdict";
}

/**
 * Le verdict des convs du compte connecté qui attendent leur paiement, lancé sans paiement, comme pour un compte d’avant
 * le paywall (16 octobre) : leurs tâches passent en attente, le suivi de la lecture relance la chaîne.
 */
async function offrirLeVerdictDuCompte(page: Page): Promise<void> {
  const r = await page.request.get("/api/compte", { timeout: RESEAU });
  expect(r.status(), "le compte connecté se lit").toBe(200);
  const { email } = (await r.json()) as { email: string | null };
  if (!email) throw new Error("aucun email sur le compte connecté");
  await sql()`
    update tasks set status = 'attente', updated_at = now()
    where status = 'paiement' and story_id in (select s.id from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()})`;
}
