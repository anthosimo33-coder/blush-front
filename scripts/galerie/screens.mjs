/*
 * Galerie des écrans : la liste des états capturés.
 * Chaque état = une route + un état de démo (sessionStorage) + des gestes éventuels.
 * `ref` = nom de la maquette (maquettes/png/{mobile,desktop}/<ref>.png).
 */

export const SECTIONS = [
  { id: "parcours", title: "Entrée", sub: "De l’appli choisie à la lecture de votre conv (écrans 01 à 08)" },
  { id: "rapport", title: "Rapport", sub: "Aperçu gratuit, paiement, rapport complet, question, mode sobre (09 à 12, 18 et 19)" },
  { id: "quotidien", title: "Au quotidien", sub: "Accueil, aide à chaque message, sa fiche, compte (13 à 17 et 20)" },
  { id: "etats", title: "États", sub: "Accès CRUSH+, écrans d’erreur, survol à la souris" },
  { id: "ds", title: "Design system", sub: "La page /styleguide, à comparer aux planches" },
];

const J = { me: "hugo", guess: "flou", goal: "ensemble", exportFileName: "Discussion avec Sophie.zip", exportApp: "whatsapp", app: "whatsapp" };
const JE = { ...J, email: "hugo@email.fr" };
const FREE = { plan: "gratuit", verdict: "normal" };
const PLUS = { plan: "crushplus", verdict: "normal" };

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

export const STATES = [
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
  { id: "09", section: "rapport", title: "Rapport, aperçu gratuit", state: "Page entière", route: "/rapport", journey: J, server: FREE, full: true, ref: "09-rapport-apercu-gratuit" },
  { id: "10", section: "rapport", title: "Paiement", route: "/rapport?paiement=1", journey: J, server: FREE, sheet: true, wait: 900, ref: "10-paiement" },
  { id: "10b", section: "rapport", title: "Paiement réussi", state: "Rapport complet", route: "/rapport/debloque?offre=rapport", journey: J, server: { plan: "rapport", verdict: "normal" }, wait: 1600, note: "Nouvel écran, animé (la gerbe). Textes à valider." },
  { id: "10c", section: "rapport", title: "Paiement réussi", state: "CRUSH+", route: "/rapport/debloque?offre=crushplus", journey: J, server: { plan: "crushplus", verdict: "normal" }, wait: 1600, note: "Nouvel écran, animé (la gerbe). Textes à valider." },
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
      await page.evaluate(() => localStorage.setItem("crush.rapport.reprise.v1", JSON.stringify({ chapter: 5 })));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(900);
    },
    note: "Au retour, on propose de reprendre là où tu t’étais arrêté (sans sauter tout seul).",
  },
  { id: "12", section: "rapport", title: "Ta question", state: "Saisie", route: "/rapport/question", server: { plan: "rapport" }, note: "État de saisie absent des maquettes." },
  { id: "12b", section: "rapport", title: "Ta question", state: "Réponse", route: "/rapport/question", server: { plan: "rapport", questionAsked: "Est-ce qu’elle voit quelqu’un d’autre ?" }, ref: "12-ta-question" },
  { id: "18", section: "rapport", title: "Mode sobre, le verdict", route: "/rapport", server: { verdict: "difficile" }, ref: "18-sobre-verdict-difficile" },
  { id: "19", section: "rapport", title: "Mode sobre, passer à autre chose", route: "/rapport", server: { verdict: "difficile" }, steps: click("Et maintenant ?"), ref: "19-sobre-passer-a-autre-chose" },
  { id: "18b", section: "rapport", title: "Mode sobre", state: "Besoin d’en parler", route: "/rapport", server: { verdict: "difficile" }, steps: click("Besoin d’en parler à quelqu’un ?"), sheet: true, note: "Ressources d’aide à valider." },

  /* ———— Au quotidien ———— */
  { id: "13", section: "quotidien", title: "Accueil", state: "Le chat", route: "/app", server: PLUS, ref: "13-accueil", note: "Proposition\u00a0: l’accueil devient le chat avec CRUSH\u00a0; le rapport et sa fiche passent dans les détails du contact (écart à la maquette)." },
  {
    id: "13b", section: "quotidien", title: "Accueil", state: "Après sa réponse", route: "/app", server: PLUS,
    steps: async (page) => {
      await page.getByRole("textbox", { name: /Écris à CRUSH/ }).fill("je suis crevée cette semaine, on verra");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1900);
    },
    note: "Simulation\u00a0: une question (qui finit par «\u00a0?\u00a0») reçoit une réponse de CRUSH, le reste est lu comme sa réponse à elle.",
    sheet: true,
  },
  { id: "13c", section: "quotidien", title: "Accueil", state: "Menu « + »", route: "/app", server: PLUS, steps: click("Ajouter des captures ou un export", { wait: 600 }), sheet: true },
  { id: "13d", section: "quotidien", title: "Accueil", state: "Détails du contact", route: "/app", server: PLUS, steps: async (page) => { await page.locator("button[aria-haspopup=dialog]:visible").first().click(); await page.waitForTimeout(800); }, sheet: true },
  {
    id: "13e", section: "quotidien", title: "Accueil", state: "Après « Copier »", route: "/app", server: PLUS,
    steps: async (page) => {
      await page.getByRole("textbox", { name: /Écris à CRUSH/ }).fill("je suis crevée cette semaine, on verra");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1900);
      await page.getByRole("button", { name: "Copier", exact: true }).click();
      await page.waitForTimeout(900);
    },
    ref: "14-son-message-et-ta-reponse",
    note: "Après «\u00a0Copier\u00a0», la coche «\u00a0Copié\u00a0» suffit.",
    sheet: true,
  },
  { id: "16", section: "quotidien", title: "Sa fiche", route: "/app/fiche", server: PLUS, ref: "16-sa-fiche", note: "Proposition\u00a0: fiche à la manière de Contacts, chaque info avec sa source (écart à la maquette)." },
  { id: "16b", section: "quotidien", title: "Sa fiche", state: "Modifier", route: "/app/fiche", server: PLUS, steps: click("Modifier", { exact: true }), note: "Mode modification absent des maquettes." },
  {
    id: "16c",
    section: "quotidien",
    title: "Sa fiche",
    state: "+ une note",
    route: "/app/fiche",
    server: PLUS,
    steps: async (page) => {
      await click("Une note")(page);
      await page.locator("#note-text").fill("Préfère les textos le soir");
      await page.waitForTimeout(300);
    },
    sheet: true,
    note: "Panneau absent des maquettes.",
  },
  { id: "17", section: "quotidien", title: "Ajouter à sa fiche", route: "/app/fiche/ajouter", server: PLUS, wait: 1300, ref: "17-ajouter-a-sa-fiche" },
  { id: "20", section: "quotidien", title: "Mon compte", route: "/compte", server: PLUS, ref: "20-mon-compte" },
  { id: "20b", section: "quotidien", title: "Mon compte", state: "Supprimer l’histoire", route: "/compte", server: PLUS, steps: click("Supprimer l’histoire avec Sophie"), sheet: true, note: "Confirmation absente des maquettes." },

  /* ———— États ———— */
  { id: "E1", section: "etats", title: "Accès CRUSH+", state: "Plan « rapport » sur l’accueil", route: "/app", server: { plan: "rapport" }, sheet: true, wait: 1000, note: "Panneau absent des maquettes." },
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
