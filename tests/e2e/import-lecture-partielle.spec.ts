import { attendreTaches, connecterParApi, emailLibre, expect, importerUneVideoPartielle, LOTS_GARDES, origine, payer, RESEAU, sql, test } from "./aide";

/*
 * La lecture partielle d’une longue vidéo, de bout en bout (le serveur des tests est en BLUSH_LECTURE_PARTIELLE=ab) : un
 * compte connecté envoie ses lots comme le navigateur (aide/video-partielle.ts). Ses cinq lots les plus récents sont lus,
 * ses trois plus anciens gardés chiffrés ; l’écran « C’est bon » le dit ; puis « Qui es-tu ? », le paiement au faux Whop,
 * et la chaîne : la suite lue avant le verdict, les écrans effacés. Le modèle factice lit toujours les mêmes messages :
 * la conv reste la même, seul le chemin compte ici.
 */

test("une longue vidéo lue en partie : ses lots récents lus, les autres gardés, puis lus après le paiement, avant le verdict, et effacés", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "partielle");
  await connecterParApi(page, testInfo, email);
  let histoire = "";
  let serie = "";

  await test.step("l’import : la partie récente lue, ses lots plus anciens gardés", async () => {
    ({ histoire, serie } = await importerUneVideoPartielle(page, testInfo));
  });

  await test.step("avant l’achat : ses lots plus anciens gardés, chiffrés, sous la conv ; rien n’en sort ; l’écran « C’est bon » dit que le début se lira avec le rapport", async () => {
    const gardes = await sql()<{ rang: number; lu: boolean; images: number }[]>`
      select rang, lu is not null as lu, cardinality(medias) as images from ecrans_gardes where story_id = ${histoire} order by rang`;
    expect(gardes).toEqual(Array.from({ length: LOTS_GARDES }, (_, rang) => ({ rang, lu: false, images: 12 })));
    const [suite] = await sql()<{ lots: number }[]>`select lots from suites_video where story_id = ${histoire}`;
    expect(suite?.lots).toBe(LOTS_GARDES);
    /* Les octets gardés sont chiffrés : la série de ce test ne s’y lit pas */
    const [brut] = await sql()<{ data: Buffer }[]>`select data from ecrans_gardes where story_id = ${histoire} and rang = 0`;
    expect(brut!.data.includes(Buffer.from(serie))).toBe(false);
    /* La conv ouverte, vue du navigateur : rien des écrans gardés */
    const vue = await page.request.get("/api/histoire", { timeout: RESEAU });
    expect(JSON.stringify(await vue.json())).not.toMatch(/ecrans_gardes|suites_video|data:image/);
    await page.goto("/importer/ok");
    await expect(page.getByText(/Ta vidéo est longue/)).toBeVisible();
    await expect(page.getByText(/Le début sera lu avec ton rapport/)).toBeVisible();
  });

  await test.step("« Qui es-tu ? », puis le rapport payé au faux Whop : la suite se lit avant le verdict, puis ses écrans s’effacent", async () => {
    const qui = await page.request.post("/api/analyse", {
      headers: origine(testInfo),
      data: { me: "p0", pronom: "il", guess: "vus", goal: "ensemble", prenom: "Tom" },
      timeout: RESEAU,
    });
    expect(qui.status()).toBe(200);
    /* Le paywall : la suite attend le paiement le temps des relances (11 jours), et la moitié de la vidéo est notée dès son plan */
    const [auPaywall] = await sql()<{ jours: number }[]>`
      select extract(epoch from expire_le - now()) / 86400 as jours from suites_video where story_id = ${histoire}`;
    expect(Number(auPaywall?.jours)).toBeGreaterThan(10.9);
    const [plan] = await sql()<{ bras: string }[]>`select p.bras from plans_video p join imports i on i.envoi = p.envoi where i.story_id = ${histoire}`;
    expect(plan?.bras).toBe("partielle");
    await payer(page, "rapport");
    const taches = await attendreTaches(email, { timeout: 2 * RESEAU });
    expect(taches.find((t) => t.genre === "verdict")?.statut).toBe("fini");
    expect(await sql()`select 1 from ecrans_gardes where story_id = ${histoire}`).toHaveLength(0);
    expect(await sql()`select 1 from suites_video where story_id = ${histoire}`).toHaveLength(0);
    const [mesure] = await sql()<{ bras: string; suite: string; lots: number; lots_gardes: number; titre_entier: string | null }[]>`
      select bras, suite, lots, lots_gardes, titre_entier from imports where story_id = ${histoire}`;
    expect(mesure).toMatchObject({ bras: "partielle", suite: "lue", lots: 5, lots_gardes: LOTS_GARDES });
    expect(mesure?.titre_entier).not.toBeNull();
  });
});
