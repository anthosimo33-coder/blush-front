import { CASE_IMPORT } from "../../src/contenu/consentements";
import {
  compteDe,
  connecterParApi,
  CRON_SECRET,
  dernierVocalDuChat,
  ecrireABlush,
  emailLibre,
  expect,
  histoireExiste,
  histoiresDe,
  lectureComplete,
  MUTATIONS,
  ouvrir,
  prouverHumain,
  reponseAuGeste,
  seConnecter,
  test,
  texteWhatsApp,
  URL_APPLI,
  URL_BETA,
  vieillirHistoire,
} from "./aide";

/*
 * Ce qui protège BLUSH sans se voir : les en-têtes de sécurité de chaque réponse (next.config.ts), le refus des
 * requêtes qui modifient quelque chose et ne viennent pas de l’appli (la garde commune, src/server/requete.ts), et la
 * purge de la nuit, réservée à Vercel Cron (CRON_SECRET).
 */

/** Les en-têtes de next.config.ts, sur toutes les pages et toutes les routes /api. */
const ENTETES = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), geolocation=(), microphone=(self)",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

/** Le webhook de Whop, hors de la garde commune : Whop n’a pas notre origine, seule sa signature compte. */
const WEBHOOK = "/api/paiement/whop";
/** L’API du mode tournage, hors de la garde commune elle aussi : l’outil des créatrices est un serveur, seule sa clé compte. */
const API_DU_TOURNAGE = ["/api/admin/tournage", "/api/admin/tournage/[id]/arreter"];
/** La désinscription en un clic (RFC 8058), hors de la garde commune : la messagerie l’appelle de ses serveurs, seul le lien signé compte. */
const UN_CLIC = "/api/desinscription/un-clic";

/** Un site qui n’est pas BLUSH (le domaine .test n’existe pas : le test sert lui-même sa page). */
const PIRATE = "http://site-pirate.test";

test("les en-têtes de sécurité sur les pages, la page introuvable, les routes /api et les fichiers publics", async ({ request }) => {
  for (const chemin of [
    "/",
    "/confidentialite",
    "/commencer",
    "/une-adresse-qui-n-existe-pas",
    "/api/compte",
    "/api/cron/purge",
    "/api/cron/relances",
    "/favicon.ico",
    "/icon.svg",
  ]) {
    const entetes = (await request.get(chemin)).headers();
    for (const [nom, valeur] of Object.entries(ENTETES)) expect.soft(entetes[nom], `${nom} sur ${chemin}`).toBe(valeur);
  }
});

test("une route qui modifie refuse (403) une requête venue d’un autre site, d’un autre port, ou sans origine", async ({ request }) => {
  await test.step("les 35 routes gardées de la table du contrat (le signe des onglets, les jalons du tunnel et ce que remontent les navigateurs compris), depuis quatre origines qui ne sont pas l’appli", async () => {
    expect(MUTATIONS).toHaveLength(39);
    for (const [methode, chemin] of MUTATIONS.filter(([, c]) => c !== WEBHOOK && c !== UN_CLIC && !API_DU_TOURNAGE.includes(c))) {
      for (const origine of [PIRATE, URL_BETA, "null", null]) {
        const r = await request.fetch(chemin, { method: methode, headers: origine ? { origin: origine } : {}, data: {} });
        const qui = `${methode} ${chemin} depuis ${origine ?? "nulle part"}`;
        expect.soft(r.status(), qui).toBe(403);
        expect.soft(await r.json(), qui).toEqual({ erreur: "origine" });
      }
    }
  });

  await test.step("le webhook de Whop, d’où qu’il vienne : sans signature, 401 « interdit »", async () => {
    for (const origine of [PIRATE, URL_APPLI, null]) {
      const r = await request.post(WEBHOOK, { headers: origine ? { origin: origine } : {}, data: { type: "payment.succeeded", data: {} } });
      expect.soft(r.status(), `depuis ${origine ?? "nulle part"}`).toBe(401);
      expect.soft(await r.json()).toEqual({ erreur: "interdit" });
    }
  });

  await test.step("la désinscription en un clic, d’où qu’elle vienne : sans le bon lien signé, 404 « lien »", async () => {
    for (const origine of [PIRATE, URL_APPLI, null]) {
      const r = await request.post(`${UN_CLIC}?id=00000000-0000-0000-0000-000000000000&cle=pas-la-bonne&quoi=offres`, {
        headers: { "content-type": "application/x-www-form-urlencoded", ...(origine ? { origin: origine } : {}) },
        data: "List-Unsubscribe=One-Click",
      });
      expect.soft(r.status(), `depuis ${origine ?? "nulle part"}`).toBe(404);
      expect.soft(await r.json()).toEqual({ erreur: "lien" });
    }
  });

  await test.step("l’API du mode tournage, d’où qu’elle vienne : sans la clé de l’outil, 401 « interdit »", async () => {
    for (const chemin of API_DU_TOURNAGE)
      for (const origine of [PIRATE, URL_APPLI, null]) {
        const r = await request.post(chemin.replace("[id]", "00000000-0000-0000-0000-000000000000"), { headers: origine ? { origin: origine } : {}, data: {} });
        expect.soft(r.status(), `${chemin} depuis ${origine ?? "nulle part"}`).toBe(401);
        expect.soft(await r.json()).toEqual({ erreur: "interdit" });
      }
  });

  await test.step("depuis l’appli, la même requête passe ce contrôle", async () => {
    const deconnexion = await request.post("/api/auth/deconnexion", { headers: { origin: URL_APPLI }, data: {} });
    expect(deconnexion.status()).toBe(200);
    expect(await deconnexion.json()).toEqual({ ok: true });
    /* Plus loin, l’email manque : refusée pour ça, pas pour son origine */
    const attente = await request.post("/api/attente", { headers: { origin: URL_APPLI }, data: {} });
    expect(attente.status()).toBe(422);
    expect(await attente.json()).toEqual({ erreur: "email" });
    /* Sans session, « Tout effacer » n’a rien à effacer : il le dit (401), au lieu d’un « c’est fait » */
    const effacer = await request.delete("/api/compte", { headers: { origin: URL_APPLI } });
    expect(effacer.status()).toBe(401);
    expect(await effacer.json()).toEqual({ erreur: "connexion" });
  });
});

test("connecté, une page d’un autre site ne peut ni le déconnecter, ni supprimer son compte", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "visite");
  await seConnecter(page, email);
  /* Sans conv, la connexion mène au choix de l’appli */
  await expect(page).toHaveURL(/\/commencer$/);

  await test.step("un formulaire du site piège, envoyé tout seul vers la déconnexion, est refusé", async () => {
    await page.route(`${PIRATE}/**`, (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><title>Gagne un iPhone</title><form method="post" action="${URL_APPLI}/api/auth/deconnexion"></form><script>document.forms[0].submit()</script>`,
      }),
    );
    const refus = await reponseAuGeste(page, { chemin: "/api/auth/deconnexion" }, () => page.goto(`${PIRATE}/`));
    expect(refus.status()).toBe(403);
  });

  await test.step("la même requête, avec ses cookies, ne supprime pas son compte", async () => {
    const r = await page.request.delete("/api/compte", { headers: { origin: PIRATE } });
    expect(r.status()).toBe(403);
    expect(await compteDe(email)).not.toBeNull();
  });

  await test.step("il est toujours connecté : son compte s’ouvre, avec son email", async () => {
    await page.goto("/compte");
    await expect(page).toHaveURL(/\/compte$/);
    await expect(page.getByText(email)).toBeVisible();
  });
});

test("les vocaux d’une conv ne s’écoutent que depuis son compte : ni un autre compte, ni sans session", async ({ page, request, autreAppareil }, testInfo) => {
  /* Le compte de Noé : le vocal de son rapport, et une réponse du chat dite en vocal (ils citent leur conv) */
  const email = await lectureComplete(page, testInfo);
  await ouvrir(page, "/app");
  expect(await ecrireABlush(page, "parle-moi en vocal")).toBe(200);
  const histoire = (await histoiresDe(email))[0]!;
  const vocal = await dernierVocalDuChat(email);
  expect(vocal).not.toBeNull();
  const adresses = [`/api/vocal/audio?conv=${histoire.id}`, `/api/vocal/chat/${vocal}`];

  await test.step("son compte les écoute", async () => {
    for (const adresse of adresses) {
      const r = await page.request.get(adresse);
      expect.soft(r.status(), adresse).toBe(200);
      expect.soft(r.headers()["content-type"], adresse).toBe("audio/mpeg");
    }
  });

  await test.step("un autre compte, connecté : rien à cette adresse (404)", async () => {
    const intrus = await autreAppareil();
    await connecterParApi(intrus, testInfo, emailLibre(testInfo, "intrus-vocal"));
    for (const adresse of adresses) expect.soft((await intrus.request.get(adresse)).status(), adresse).toBe(404);
  });

  await test.step("sans session : la connexion d’abord (401)", async () => {
    for (const adresse of adresses) expect.soft((await request.get(adresse)).status(), adresse).toBe(401);
  });
});

test("la purge de la nuit : refusée sans le bon secret, elle efface les brouillons de plus de 24 h et garde les récents", async ({ request }, testInfo) => {
  await test.step("sans « Bearer CRON_SECRET » : 401", async () => {
    for (const authorization of [null, "Bearer un-secret-qui-n-est-pas-le-bon", CRON_SECRET, `bearer ${CRON_SECRET}`]) {
      const r = await request.get("/api/cron/purge", { headers: authorization ? { authorization } : {} });
      expect.soft(r.status(), authorization ?? "sans en-tête").toBe(401);
      expect.soft(await r.json(), authorization ?? "sans en-tête").toEqual({ erreur: "interdit" });
    }
  });

  /* Deux convs importées sans email (des brouillons) ; l’une fait comme si elle datait d’hier soir */
  const importer = async () => {
    await prouverHumain(request, testInfo);
    const r = await request.post("/api/import", {
      headers: { origin: URL_APPLI },
      multipart: { fichier: { name: "_chat.txt", mimeType: "text/plain", buffer: Buffer.from(texteWhatsApp()) }, consentement: CASE_IMPORT.version },
    });
    expect(r.status()).toBe(200);
    return ((await r.json()) as { story: { id: string } }).story.id;
  };
  const ancien = await importer();
  const recent = await importer();
  await vieillirHistoire(ancien, 25);

  await test.step("avec le secret : 200, l’ancien brouillon est effacé, le récent reste", async () => {
    const r = await request.get("/api/cron/purge", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(r.status()).toBe(200);
    /* Les nombres dépendent des autres tests qui tournent en même temps : seulement leur forme */
    expect(await r.json()).toEqual({ brouillons: expect.any(Number), convs: expect.any(Number), sessions: expect.any(Number) });
    expect(await histoireExiste(ancien)).toBe(false);
    expect(await histoireExiste(recent)).toBe(true);
  });
});
