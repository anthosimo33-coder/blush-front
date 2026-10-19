import { connecterParApi, convDeTournage, emailLibre, expect, nouvelAdminDuTournage, ouvrir, ouvrirLeLienDuTournage, test } from "./aide";

/*
 * Le rappel du mode tournage dans « Mon compte » (src/app/compte/CompteScreen.tsx, rappelDuTournage) : un navigateur qui
 * garde le lien d’une conv de tournage le voit, quel que soit son compte (pas seulement BLUSH_ADMINS, comme le repère de
 * l’import), et le quitte d’ici. Il revient alors sur « Mon compte », sans le rappel, et l’export redevient celui de tout
 * le monde : un vrai fichier à choisir.
 */

/** Le nom de la conv de tournage (inventé, comme ceux des campagnes). */
const NOM = "H · Le rappel du compte";

test("« Mon compte » rappelle le mode tournage à un compte qui n’est pas de l’équipe, et le quitte", async ({ page, autreAppareil }, testInfo) => {
  test.slow();
  const cle = await convDeTournage(page, testInfo, await nouvelAdminDuTournage(testInfo), NOM);
  const telephone = await autreAppareil();
  await ouvrirLeLienDuTournage(telephone, cle);
  await connecterParApi(telephone, testInfo, emailLibre(testInfo, "rappel"));
  const rappel = telephone.getByRole("region", { name: "Mode tournage" });

  await test.step("le rappel nomme le lien, en tête de « Mon compte »", async () => {
    await ouvrir(telephone, "/compte");
    await expect(rappel).toContainText("Ce téléphone est en mode tournage");
    await expect(rappel).toContainText(NOM);
    await expect(rappel).toBeInViewport();
  });

  await test.step("« Quitter le mode tournage » revient sur « Mon compte », sans le rappel", async () => {
    await rappel.getByRole("button", { name: /Quitter le mode tournage/ }).click();
    await expect(telephone).toHaveURL(/\/compte$/);
    await expect(telephone.getByRole("region", { name: "Tes histoires" })).toBeVisible();
    await expect(rappel).toHaveCount(0);
  });

  await test.step("une nouvelle histoire : l’export de tout le monde, dont le bouton ouvre le choix d’un vrai fichier", async () => {
    await telephone.getByRole("link", { name: /Nouvelle histoire/ }).click();
    await telephone.getByRole("link", { name: /WhatsApp/ }).click();
    await expect(telephone.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
    /* Le même écran qu’en mode tournage (voulu : les créatrices le filment), mais son bouton ouvre le choix d’un fichier */
    const choix = telephone.waitForEvent("filechooser");
    await telephone.getByRole("button", { name: "Choisir le fichier enregistré" }).click();
    await choix;
  });
});
