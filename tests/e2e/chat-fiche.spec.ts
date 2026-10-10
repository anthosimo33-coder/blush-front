import { readFileSync } from "node:fs";
import {
  attendreTaches,
  capturesPng,
  champDuChat,
  choisirFichier,
  compteDe,
  ecrireABlush,
  ecrireParApi,
  emailLibre,
  expect,
  exportWhatsApp,
  filDuChat,
  glisserAuDoigt,
  lectureBlushPlus,
  lectureFaite,
  messagesDuChat,
  oublierLaMemoire,
  ouvrir,
  PAIEMENT,
  REFUS_FACTICE,
  releverLePressePapiers,
  remplirLaLimite,
  RESEAU,
  reponseAuGeste,
  test,
  texteQuiNEstPasUneConv,
} from "./aide";

/*
 * Le chat du quotidien (/app), après une lecture : l’intro de BLUSH, un message écrit et ses bulles, les questions
 * toutes prêtes, le « + » (des captures, un nouvel export), la conv gardée d’un chargement à l’autre. Réservé à BLUSH+ :
 * un compte gratuit tombe sur le paiement. Le modèle factice répond toujours pareil (src/server/ia/factice.ts) :
 * « elle te cherche 👀 », « et toi tu fais le mec occupé », puis « tu lui as répondu quoi ? ».
 */

/** La dernière question de chaque réponse de BLUSH (le modèle factice) : une par réponse arrivée dans la conv. */
const QUESTION_DE_BLUSH = "tu lui as répondu quoi ?";

test("le chat au quotidien : l’intro de BLUSH, un message écrit, ses bulles, et la conv retrouvée après un rechargement", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  /* « on s’est vus » : une nouvelle, que BLUSH garde en mémoire (le modèle factice la reconnaît à ces mots) */
  const message = "on s’est vus hier soir, c’était trop bien";
  const email = await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", () => lectureBlushPlus(page, testInfo));

  await test.step("l’accueil s’ouvre sur l’intro de BLUSH : ton prochain pas, puis « Elle vient de répondre ? »", async () => {
    await ouvrir(page, "/app");
    await expect(page.getByRole("heading", { level: 1, name: "Ta conv avec BLUSH" })).toBeAttached();
    await expect(fil.getByText("À toi de jouer")).toBeVisible();
    await expect(fil.getByText("Samedi, tu lui réponds en face.")).toBeVisible();
    await expect(fil.getByText("Elle vient de répondre ?")).toBeVisible();
    await expect(fil.getByText("Ajoute sa réponse : capture, export ou texte. BLUSH reconnaît tout seul.")).toBeVisible();
    /* Champ vide : le vocal à la place de la flèche, comme dans Messages */
    await expect(page.getByRole("button", { name: "Enregistrer un vocal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer" })).toHaveCount(0);
  });

  await test.step("un message écrit part : le champ se vide, BLUSH répond en bulles et cite votre conv", async () => {
    const champ = champDuChat(page);
    await champ.fill(message);
    await expect(page.getByRole("button", { name: "Enregistrer un vocal" })).toHaveCount(0);
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(champ).toHaveValue("");
    await expect(fil.getByText(message)).toBeVisible();
    await expect(fil.getByText("elle te cherche 👀")).toBeVisible();
    /* Le message de Maëlys qu’il a lu, avec qui l’a écrit et quand (l’export n’a pas de fuseau : l’heure telle quelle) */
    await expect(fil.getByText("grave 😊 t’es bien rentré")).toBeVisible();
    await expect(fil.getByText("Maëlys · 04/09 19:08")).toBeVisible();
    await expect(fil.getByText("et toi tu fais le mec occupé")).toBeVisible();
    await expect(fil.getByText(QUESTION_DE_BLUSH)).toBeVisible();
    await expect(fil.getByRole("button", { name: "Partager" })).toHaveCount(1);
  });

  await test.step("rechargé, l’accueil retrouve l’échange dans l’ordre : il est gardé en base", async () => {
    await ouvrir(page);
    await expect(fil.getByText(QUESTION_DE_BLUSH)).toBeVisible();
    const texte = await fil.innerText();
    const ordre = ["À toi de jouer", message, "elle te cherche 👀", "et toi tu fais le mec occupé", QUESTION_DE_BLUSH].map((t) => texte.indexOf(t));
    expect(ordre.every((k, i) => k >= 0 && (i === 0 || k > ordre[i - 1])), `ordre dans la conv : ${ordre.join(", ")}`).toBe(true);
    expect(await messagesDuChat(email)).toEqual(["toi", "blush"]);
  });

  await test.step("la nouvelle rejoint sa fiche : la mémoire se met à jour après la réponse", async () => {
    expect((await attendreTaches(email)).map((t) => [t.genre, t.statut])).toContainEqual(["memoire_maj", "fini"]);
    await ouvrir(page, "/app/fiche");
    await expect(page.getByRole("region", { name: "Tes notes" }).getByText("Adore les soirées improvisées")).toBeVisible();
  });
});

test("les questions toutes prêtes : une pastille devient ta question, BLUSH écrit puis répond, et la rangée se masque sur cet appareil", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  const questions = page.getByRole("group", { name: "Questions toutes prêtes" });
  const pastilles = questions.getByRole("button", { name: /\?$/ });
  const ecrit = fil.getByRole("status").filter({ hasText: "BLUSH analyse sa réponse" });

  await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", () => lectureBlushPlus(page, testInfo));

  await test.step("au-dessus du champ, les quatre questions de la mémoire", async () => {
    await ouvrir(page, "/app");
    await expect(pastilles).toHaveText(["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"]);
  });

  await test.step("touchée, la pastille part comme ta question ; pendant que BLUSH écrit, la rangée s’efface", async () => {
    /* La réponse est retenue le temps de voir BLUSH écrire (le modèle factice répond presque tout de suite) */
    let relacher!: () => void;
    const retenue = new Promise<void>((r) => (relacher = r));
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() === "POST") await retenue;
      await route.continue();
    });
    await questions.getByRole("button", { name: "samedi je fais quoi ?" }).click();
    await expect(fil.getByText("samedi je fais quoi ?")).toBeVisible();
    await expect(ecrit).toBeVisible();
    await expect(questions).toBeHidden();
    relacher();
    await expect(fil.getByText(QUESTION_DE_BLUSH)).toBeVisible();
    await expect(ecrit).toHaveCount(0);
    await page.unroute("**/api/chat");
  });

  await test.step("la question posée quitte la rangée, les trois autres reviennent", async () => {
    await expect(pastilles).toHaveText(["pourquoi elle vanne ?", "je relance trop ?", "qui craque en premier ?"]);
  });

  await test.step("masquée d’un geste, la rangée laisse « Idées de questions », et le reste après un rechargement", async () => {
    await questions.getByRole("button", { name: "Masquer les idées de questions" }).click();
    await expect(questions).toBeHidden();
    const idees = page.getByRole("button", { name: "Idées de questions", exact: true });
    await expect(idees).toBeVisible();
    await ouvrir(page);
    await expect(fil.getByText("samedi je fais quoi ?")).toBeVisible();
    await expect(idees).toBeVisible();
    await expect(questions).toBeHidden();
    /* « Idées de questions » la rouvre ; la question déjà posée y revient : elle ne quitte la rangée que pendant la visite */
    await idees.click();
    await expect(pastilles).toHaveText(["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"]);
    await expect(idees).toBeHidden();
  });
});

test("le « + » du chat : le menu, un nouvel export puis des captures, montrés dans la conv puis résumés dans l’historique", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  const plus = page.getByRole("button", { name: "Ajouter des captures ou un export" });
  const menu = page.getByRole("menu", { name: "Ajouter" });
  const reponses = fil.getByText(QUESTION_DE_BLUSH);
  /* Le même export, une soirée plus loin : 84 messages, dont 20 que BLUSH n’a pas encore lus */
  const nouvel = exportWhatsApp(testInfo, { n: 84, format: "txt" });
  const deja = fil.getByText("ça, je l’ai déjà 😌 rien de nouveau depuis la dernière fois");

  const email = await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", async () => {
    const email = await lectureBlushPlus(page, testInfo);
    await ouvrir(page, "/app");
    await expect(fil).toBeVisible();
    return email;
  });

  await test.step("le « + » ouvre le menu (des captures, ou un export) ; Échap le referme", async () => {
    await expect(plus).toHaveAttribute("aria-expanded", "false");
    await plus.click();
    await expect(plus).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem")).toHaveText([/^Ajoute tes captures/, /^Exporte votre conv\./]);
    await expect(menu.getByRole("menuitem", { name: /^Ajoute tes captures/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(plus).toHaveAttribute("aria-expanded", "false");
  });

  await test.step("un nouvel export (20 messages de plus) : le fichier part dans la conv, BLUSH y répond", async () => {
    await plus.click();
    await choisirFichier(page, nouvel.chemin, menu.getByRole("menuitem", { name: /^Exporte votre conv\./ }));
    await expect(menu).toBeHidden();
    await expect(fil.getByText(nouvel.nom, { exact: true })).toBeVisible();
    await expect(fil.getByText(/^\d+ ko$/)).toBeVisible();
    await expect(reponses).toHaveCount(1);
  });

  await test.step("le même export, renvoyé : BLUSH l’a déjà, rien ne s’enregistre", async () => {
    await plus.click();
    await choisirFichier(page, nouvel.chemin, menu.getByRole("menuitem", { name: /^Exporte votre conv\./ }));
    await expect(deja).toBeVisible();
    expect(await messagesDuChat(email)).toEqual(["toi", "blush"]);
  });

  await test.step("deux captures : leurs images partent dans la conv, BLUSH y répond", async () => {
    await plus.click();
    await choisirFichier(page, capturesPng(testInfo, 2), menu.getByRole("menuitem", { name: /^Ajoute tes captures/ }));
    await expect(fil.getByRole("img", { name: "Capture 1" })).toBeVisible();
    await expect(fil.getByRole("img", { name: "Capture 2" })).toBeVisible();
    await expect(reponses).toHaveCount(2);
  });

  await test.step("rechargé, l’historique garde les échanges : les fichiers n’y sont plus, résumés à leur place", async () => {
    await ouvrir(page);
    await expect(reponses).toHaveCount(2);
    await expect(fil.getByText("(ton export : 20 nouveaux messages)")).toBeVisible();
    await expect(fil.getByText("(2 captures : 24 nouveaux messages, son profil)")).toBeVisible();
    await expect(fil.getByRole("img", { name: /^Capture/ })).toHaveCount(0);
    await expect(fil.getByText(nouvel.nom)).toHaveCount(0);
    await expect(deja).toHaveCount(0);
    expect(await messagesDuChat(email)).toEqual(["toi", "blush", "toi", "blush"]);
    /* L’export et les captures apportent du neuf : deux mises à jour de la mémoire, après les réponses (ce qu’elles
       rangent dans sa fiche : chat-fiche-sa-fiche.spec.ts) */
    expect((await attendreTaches(email)).filter((t) => t.genre === "memoire_maj").map((t) => t.statut)).toEqual(["fini", "fini"]);
  });
});

test("un compte gratuit : le chat et sa fiche sont réservés à BLUSH+ (le paiement s’ouvre, le serveur refuse)", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "gratuit");
  const paiement = page.getByRole("dialog", { name: PAIEMENT });

  await test.step("un compte gratuit dont la lecture est faite (le verdict seul)", async () => {
    await lectureFaite(page, testInfo, email);
  });

  await test.step("le chat s’ouvre sous le paiement, BLUSH+ choisi d’avance", async () => {
    await ouvrir(page, "/app");
    await expect(paiement).toBeVisible();
    await expect(paiement.getByRole("radio", { name: /^BLUSH\+/ })).toBeChecked();
    await expect(paiement.getByRole("radio", { name: /^Le rapport complet/ })).not.toBeChecked();
    /* Sans BLUSH+, pas de mémoire : pas de questions toutes prêtes */
    await expect(page.getByRole("group", { name: "Questions toutes prêtes" })).toHaveCount(0);
  });

  await test.step("« Débloquer » : pas de paiement pendant la bêta, le compte reste gratuit", async () => {
    await paiement.getByRole("button", { name: "Débloquer" }).click();
    await expect(paiement.getByRole("status")).toHaveText("Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.");
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });

  await test.step("fermer le paiement ramène au rapport", async () => {
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/rapport$/);
  });

  await test.step("sa fiche aussi s’ouvre sous le paiement", async () => {
    await ouvrir(page, "/app/fiche");
    await expect(paiement).toBeVisible();
  });

  await test.step("le serveur refuse le chat et l’ajout à sa fiche d’un compte gratuit : rien ne s’écrit", async () => {
    const origin = new URL(page.url()).origin;
    const chat = await page.request.post("/api/chat", { headers: { origin }, data: { texte: "elle m’a répondu, je lui dis quoi ?" } });
    expect(chat.status()).toBe(402);
    expect(await chat.json()).toEqual({ erreur: "acces" });
    const [capture] = capturesPng(testInfo);
    const fiche = await page.request.post("/api/fiche", {
      headers: { origin },
      multipart: { captures: { name: "capture-1.png", mimeType: "image/png", buffer: readFileSync(capture) } },
    });
    expect(fiche.status()).toBe(402);
    expect(await fiche.json()).toEqual({ erreur: "acces" });
    expect(await messagesDuChat(email)).toEqual([]);
  });
});

test("les soucis du chat, dits par BLUSH : l’export d’une autre conv, un fichier illisible, le réseau coupé, un refus, la mémoire pas prête, la limite du jour", async ({
  page,
}, testInfo) => {
  const fil = filDuChat(page);
  const plus = page.getByRole("button", { name: "Ajouter des captures ou un export" });
  const unExport = page.getByRole("menu", { name: "Ajouter" }).getByRole("menuitem", { name: /^Exporte votre conv\./ });
  const email = await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");

  await test.step("l’export d’une autre conv (Noé et Inès) : « c’est pas votre conv ça 👀 »", async () => {
    await plus.click();
    await choisirFichier(page, exportWhatsApp(testInfo, { personnes: { toi: "Noé", autre: "Inès" } }).chemin, unExport);
    await expect(fil.getByText("c’est pas votre conv ça 👀 envoie-moi l’export de la vôtre")).toBeVisible();
  });

  await test.step("un .txt qui n’est pas une conv : « j’arrive pas à ouvrir ce fichier »", async () => {
    await plus.click();
    await choisirFichier(page, texteQuiNEstPasUneConv(testInfo), unExport);
    await expect(fil.getByText("j’arrive pas à ouvrir ce fichier")).toBeVisible();
    await expect(fil.getByText("envoie-moi l’export de votre conv : le .zip WhatsApp, ou le message_1.html d’Instagram")).toBeVisible();
  });

  await test.step("le réseau coupé : « j’ai eu un bug, renvoie-moi ça »", async () => {
    await page.route("**/api/chat", (r) => (r.request().method() === "POST" ? r.abort("internetdisconnected") : r.fallback()));
    await champDuChat(page).fill("tu crois qu’elle m’en veut ?");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(fil.getByText("j’ai eu un bug, renvoie-moi ça")).toBeVisible();
    await page.unroute("**/api/chat");
  });

  await test.step("un message que le modèle refuse : BLUSH le dit, sans parler de bug", async () => {
    expect(await ecrireABlush(page, `${REFUS_FACTICE} tu peux lire ses messages à sa place ?`)).toBe(502);
    await expect(fil.getByText("là-dessus je peux pas t’aider")).toBeVisible();
    await expect(fil.getByText("reformule, ou envoie-moi autre chose")).toBeVisible();
  });

  await test.step("la mémoire pas encore faite : « repasse dans deux minutes »", async () => {
    await oublierLaMemoire(email);
    expect(await ecrireABlush(page, "et là, elle pense quoi ?")).toBe(409);
    await expect(fil.getByText("je finis d’écrire ton rapport, repasse dans deux minutes")).toBeVisible();
  });

  await test.step("150 messages dans la journée : « on reprend demain ? »", async () => {
    await remplirLaLimite(email, (id) => `chat:${id}`, 150);
    expect(await ecrireABlush(page, "dernière question promis")).toBe(429);
    const bulle = fil.getByText("tu m’as fait parler toute la journée 😮‍💨 on reprend demain ?");
    await expect(bulle).toBeVisible();
    /* Avant « ? », une espace insécable : le « ? » ne passe jamais seul à la ligne (getByText ne distingue pas les espaces) */
    expect(await bulle.textContent()).toBe("tu m’as fait parler toute la journée 😮‍💨 on reprend demain ?");
  });

  await test.step("rien de tout ça ne s’est écrit en base", async () => {
    expect(await messagesDuChat(email)).toEqual([]);
  });
});

test("BLUSH propose la phrase à lui envoyer, à copier d’un geste, et marque un niveau franchi, une seule fois", async ({ page }, testInfo) => {
  const copie = await releverLePressePapiers(page);
  const fil = filDuChat(page);
  await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");

  await test.step("« je lui envoie quoi ? » : ta meilleure réponse, pourquoi, et « Copier »", async () => {
    expect(await ecrireABlush(page, "elle me propose un verre, je lui envoie quoi ?")).toBe(200);
    await expect(fil.getByText("Ta meilleure réponse")).toBeVisible();
    await expect(fil.getByText("samedi, 20 h ?", { exact: true })).toBeVisible();
    await expect(fil.getByText("un jour, une heure : elle n’a qu’à dire oui")).toBeVisible();
    await fil.getByRole("button", { name: "Copier" }).click();
    await expect(fil.getByRole("button", { name: "Copié" })).toBeVisible();
    expect(await copie()).toBe("samedi, 20 h ?");
  });

  const niveau = fil.getByText(/^Nouveau niveau · On est ensemble$/);
  await test.step("« on est ensemble » : le nouveau niveau s’affiche dans la conv", async () => {
    expect(await ecrireABlush(page, "ça y est, on est ensemble")).toBe(200);
    await expect(niveau).toBeVisible();
  });

  await test.step("le même niveau, redit : il ne s’affiche pas deux fois", async () => {
    expect(await ecrireABlush(page, "on est ensemble, c’est officiel")).toBe(200);
    await expect(fil.getByText("tu lui as répondu quoi ?")).toHaveCount(3);
    await expect(niveau).toHaveCount(1);
  });

  await test.step("rechargé, l’historique garde ta meilleure réponse", async () => {
    await ouvrir(page);
    await expect(fil.getByText("samedi, 20 h ?", { exact: true })).toBeVisible();
  });
});

test("« Glisse pour creuser », au doigt : la réponse glissée devient le point creusé, et ta question part avec", async ({ page, browserName }, testInfo) => {
  /* Les gestes de la conv ne répondent qu’au doigt (src/app/app/HomeScreen.tsx, useThreadGestures) : rien à la souris ni au clavier */
  test.skip(browserName !== "chromium", "un glissé au doigt se joue par le protocole de Chromium");
  const fil = filDuChat(page);
  const creuse = page.getByText("Tu creuses", { exact: true });
  await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");
  expect(await ecrireABlush(page, "elle répond vite mais court")).toBe(200);
  /* La réponse arrive en flux : le glissé attend qu’elle soit là en entier (sa question de la fin) */
  await expect(fil.getByText(QUESTION_DE_BLUSH)).toBeVisible();
  const bulle = fil.getByText("et toi tu fais le mec occupé");

  await test.step("une bulle de BLUSH glissée vers la droite : le point se cale au-dessus du champ ; « Ne plus creuser ce point » l’enlève", async () => {
    await glisserAuDoigt(page, bulle, 160);
    await expect(creuse).toBeVisible();
    await expect(page.getByRole("button", { name: "Ne plus creuser ce point" })).toBeVisible();
    await page.getByRole("button", { name: "Ne plus creuser ce point" }).click();
    await expect(creuse).toHaveCount(0);
  });

  await test.step("creusé de nouveau, ta question part avec le point creusé", async () => {
    await glisserAuDoigt(page, bulle, 160);
    await expect(creuse).toBeVisible();
    const champ = page.getByRole("textbox", { name: /^Ta question sur ce point/ });
    await champ.fill("c’est mauvais signe ?");
    const envoi = await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Envoyer" }).click());
    expect(envoi.request().postDataJSON()).toEqual({ texte: "(à propos de « et toi tu fais le mec occupé ») c’est mauvais signe ?" });
    expect(envoi.status()).toBe(200);
    await expect(creuse).toHaveCount(0);
    await expect(fil.getByText("tu lui as répondu quoi ?")).toHaveCount(2);
  });
});

test("l’historique du chat : les vingt derniers échanges à l’ouverture, les plus anciens en remontant, à leur place", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  /* « question n° 7 » : un texte à lui par échange, de quoi suivre l’ordre ; exact, pour ne pas confondre 1 et 12 */
  const question = (n: number) => fil.getByText(`question n° ${n}`, { exact: true });
  await lectureBlushPlus(page, testInfo);
  /* 22 échanges : le serveur en rend 20 à l’ouverture (src/server/chat.ts, historique) */
  for (let n = 1; n <= 22; n++) await ecrireParApi(page, testInfo, `question n° ${n}`);

  await test.step("à l’ouverture : les vingt derniers échanges, pas les deux premiers", async () => {
    await ouvrir(page, "/app");
    await expect(question(22)).toBeVisible();
    await expect(question(3)).toBeAttached();
    await expect(question(1)).toHaveCount(0);
    await expect(question(2)).toHaveCount(0);
  });

  await test.step("en remontant tout en haut, les plus anciens arrivent d’eux-mêmes, et la conv reste à sa place", async () => {
    /* Le chargement est retenu le temps de le voir */
    let relacher!: () => void;
    const retenu = new Promise<void>((r) => (relacher = r));
    await page.route(/\/api\/chat\?avant=/, async (r) => {
      await retenu;
      await r.fallback();
    });
    const chargement = page.getByRole("status", { name: "Chargement des messages plus anciens" });
    /* Remonter tout en haut, comme au doigt (une conv qui vient de s’ouvrir attend un instant avant de charger) */
    await expect(async () => {
      await question(22).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Voir les messages plus anciens" }).scrollIntoViewIfNeeded({ timeout: 2_000 });
      await expect(chargement).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: RESEAU });
    const avant = (await question(3).boundingBox())!.y;
    relacher();
    await expect(question(1)).toBeAttached();
    await expect(chargement).toHaveCount(0);
    /* Les anciens se posent au-dessus : l’échange qu’on lisait n’a pas sauté */
    expect(Math.abs((await question(3).boundingBox())!.y - avant)).toBeLessThan(60);
  });

  await test.step("les vingt-deux échanges sont là, dans l’ordre, chacun une fois ; plus rien à charger", async () => {
    const texte = await fil.innerText();
    const places = Array.from({ length: 22 }, (_, k) => texte.search(new RegExp(`question n° ${k + 1}(?!\\d)`)));
    expect(places.every((p, k) => p >= 0 && (k === 0 || p > places[k - 1])), `l’ordre dans la conv : ${places.join(", ")}`).toBe(true);
    for (const n of [1, 2, 3, 22]) await expect(question(n)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Voir les messages plus anciens" })).toHaveCount(0);
  });
});

/*
 * Le champ du chat est dans un <label> qui contient aussi ses boutons (le vocal, ou la flèche) : son nom accessible les
 * lit avec lui (« Écris à BLUSH, ou colle sa réponse Enregistrer un vocal »). src/app/app/HomeScreen.tsx:1310
 */
test.fixme("le champ du chat porte son seul nom, sans celui du bouton à côté", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");
  await expect(page.getByRole("textbox", { name: "Écris à BLUSH, ou colle sa réponse", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Écris à BLUSH, ou colle sa réponse", exact: true }).fill("elle m’a vu");
  await expect(page.getByRole("textbox", { name: "Écris à BLUSH, ou colle sa réponse", exact: true })).toBeVisible();
});
