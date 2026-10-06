/*
 * Galerie des écrans : la liste des états capturés.
 * Chaque état = une route + un état de démo (sessionStorage) + des gestes éventuels.
 * `ref` = nom de la maquette (maquettes/png/{mobile,desktop}/<ref>.png).
 */

export const SECTIONS = [
  { id: "landing", title: "Landing", sub: "La page d’accueil du site (/), avant le parcours" },
  { id: "parcours", title: "Entrée", sub: "De l’appli choisie à la lecture de votre conv (écrans 01 à 08)" },
  { id: "rapport", title: "Rapport", sub: "Aperçu gratuit, paiement, rapport complet, question, mode sobre (09 à 12, 18 et 19)" },
  { id: "quotidien", title: "Au quotidien", sub: "Accueil, aide à chaque message, sa fiche, compte (13, 16 et 20)" },
  { id: "etats", title: "États", sub: "Accès BLUSH+, écrans d’erreur, survol à la souris" },
  { id: "ds", title: "Design system", sub: "La page /styleguide, à comparer aux planches" },
];

const J = { me: "hugo", guess: "flou", goal: "ensemble", exportFileName: "Discussion avec Sophie.zip", exportApp: "whatsapp", app: "whatsapp" };
const JE = { ...J, email: "hugo@email.fr" };
const FREE = { plan: "gratuit", verdict: "normal" };
const PLUS = { plan: "blushplus", verdict: "normal" };

const click = (name, opts = {}) => async (page) => {
  await page.getByRole(opts.role ?? "button", { name, exact: opts.exact ?? false }).first().click();
  await page.waitForTimeout(opts.wait ?? 700);
};

/* Captures d’exemple réalistes (une vraie conv rendue en HTML), pour l’état « captures choisies ». */
const SAMPLE_CONV = [
  [["Hinge · 2 sept."], ["elle", "c’est toi qui grimpes sans corde là ?? 😳"], ["toi", "évidemment. je suis un peu fou"], ["elle", "bon on se le fait ce verre ou pas 😅"], ["toi", "samedi ?"]],
  [["14 déc."], ["elle", "c’était trop bien hier"], ["toi", "grave. faut qu’on y retourne"], ["elle", "le libanais c’était parfait"], ["toi", "on y retourne quand tu veux"]],
  [["6 mars"], ["elle", "ma sœur veut te rencontrer mdr"], ["toi", "haha grave un jour"], ["elle", "tu fais quoi samedi ?"], ["toi", "je suis libre 🙃"]],
  [["2 mars"], ["elle", "au fait on est quoi toi et moi mdr"], ["toi", "mdr"], ["elle", "dimanche y’a un marché de noël à côté du libanais 👀"], ["toi", "carrément"]],
];

async function sampleShot(context, rows) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 780 });
  const bubbles = rows
    .map((r) =>
      r.length === 1
        ? `<div class="day">${r[0]}</div>`
        : `<div class="b ${r[0] === "toi" ? "me" : "her"}">${r[1]}</div>`,
    )
    .join("");
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#fff;color:#111}
    .bar{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font-weight:600;font-size:15px}
    .head{display:flex;align-items:center;gap:10px;padding:8px 16px 12px;border-bottom:1px solid #eee}
    .av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#ffb3d1,#ff5c9d);color:#fff;font-weight:700;display:grid;place-items:center}
    .n{font-weight:700;font-size:16px}.s{font-size:12px;color:#8e8e93}
    .list{display:flex;flex-direction:column;gap:8px;padding:18px 14px}
    .day{align-self:center;font-size:12px;color:#8e8e93;margin:4px 0 6px}
    .b{max-width:74%;padding:10px 14px;border-radius:20px;font-size:16px;line-height:1.3}
    .her{align-self:flex-start;background:#efeff4;border-bottom-left-radius:6px}
    .me{align-self:flex-end;background:#3d8bff;color:#fff;border-bottom-right-radius:6px}
  </style></head><body><div class="bar"><span>21:42</span><span>●●● 5G</span></div>
  <div class="head"><span style="font-size:22px;color:#3d8bff">‹</span><div class="av">S</div><div><div class="n">Sophie</div><div class="s">Vu à 21:40</div></div></div>
  <div class="list">${bubbles}</div></body></html>`);
  const buf = await p.screenshot({ type: "png" });
  await p.close();
  return buf;
}

async function pickCaptures(page) {
  const files = [];
  for (let i = 0; i < SAMPLE_CONV.length; i++) {
    files.push({ name: `capture-${i + 1}.png`, mimeType: "image/png", buffer: await sampleShot(page.context(), SAMPLE_CONV[i]) });
  }
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(files);
  await page.waitForTimeout(1300);
}

/* Une capture d’exemple de sa bio Hinge, pour la fiche. */
async function sampleBio(context) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 760 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#fff;color:#111}
    .photo{height:420px;background:linear-gradient(160deg,#FFC48F,#FF9AA8 50%,#B79CFF)} .in{padding:22px}
    .n{font-size:30px;font-weight:700}.s{color:#8e8e93;margin-top:4px}
    .bio{margin-top:20px;padding:18px;border-radius:14px;background:#f5f5f7;font-size:19px;line-height:1.35}
  </style></head><body><div class="photo"></div><div class="in"><div class="n">Sophie, 27</div><div class="s">Lyon</div>
  <div class="bio">Grimpeuse du dimanche, Lyonnaise depuis toujours. Je cherche quelqu’un qui me fait rire.</div></div></body></html>`);
  const buf = await p.screenshot({ type: "png" });
  await p.close();
  return buf;
}

async function addBio(page, wait) {
  await page.locator("input[type=file]").setInputFiles({ name: "bio-hinge.png", mimeType: "image/png", buffer: await sampleBio(page.context()) });
  await page.waitForTimeout(wait);
}

export const STATES = [
  { id: "LC", section: "landing", title: "Landing", state: "Page entière", route: "/", full: true, note: "Le titre en bulles, les convs qui défilent (figées ici\u00a0; on en touche une, BLUSH montre son verdict), BLUSH+ en bloc noir, les avis s’il y en a de vrais, les faits. Textes à valider." },
  {
    id: "LCc", section: "landing", title: "Landing", state: "BLUSH+ (bloc noir)", route: "/", sheet: true, touch: true,
    steps: async (page, key) => {
      if (key === "d") {
        await page.evaluate(() => {
          const el = document.querySelector('section[aria-labelledby="quotidien-titre"]');
          if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64);
        });
        await page.waitForTimeout(400);
        /* La grosse main, posée sur le titre comme sur ngl */
        const b = await page.locator("#quotidien-titre").boundingBox();
        await page.mouse.move(b.x + b.width * 0.64, b.y + b.height * 0.7);
      } else {
        await page.evaluate(() => {
          const el = document.getElementById("demande-1-q");
          if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 420);
        });
      }
      await page.waitForTimeout(600);
    },
    note: "Inspiré de la section de ngl\u00a0: le titre géant, la grosse main en guise de curseur (sur mobile, elle montre qu’on peut toucher), les messages qui font cogiter autour, la cloche 3D du design system, puis les questions qu’on pose à BLUSH en très grand. On en touche une, sa réponse s’ouvre dessous.",
  },
  { id: "LCb", section: "landing", title: "Landing", state: "Une conv choisie", route: "/", sheet: true, steps: async (page) => { await page.getByRole("button", { name: /^Inès/ }).first().click(); await page.waitForTimeout(900); }, note: "On touche une conv\u00a0: BLUSH montre son verdict comme au début d’un vrai rapport (exemple fictif)." },
  {
    id: "LD", section: "landing", title: "Landing", state: "Avis (emplacements)", route: "/?apercu=avis", sheet: true,
    steps: async (page) => {
      await page.evaluate(() => {
        const el = document.getElementById("avis-titre");
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110);
      });
      await page.waitForTimeout(500);
    },
    note: "La section n’apparaît que s’il y a de vrais avis (avec l’accord des personnes). Ici, des emplacements pour juger la mise en page.",
  },
  /* ———— Entrée ———— */
  { id: "01", section: "parcours", title: "Vous vous parlez où ?", route: "/commencer", ref: "01-vous-vous-parlez-ou" },
  { id: "02", section: "parcours", title: "Exporter", state: "WhatsApp", route: "/importer/export?app=whatsapp", ref: "02-exporter" },
  { id: "02b", section: "parcours", title: "Exporter", state: "iMessage", route: "/importer/export?app=imessage", note: "Étapes iMessage absentes des maquettes, à valider." },
  { id: "03", section: "parcours", title: "Captures", state: "Avant sélection", route: "/importer/captures?app=instagram", note: "Zone d’ajout absente des maquettes (remplace les vignettes d’exemple)." },
  { id: "03b", section: "parcours", title: "Captures", state: "4 captures choisies", route: "/importer/captures?app=instagram", steps: pickCaptures, ref: "03-captures" },
  { id: "04", section: "parcours", title: "Ta conv est ajoutée", route: "/importer/ok", journey: J, ref: "04-conv-ajoutee" },
  { id: "05", section: "parcours", title: "Votre histoire réunie", route: "/importer/histoire", journey: { ...J, capturesAdded: true }, ref: "05-histoire-reunie" },
  { id: "06", section: "parcours", title: "Qui est qui", state: "Avant les choix", route: "/qui", journey: { exportFileName: J.exportFileName } },
  { id: "06b", section: "parcours", title: "Qui est qui", state: "Choix faits", route: "/qui", journey: J, ref: "06-qui-est-qui" },
  { id: "07", section: "parcours", title: "Email", state: "Champ vide", route: "/email", journey: J, ref: "07-email" },
  {
    id: "07b",
    section: "parcours",
    title: "Email",
    state: "Email incomplet",
    route: "/email",
    journey: J,
    steps: async (page) => {
      await page.getByLabel("Ton email").fill("hugo@mail");
      await page.getByLabel("Ton email").blur();
      await page.waitForTimeout(400);
    },
    note: "Message d’erreur absent des maquettes, à valider.",
  },
  { id: "07c", section: "parcours", title: "Ton code", state: "Saisie", route: "/email/code", journey: JE, note: "Nouvel écran\u00a0: le code reçu par email (pas de mot de passe). Textes à valider." },
  {
    id: "07d", section: "parcours", title: "Ton code", state: "Code faux", route: "/email/code", journey: JE,
    steps: async (page) => {
      await page.getByLabel("Code à 6 chiffres reçu par email").fill("000000");
      await page.waitForTimeout(1300);
    },
    note: "Démo\u00a0: le code 000000 est refusé, tout autre code à 6 chiffres passe.",
  },
  { id: "08", section: "parcours", title: "Analyse", state: "En cours", route: "/lecture", journey: J, server: { analysisStartedAgo: 1700 }, motion: true, wait: 250, note: "Proposition : la bulle écrit au centre d’un anneau qui se remplit, à la place de la fenêtre de conv (écart à la maquette)." },
  { id: "08b", section: "parcours", title: "Analyse", state: "Terminée", route: "/lecture", journey: J, server: { analysisStartedAt: 1 }, wait: 2200, ref: "08-lecture", note: "Proposition : à la fin, la gerbe remplace la fenêtre de lecture (écart à la maquette)." },

  /* ———— Rapport ———— */
  {
    id: "V1", section: "rapport", title: "Révélation du verdict", state: "Les chiffres", route: "/rapport/verdict", journey: J, server: FREE, sheet: true,
    note: "Proposition (le rapport ne change pas)\u00a0: juste après l’analyse, «\u00a0Voir mon rapport\u00a0» ouvre une scène sombre, une carte à la fois, comme des stories. Toucher à droite ou glisser pour avancer, «\u00a0Passer\u00a0» pour aller droit au rapport. Tout vient des chapitres offerts (1 et 2)\u00a0: rien de payant n’est montré. Ici\u00a0: le nombre de messages défile jusqu’au vrai total. Textes à valider.",
  },
  {
    id: "V2", section: "rapport", title: "Révélation du verdict", state: "Le verdict", route: "/rapport/verdict", journey: J, server: FREE, sheet: true,
    steps: click("Suivant", { wait: 500 }),
    note: "L’emoji tombe et rebondit, les perles jaillissent, le titre arrive mot par mot, puis la phrase et la confiance (figé ici).",
  },
  {
    id: "V3", section: "rapport", title: "Révélation du verdict", state: "Entre vous deux", route: "/rapport/verdict", journey: J, server: FREE, sheet: true,
    steps: async (page) => {
      for (let i = 0; i < 2; i++) await click("Suivant", { wait: 400 })(page);
    },
    note: "Qui fait quoi\u00a0: les barres se remplissent une à une, puis ce que ça veut dire.",
  },
  {
    id: "V4", section: "rapport", title: "Révélation du verdict", state: "Le moment où tout a basculé", route: "/rapport/verdict", journey: J, server: FREE, sheet: true,
    steps: async (page) => {
      for (let i = 0; i < 3; i++) await click("Suivant", { wait: 400 })(page);
    },
    note: "La scène rejouée\u00a0: elle écrit (les trois points), sa bulle arrive, puis ta réponse.",
  },
  {
    id: "V5", section: "rapport", title: "Révélation du verdict", state: "À toi de jouer", route: "/rapport/verdict", journey: J, server: FREE, sheet: true,
    steps: async (page) => {
      for (let i = 0; i < 4; i++) await click("Suivant", { wait: 400 })(page);
    },
    note: "La dernière carte\u00a0: ton prochain pas, puis «\u00a0Voir mon rapport\u00a0» (le rapport habituel) et «\u00a0Partager mon verdict\u00a0» (prénoms masqués).",
  },
  { id: "09", section: "rapport", title: "Rapport, aperçu gratuit", state: "Page entière", route: "/rapport", journey: J, server: FREE, full: true, ref: "09-rapport-apercu-gratuit" },
  { id: "10", section: "rapport", title: "Paiement", route: "/rapport?paiement=1", journey: J, server: FREE, sheet: true, wait: 900, ref: "10-paiement" },
  { id: "10b", section: "rapport", title: "Paiement réussi", state: "Rapport complet", route: "/rapport/debloque?offre=rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, wait: 1600, note: "Nouvel écran, animé (la gerbe). Textes à valider." },
  { id: "10c", section: "rapport", title: "Paiement réussi", state: "BLUSH+", route: "/rapport/debloque?offre=blushplus", journey: J, server: { plan: "blushplus", verdict: "normal" }, wait: 1600, note: "Nouvel écran, animé (la gerbe). Textes à valider." },
  { id: "11", section: "rapport", title: "Rapport complet", state: "Page entière", route: "/rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, full: true, ref: "11-rapport-complet" },
  {
    id: "11b", section: "rapport", title: "Rapport complet", state: "En lisant", route: "/rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, sheet: true,
    steps: async (page) => {
      await page.evaluate(() => document.getElementById("chapitre-5")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
    },
    note: "Mobile\u00a0: la barre garde le chapitre en cours et la progression. Desktop\u00a0: le sommaire suit la lecture.",
  },
  {
    id: "11c", section: "rapport", title: "Rapport complet", state: "Sommaire", route: "/rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, sheet: true, only: "m",
    steps: async (page) => {
      await page.evaluate(() => document.getElementById("chapitre-3")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Sommaire du rapport" }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    id: "11d", section: "rapport", title: "Rapport complet", state: "Reprendre", route: "/rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, sheet: true,
    steps: async (page) => {
      await page.evaluate(() => localStorage.setItem("blush.rapport.reprise.v1", JSON.stringify({ chapter: 5 })));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(900);
    },
    note: "Au retour, on propose de reprendre là où tu t’étais arrêté (sans sauter tout seul).",
  },
  {
    id: "12p", section: "rapport", title: "Ta question", state: "Proposition · les idées", route: "/rapport/question", server: { plan: "rapport" },
    note: "Proposition\u00a0: la question en conversation avec BLUSH (l’écran actuel suit, en 12 et 12b, sur ?version=actuelle). BLUSH t’accueille, propose 4 questions tirées du rapport, comme des réponses toutes prêtes. «\u00a01 question incluse\u00a0» pour le plan rapport. Textes à valider.",
  },
  {
    id: "12q", section: "rapport", title: "Ta question", state: "Proposition · idée choisie", route: "/rapport/question", server: { plan: "rapport" },
    steps: click("on est quoi", { wait: 500 }),
    note: "Un toucher met la question dans le champ, sans l’envoyer\u00a0: la question incluse ne part pas par erreur. On peut la modifier, ou retoucher l’idée pour la retirer.",
  },
  {
    id: "12r", section: "rapport", title: "Ta question", state: "Proposition · BLUSH écrit", route: "/rapport/question", server: { plan: "rapport" }, motion: true,
    steps: async (page) => {
      await click("on est quoi", { wait: 300 })(page);
      await click("Poser ma question", { wait: 1100 })(page);
    },
    note: "Ta question part en bulle bleue\u00a0; BLUSH écrit (sa bulle et la grande bulle du haut s’animent).",
  },
  {
    id: "12s", section: "rapport", title: "Ta question", state: "Proposition · la réponse", route: "/rapport/question", server: { plan: "rapport", questionAsked: "Que voulait dire son «\u00a0on est quoi\u00a0» du 2 mars\u00a0?" }, full: true,
    note: "La réponse en bulles\u00a0: l’essentiel en grand, puis la preuve (son vrai message), l’explication et la confiance. Ensuite\u00a0: «\u00a0Retour au rapport\u00a0», et «\u00a0Toutes tes questions, avec BLUSH+\u00a0» (avec BLUSH+\u00a0: «\u00a0Continuer dans ton chat\u00a0»). Chaque idée a sa propre réponse, tirée du rapport.",
  },
  { id: "12", section: "rapport", title: "Ta question", state: "Actuel · saisie", route: "/rapport/question?version=actuelle", server: { plan: "rapport" }, note: "L’écran actuel, gardé pour comparer. État de saisie absent des maquettes." },
  { id: "12b", section: "rapport", title: "Ta question", state: "Actuel · réponse", route: "/rapport/question?version=actuelle", server: { plan: "rapport", questionAsked: "Est-ce qu’elle voit quelqu’un d’autre ?" }, ref: "12-ta-question" },
  { id: "18", section: "rapport", title: "Mode sobre, le verdict", route: "/rapport", server: { verdict: "difficile" }, ref: "18-sobre-verdict-difficile" },
  { id: "19", section: "rapport", title: "Mode sobre, passer à autre chose", route: "/rapport", server: { verdict: "difficile" }, steps: click("Et maintenant ?"), ref: "19-sobre-passer-a-autre-chose" },
  { id: "18b", section: "rapport", title: "Mode sobre", state: "Besoin d’en parler", route: "/rapport", server: { verdict: "difficile" }, steps: click("Besoin d’en parler à quelqu’un ?"), sheet: true, note: "Ressources d’aide à valider." },

  /* ———— Au quotidien ———— */
  { id: "13", section: "quotidien", title: "Accueil", state: "Le chat", route: "/app", server: PLUS, ref: "13-accueil", note: "Proposition\u00a0: l’accueil devient le chat avec BLUSH\u00a0; le rapport et sa fiche passent dans les détails du contact (écart à la maquette). En haut, BLUSH en grand comme un personnage (sa bulle flotte et s’anime quand il répond)\u00a0: un toucher ouvre «\u00a0Ce que BLUSH voit\u00a0». À droite, Sophie comme un contact (l’anneau de votre niveau, le verdict en badge)\u00a0: un toucher ouvre sa fiche. L’heure sous chaque message et la date à chaque nouveau jour, comme dans Messages. Proposition\u00a0: au-dessus du champ, les 4 questions que promet la landing, en un toucher (l’accueil sans elles est en 13z, sur ?version=actuelle)." },
  {
    id: "13b", section: "quotidien", title: "Accueil", state: "Après sa réponse", route: "/app", server: PLUS,
    steps: async (page) => {
      await page.getByRole("textbox", { name: /Écris à BLUSH/ }).fill("je suis crevée cette semaine, on verra");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1900);
    },
    note: "Simulation\u00a0: une question (qui finit par «\u00a0?\u00a0») reçoit une réponse de BLUSH, le reste est lu comme sa réponse à elle.",
    sheet: true,
  },
  { id: "13c", section: "quotidien", title: "Accueil", state: "Menu « + »", route: "/app", server: PLUS, steps: click("Ajouter des captures ou un export", { wait: 600 }), sheet: true },
  { id: "13d", section: "quotidien", title: "Accueil", state: "Ce que BLUSH voit", route: "/app", server: PLUS, steps: async (page) => { await page.locator("button[aria-haspopup=dialog]:visible").first().click(); await page.waitForTimeout(800); }, sheet: true },
  {
    id: "13e", section: "quotidien", title: "Accueil", state: "Après « Copier »", route: "/app", server: PLUS,
    steps: async (page) => {
      await page.getByRole("textbox", { name: /Écris à BLUSH/ }).fill("je suis crevée cette semaine, on verra");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1900);
      await page.getByRole("button", { name: "Copier", exact: true }).click();
      await page.waitForTimeout(900);
    },
    ref: "14-son-message-et-ta-reponse",
    note: "Après «\u00a0Copier\u00a0», la coche «\u00a0Copié\u00a0» suffit.",
    sheet: true,
  },
  {
    id: "13f", section: "quotidien", title: "Accueil", state: "Vocal en cours", route: "/app", server: PLUS, sheet: true,
    steps: async (page) => {
      await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
      await page.waitForTimeout(2600);
    },
    note: "Nouveau\u00a0: champ vide, le bouton noir à l’onde lance un vocal (le micro est demandé la première fois). Le point rouge, le temps, l’onde qui suit la voix\u00a0; la corbeille jette, la flèche envoie.",
  },
  {
    id: "13g", section: "quotidien", title: "Accueil", state: "Vocal envoyé", route: "/app", server: PLUS, sheet: true,
    steps: async (page) => {
      await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
      await page.waitForTimeout(2200);
      await page.getByRole("button", { name: "Envoyer le vocal" }).click();
      await page.waitForTimeout(2600);
    },
    note: "Le vocal se réécoute dans ta bulle\u00a0; BLUSH y répond (réponse simulée\u00a0: en vrai, le vocal est transcrit puis BLUSH répond à ce qui est dit). Textes à valider.",
  },
  {
    id: "13h", section: "quotidien", title: "Accueil", state: "BLUSH écrit", route: "/app", server: PLUS, sheet: true, motion: true,
    steps: async (page) => {
      await page.getByRole("textbox", { name: /Écris à BLUSH/ }).fill("je suis crevée cette semaine, on verra");
      await page.keyboard.press("Enter");
      /* Pile quand la première perle s’allume (vague de 1,2 s, la réponse arrive à 2 s) */
      await page.waitForTimeout(1480);
    },
    note: "Nouveau\u00a0: quand BLUSH écrit, son logo arrive d’un bond dans la conv, respire, et ses trois perles s’allument l’une après l’autre, comme les trois points de Messages, en rose. La grande bulle du haut s’anime en même temps. À la réponse, la bulle se replie et la réponse monte.",
  },
  {
    id: "13i", section: "quotidien", title: "Accueil", state: "« On en est où ? »", route: "/app", server: PLUS, sheet: true,
    steps: click("On en est où", { wait: 2600 }),
    note: "Proposition\u00a0: une question toute prête part en un toucher, comme si tu l’avais écrite, puis sort de la rangée. «\u00a0On en est où\u00a0?\u00a0»\u00a0: le verdict, les 4 niveaux, la preuve. Textes à valider.",
  },
  {
    id: "13j", section: "quotidien", title: "Accueil", state: "« Je lui réponds quoi ? »", route: "/app", server: PLUS, sheet: true,
    steps: click("Je lui réponds quoi", { wait: 2600 }),
    note: "BLUSH montre son dernier message, puis ta meilleure réponse, à copier. «\u00a0Ça veut dire quoi\u00a0?\u00a0» ajoute ce que ça veut dire\u00a0; «\u00a0Elle voit quelqu’un d’autre\u00a0?\u00a0» répond avec vos messages.",
  },
  { id: "13z", section: "quotidien", title: "Accueil", state: "Actuel (sans les questions)", route: "/app?version=actuelle", server: PLUS, note: "L’accueil sans les questions toutes prêtes, gardé pour comparer." },
  {
    id: "16", section: "quotidien", title: "Sa fiche", route: "/app/fiche", server: PLUS, ref: "16-sa-fiche",
    note: "Refonte\u00a0: un seul geste pour la remplir, «\u00a0Complète sa fiche\u00a0» (des captures ou un export\u00a0; sur ordinateur, on peut aussi les glisser sur la page). BLUSH trouve les infos et les range lui-même, chacune avec sa source\u00a0: plus de tuiles «\u00a0Sa bio / Un post / Une note\u00a0», plus d’écran à cocher (l’ancien écran 17). Nouvelle rubrique «\u00a0À savoir\u00a0» pour ce qu’il trouve\u00a0; «\u00a0Tes notes\u00a0» restent les tiennes. Textes à valider.",
  },
  { id: "16b", section: "quotidien", title: "Sa fiche", state: "Modifier", route: "/app/fiche", server: PLUS, steps: click("Modifier", { exact: true }), note: "Retirer une info fausse, ou ajouter la tienne dans une rubrique." },
  {
    id: "16c", section: "quotidien", title: "Sa fiche", state: "BLUSH analyse", route: "/app/fiche", server: PLUS, motion: true,
    steps: (page) => addBio(page, 1000),
    note: "Pendant l’analyse, la bulle de BLUSH écrit et un trait rose balaie la capture. La simulation lit toujours sa bio Hinge.",
  },
  {
    id: "16d", section: "quotidien", title: "Sa fiche", state: "Infos rangées", route: "/app/fiche", server: PLUS, full: true,
    steps: (page) => addBio(page, 900),
    note: "Ce que BLUSH a trouvé et où il l’a rangé\u00a0; ce qu’il savait déjà n’est pas doublé. Les nouvelles infos portent un point rose (et s’éclairent en rose à leur arrivée). «\u00a0Annuler\u00a0» retire tout.",
  },
  { id: "20", section: "quotidien", title: "Mon compte", route: "/compte", server: PLUS, ref: "20-mon-compte" },
  { id: "20b", section: "quotidien", title: "Mon compte", state: "Supprimer l’histoire", route: "/compte", server: PLUS, steps: click("Supprimer l’histoire avec Sophie"), sheet: true, note: "Confirmation absente des maquettes." },

  /* ———— États ———— */
  { id: "E1", section: "etats", title: "Accès BLUSH+", state: "Plan « rapport » sur l’accueil", route: "/app", server: { plan: "rapport" }, sheet: true, wait: 1000, note: "Panneau absent des maquettes." },
  { id: "E2", section: "etats", title: "Erreur", state: "Fichier illisible", route: "/importer/ok?erreur=fichier" },
  { id: "E3", section: "etats", title: "Erreur", state: "Conversation de groupe", route: "/importer/ok?erreur=groupe" },
  { id: "E4", section: "etats", title: "Erreur", state: "Conv trop courte", route: "/importer/ok?erreur=courte" },
  { id: "E5", section: "etats", title: "Erreur", state: "Échec de la lecture", route: "/importer/ok?erreur=lecture" },
  { id: "E6", section: "etats", title: "Erreur", state: "Capture illisible", route: "/importer/ok?erreur=capture" },
  { id: "H1", section: "etats", title: "Survol", state: "Tuile d’appli (iMessage)", route: "/commencer", hover: 'a[href="/importer/export?app=imessage"]', only: "d" },
  { id: "H2", section: "etats", title: "Survol", state: "Tuile de choix", route: "/qui", journey: J, hover: { role: "radio", name: "On s’est vus" }, only: "d" },
  { id: "H3", section: "etats", title: "Survol", state: "Offre du paiement", route: "/rapport?paiement=1", journey: J, server: FREE, hover: { role: "radio", name: /Le rapport complet/ }, sheet: true, wait: 900, only: "d" },
  { id: "H5", section: "etats", title: "Survol", state: "Bouton principal", route: "/importer/ok", journey: J, hover: { role: "link", name: /Continuer/ }, only: "d" },

  /* ———— Design system ———— */
  { id: "DS", section: "ds", title: "Design system", state: "Page /styleguide", route: "/styleguide", full: true },
];

/* Planches du design system, montrées comme références dans la section « Design system ». */
export const PLANCHES = [
  "00-couverture",
  "01-couleurs",
  "02-typographie",
  "03-boutons-et-controles",
  "04-composants",
  "05-logo",
  "06-logo-en-mouvement",
  "07-objets-3d",
  "08-mode-sobre",
  "09-regles",
];
