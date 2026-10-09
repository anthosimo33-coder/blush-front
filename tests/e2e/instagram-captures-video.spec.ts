import { readFileSync } from "node:fs";
import { choisirFichier, enregistrementEcran, expect, LECTURE_DES_CAPTURES, suivreLesEnvois, suivreLesRequetes, test } from "./aide";

/*
 * L’enregistrement d’écran (iMessage ne s’exporte pas) : le navigateur regarde la vidéo et en tire les écrans de la conv,
 * puis BLUSH les lit par lots. La vidéo ne part jamais : seules ces images partent. La vidéo est filmée par le test (une
 * conv inventée qu’on remonte, aide/instagram-captures.ts) ; le modèle factice lit toujours 24 messages avec Elias.
 */
test("iMessage : l’enregistrement d’écran est lu dans le navigateur, seules des images partent, puis « Qui es-tu ? » demande le prénom", async ({
  page,
  browser,
}, testInfo) => {
  const video = await enregistrementEcran(browser, testInfo);
  const envoisVers = await suivreLesEnvois(page);
  /* Et toutes les requêtes du navigateur, vues de Playwright : celles d’un worker, d’un XHR ou de sendBeacon comprises */
  const requetes = suivreLesRequetes(page);

  await test.step("la tuile iMessage mène à l’enregistrement d’écran", async () => {
    await page.goto("/commencer");
    await page.getByRole("link", { name: "iMessage Enregistrement de l’écran" }).click();
    await expect(page).toHaveURL(/\/importer\/captures\?app=imessage$/);
    await expect(page.getByRole("heading", { level: 1, name: "Filme ta conv." })).toBeVisible();
    await expect(page.getByText("iMessage ne permet pas d’exporter. Enregistre ton écran en remontant la conv : BLUSH lit tout, message par message.")).toBeVisible();
  });

  await test.step("l’enregistrement choisi : son aperçu, sa durée, prêt", async () => {
    await choisirFichier(page, video, "Choisir mon enregistrement");
    await expect(page.getByText("Ton enregistrement")).toBeVisible();
    /* La durée se lit dans la vidéo : quelques secondes (plus quand la machine est chargée : la vidéo dure ce qu’a duré le tournage) */
    await expect(page.getByText(/^(\d+\smin )?\d+\ss · prêt$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Changer" })).toBeVisible();
  });

  await test.step("Continuer : la vidéo est lue, puis « Qui es-tu ? » demande le prénom, face à Elias", async () => {
    await page.getByRole("button", { name: "Continuer" }).click();
    /* Regarder la vidéo pas à pas, puis la lecture des écrans par lots : plus long qu’un export */
    await expect(page).toHaveURL(/\/qui$/, { timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv ?" })).toBeVisible();
    await expect(page.getByLabel("Ton prénom (sur tes captures avec Elias, tu es à droite)")).toBeVisible();
  });

  await test.step("ce qui est parti : des images JPEG par lots, puis leur lecture ; jamais la vidéo", async () => {
    const lots = await envoisVers("/api/captures/lot");
    expect(lots.length).toBeGreaterThanOrEqual(1);
    for (const lot of lots) {
      const images = lot.champs.filter((c) => c.nom === "captures");
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images.every((c) => c.type === "image/jpeg")).toBe(true);
      expect(lot.champs.find((c) => c.nom === "app")?.texte).toBe("imessage");
    }
    const lectures = await envoisVers("/api/captures/video");
    expect(lectures).toHaveLength(1);
    expect(JSON.parse(lectures[0].texte!)).toMatchObject({ app: "imessage", lots: expect.any(Array) });
    /* Aucun envoi, vers aucune route, ne contient un fichier vidéo */
    const tous = await envoisVers();
    expect(tous.flatMap((e) => e.champs).filter((c) => c.type?.startsWith("video/") || c.fichier?.endsWith(".webm"))).toEqual([]);
  });

  await test.step("vu du réseau : aucune requête vers /api n’emporte la vidéo, ni un morceau d’elle", async () => {
    /* Le début du fichier (son en-tête WebM) et un morceau du milieu : où qu’il parte, on le retrouverait tel quel */
    const octets = readFileSync(video);
    const morceaux = [octets.subarray(0, 64), octets.subarray(octets.length >> 1, (octets.length >> 1) + 64)];
    const vues = requetes();
    expect(vues.filter((r) => r.chemin === "/api/captures/lot").length).toBeGreaterThanOrEqual(1);
    const suspectes = vues
      .filter((r) => r.type.startsWith("video/") || /content-type:\s*video\//i.test(r.corps.toString("latin1")) || morceaux.some((m) => r.corps.includes(m)))
      .map((r) => `${r.chemin} (${r.type}, ${r.octets} octets)`);
    expect(suspectes).toEqual([]);
  });
});
