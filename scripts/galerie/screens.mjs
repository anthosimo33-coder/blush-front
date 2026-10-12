/*
 * Galerie des écrans : la liste des états capturés, par le vrai back-end (scripts/galerie/galerie.spec.ts).
 * Chaque état = une route + le compte préparé avant (`compte`, par les routes /api et la base des tests) + des gestes
 * éventuels. Les prénoms sont ceux des exports fictifs des tests : Noé (qui importe) et Maëlys.
 * `ref` = nom de la maquette (maquettes/png/{mobile,desktop}/<ref>.png), montrée à côté quand elle est là.
 */

/**
 * Le compte préparé avant la capture (galerie.spec.ts, `preparer`). Sans : aucun compte, aucune conv.
 * - brouillon : une conv importée (POST /api/import), sans email ni compte ;
 * - code : un brouillon, et un code de connexion demandé pour l’email du parcours ;
 * - gratuit : un compte gratuit, sa conv lue (le verdict) ;
 * - lecture-en-cours : un compte gratuit dont la lecture est figée à mi-chemin ;
 * - rapport : le rapport complet acheté une fois (le plan « rapport »), tout écrit ;
 * - equipe : un compte de l’équipe (tout ouvert, bulles illimitées), toute la suite écrite (le rapport, le vocal, la mémoire) ;
 * - sobre : un compte gratuit dont la conv lève une alerte (le mode sobre) ;
 * - plusieurs : un compte de l’équipe avec trois convs lues ;
 * - couple : un compte de l’équipe dont la conv est lue « En couple », toute la suite écrite, le verdict à « Ça coince ».
 * @typedef {"brouillon" | "code" | "gratuit" | "lecture-en-cours" | "rapport" | "equipe" | "sobre" | "plusieurs" | "couple"} Compte
 */

/**
 * Ce que les gestes reçoivent : l’écran (m ou d), l’histoire ouverte, et un code faux pour l’email du parcours.
 * @typedef {{ ecran: "m" | "d", histoire: string | null, codeFaux: string | null }} Contexte
 */

/**
 * @typedef {object} Etat
 * @property {string} id
 * @property {string} section
 * @property {string} title
 * @property {string} [state]
 * @property {string} route
 * @property {string} [ref]
 * @property {string} [note]                    à relire (affiché « À valider »)
 * @property {string} [changement]              ce qui a changé dans la galerie depuis la démo (affiché « Changé »)
 * @property {boolean} [full]                   la page entière (la capture l’est déjà, sauf `sheet`)
 * @property {boolean} [sheet]                  l’écran seul, sans défiler (une feuille, une scène)
 * @property {boolean} [touch]                  le mobile est un vrai écran tactile (pas de survol, pointeur grossier)
 * @property {boolean} [motion]                 les animations jouent (sinon : prefers-reduced-motion)
 * @property {number} [wait]                    l’attente avant les gestes, en ms (600 par défaut)
 * @property {"m" | "d"} [only]                 un seul écran
 * @property {Compte} [compte]
 * @property {number} [bulles]                  les bulles données au compte préparé (un compte qui paie : « rapport »)
 * @property {Record<string, unknown>} [journey] l’état du parcours de l’onglet (sessionStorage), là où l’écran le lit
 * @property {number} [reprise]                 le chapitre où la lecture du rapport s’était arrêtée (dans le navigateur)
 * @property {string | { role: string, name: string | RegExp }} [hover]
 * @property {{ chemin: string, methode?: string }} [retenir] une requête retenue, jamais servie : l’écran reste « en train d’écrire »
 * @property {(page: import("@playwright/test").Page, ctx: Contexte) => Promise<void>} [steps]
 */

export const SECTIONS = [
  { id: "landing", title: "Landing", sub: "La page d’accueil du site (/), avant le parcours" },
  { id: "parcours", title: "Entrée", sub: "De l’appli choisie à la lecture de ta conv (écrans 01 à 08), avec une conv importée pour de vrai" },
  { id: "rapport", title: "Rapport", sub: "La révélation du verdict, l’aperçu gratuit, le paiement, le rapport complet, ta question, le mode sobre (09 à 12, 18 et 19)" },
  { id: "quotidien", title: "Au quotidien", sub: "Le rapport ouvert\u00a0: l’accueil, l’aide à chaque message, sa fiche, le compte (13, 16 et 20)" },
  { id: "convs", title: "Plusieurs convs", sub: "Un compte de l’équipe avec trois convs\u00a0: la liste «\u00a0Tes convs\u00a0» et le passage de l’une à l’autre" },
  { id: "couple", title: "En couple", sub: "Un compte de l’équipe lu «\u00a0En couple\u00a0» (écran 06)\u00a0: la température à la place des étapes" },
  { id: "etats", title: "États", sub: "Le paiement par-dessus, écrans d’erreur, survol à la souris" },
  { id: "equipe", title: "L’équipe et les relances", sub: "Le tableau de bord (/admin, des chiffres d’exemple), la relance par mail et sa désinscription" },
  { id: "ds", title: "Design system", sub: "La page /styleguide, à comparer aux planches" },
];

/** Les états qui ne sont plus dans la galerie, et pourquoi : affichés en haut de la page. */
export const RETIRES = [
  { ids: "LD", why: "Les emplacements d’avis, une variante de la landing\u00a0: la production n’affiche la section qu’avec de vrais avis." },
  { ids: "12, 12b", why: "L’ancien écran de «\u00a0Ta question\u00a0», gardé pour comparer\u00a0: la production montre la question en conversation (12p à 12s)." },
  { ids: "13z", why: "L’accueil sans les questions toutes prêtes, gardé pour comparer\u00a0: la production les montre." },
  {
    ids: "C08, C09, C11, C12, C13i, C13k, C16, CV2, CV3, CV4, CV5",
    why: "Les mêmes écrans que sans couple (08b, 09, 11, 12p, 13i, 16, V2 à V5 et VP2 à VP5)\u00a0: «\u00a0En couple\u00a0» ne change à l’écran que le niveau, la température (en C13 et C13d)\u00a0; le reste, ce sont les textes du vrai modèle, que le modèle factice n’écrit pas. Les questions toutes prêtes de C13i et C13k venaient de la démo\u00a0: elles viennent maintenant de sa mémoire, comme en 13i.",
  },
  { ids: "C18", why: "Le mode sobre en couple venait d’un verdict difficile\u00a0: il ne vient plus que d’une alerte (danger), sans niveau, et s’affiche comme en 18." },
  { ids: "V4 (gratuit)", why: "Un compte gratuit voit 4 cartes\u00a0: «\u00a0le moment\u00a0» vient du chapitre 2, payant. Il est dans la série du rapport ouvert (VP4)." },
];

/* Le parcours de l’onglet : l’export de Noé et Maëlys importé, puis « Qui es-tu ? » rempli (p0 : Noé, le premier de l’export) */
const EXPORT = { app: "whatsapp", exportApp: "whatsapp", exportFileName: "WhatsApp Chat - Maëlys.zip" };
const J = { ...EXPORT, me: "p0", pronom: "il", guess: "flou", goal: "ensemble" };
/* « En couple » choisi : les objectifs changent */
const JC = { ...J, guess: "ensemble", goal: "mieux" };

const click =
  (name, opts = {}) =>
  async (page) => {
    await page
      .getByRole(opts.role ?? "button", { name, exact: opts.exact ?? false })
      .first()
      .click();
    await page.waitForTimeout(opts.wait ?? 700);
  };
/** Avance de `n` cartes dans la révélation du verdict. */
const suivant = (n) => async (page) => {
  for (let i = 0; i < n; i++) await click("Suivant", { wait: i === n - 1 ? 500 : 400 })(page);
};
/** La réponse du serveur à un envoi (POST) sur `chemin`, à attendre : à prendre avant le geste qui l’envoie. */
const reponseA = (page, chemin) => page.waitForResponse((r) => new URL(r.url()).pathname === chemin && r.request().method() === "POST");
/** Fait `geste`, qui écrit à BLUSH (POST /api/chat), puis attend sa réponse à l’écran : la requête servie, puis ses trois points remplacés. */
const reponseDeBlush = async (page, geste) => {
  const reponse = reponseA(page, "/api/chat");
  await geste();
  await reponse;
  await page.waitForFunction(() => !document.querySelector("[data-reading]"));
};
/**
 * Écrit à BLUSH depuis le champ du chat, puis attend sa réponse. `retenue` : la requête est retenue (`retenir`), jamais
 * servie : on attend alors ce temps-là, en ms, BLUSH en train d’écrire.
 */
const ecrire = (texte, retenue) => async (page) => {
  const envoyer = async () => {
    await page.getByRole("textbox", { name: /^Écris à BLUSH/ }).fill(texte);
    await page.keyboard.press("Enter");
  };
  if (!retenue) return reponseDeBlush(page, envoyer);
  await envoyer();
  await page.waitForTimeout(retenue);
};
/**
 * Paie la formule `nom` de la feuille du paiement au faux Whop (BLUSH_PAIEMENT_FACTICE), comme à l’écran : la case de
 * renonciation cochée, « Débloquer », puis « Payer » sur sa page ; on arrive sur « C’est débloqué ».
 */
const payerLaFormule = (nom) => async (page) => {
  const feuille = page.getByRole("dialog");
  await feuille.getByRole("radio", { name: nom }).click();
  await feuille.getByRole("checkbox").check();
  await feuille.getByRole("button", { name: "Débloquer" }).click();
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await page.waitForURL(/\/rapport\/debloque\?achat=/);
  await page.waitForTimeout(1600);
};
/** Commence le paiement de la formule choisie d’avance, la case cochée, puis touche `bouton` (« Refuser », « Annuler ») chez le faux Whop : la page du retour. */
const retourDuFauxWhop = (bouton) => async (page) => {
  const feuille = page.getByRole("dialog");
  await feuille.getByRole("checkbox").check();
  await feuille.getByRole("button", { name: /^Débloquer/ }).click();
  await page.getByRole("button", { name: bouton, exact: true }).click();
  await page.waitForURL(/\/paiement\/retour\?/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(700);
};
/** La première idée de « Ta question » (une question de la mémoire), mise dans le champ. */
const premiereIdee = async (page) => {
  await page.getByRole("group", { name: "Des idées, tirées de ton rapport" }).getByRole("button").first().click();
  await page.waitForTimeout(500);
};
/* « Je lui envoie quoi ? » : le modèle factice répond avec une phrase à lui envoyer, à copier (src/server/ia/factice.ts) */
const QUOI_ENVOYER = "je lui envoie quoi ?";
/* Sa réponse à elle, collée dans le chat */
const SA_REPONSE = "elle m’a répondu « je suis crevée cette semaine, on verra »";

/* Captures d’exemple réalistes (une conv rendue en HTML), pour l’état « captures choisies ». Fictives. */
const SAMPLE_CONV = [
  [
    ["Hinge · 2 sept."],
    ["elle", "c’est toi qui grimpes sans corde là ?? 😳"],
    ["toi", "évidemment. je suis un peu fou"],
    ["elle", "bon on se le fait ce verre ou pas 😅"],
    ["toi", "samedi ?"],
  ],
  [["14 déc."], ["elle", "c’était trop bien hier"], ["toi", "grave. faut qu’on y retourne"], ["elle", "le libanais c’était parfait"], ["toi", "on y retourne quand tu veux"]],
  [["6 mars"], ["elle", "ma sœur veut te rencontrer mdr"], ["toi", "haha grave un jour"], ["elle", "tu fais quoi samedi ?"], ["toi", "je suis libre 🙃"]],
  [["2 mars"], ["elle", "au fait on est quoi toi et moi mdr"], ["toi", "mdr"], ["elle", "dimanche y’a un marché de noël à côté du libanais 👀"], ["toi", "carrément"]],
];

async function sampleShot(context, rows) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 780 });
  const bubbles = rows.map((r) => (r.length === 1 ? `<div class="day">${r[0]}</div>` : `<div class="b ${r[0] === "toi" ? "me" : "her"}">${r[1]}</div>`)).join("");
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
  <div class="head"><span style="font-size:22px;color:#3d8bff">‹</span><div class="av">M</div><div><div class="n">Maëlys</div><div class="s">Vu à 21:40</div></div></div>
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

/* Une capture d’exemple de sa bio Hinge, pour la fiche (le modèle factice y lit toujours la même ligne de profil). */
async function sampleBio(context) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 760 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#fff;color:#111}
    .photo{height:420px;background:linear-gradient(160deg,#FFC48F,#FF9AA8 50%,#B79CFF)} .in{padding:22px}
    .n{font-size:30px;font-weight:700}.s{color:#8e8e93;margin-top:4px}
    .bio{margin-top:20px;padding:18px;border-radius:14px;background:#f5f5f7;font-size:19px;line-height:1.35}
  </style></head><body><div class="photo"></div><div class="in"><div class="n">Maëlys, 26</div><div class="s">Lyon</div>
  <div class="bio">Étudiante en droit, chineuse du dimanche. Je cherche quelqu’un qui me fait rire.</div></div></body></html>`);
  const buf = await p.screenshot({ type: "png" });
  await p.close();
  return buf;
}

/**
 * Ajoute la capture de sa bio à sa fiche, puis attend que BLUSH l’ait lue et rangée (POST /api/fiche servie). `retenue` :
 * la requête est retenue (`retenir`), jamais servie : on attend alors ce temps-là, en ms, BLUSH en train d’analyser.
 */
async function addBio(page, retenue) {
  const bio = { name: "bio-hinge.png", mimeType: "image/png", buffer: await sampleBio(page.context()) };
  const reponse = retenue ? null : reponseA(page, "/api/fiche");
  await page.locator("input[type=file]").setInputFiles(bio);
  if (reponse) await reponse;
  else await page.waitForTimeout(retenue);
}

/** @type {Etat[]} */
export const STATES = [
  {
    id: "LC",
    section: "landing",
    title: "Landing",
    state: "Page entière",
    route: "/",
    full: true,
    note: "Le titre en bulles, les convs qui défilent (figées ici\u00a0; on en touche une, BLUSH montre son verdict), le quotidien en bloc noir, les avis s’il y en a de vrais, les faits. Textes à valider.",
  },
  {
    id: "LCc",
    section: "landing",
    title: "Landing",
    state: "Le quotidien (bloc noir)",
    route: "/",
    sheet: true,
    touch: true,
    steps: async (page, { ecran }) => {
      if (ecran === "d") {
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
  {
    id: "LCb",
    section: "landing",
    title: "Landing",
    state: "Une conv choisie",
    route: "/",
    sheet: true,
    steps: async (page) => {
      await page.getByRole("button", { name: /^Inès/ }).first().click();
      await page.waitForTimeout(900);
    },
    note: "On touche une conv\u00a0: BLUSH montre son verdict comme au début d’un vrai rapport (exemple fictif).",
  },
  {
    id: "LCk",
    section: "landing",
    title: "Landing",
    state: "Une conv de couple choisie",
    route: "/",
    sheet: true,
    steps: async (page) => {
      await page
        .getByRole("button", { name: /^Mon cœur/ })
        .first()
        .click();
      await page.waitForTimeout(900);
    },
    note: "Un couple dans chaque rangée (Mon cœur, Chéri, Julien), avec les verdicts en couple. Exemples fictifs, textes à valider.",
  },

  /* ———— Entrée ———— */
  { id: "01", section: "parcours", title: "Vous vous parlez où ?", route: "/commencer", ref: "01-vous-vous-parlez-ou" },
  { id: "02", section: "parcours", title: "Exporter", state: "WhatsApp", route: "/importer/export?app=whatsapp", ref: "02-exporter" },
  {
    id: "02b",
    section: "parcours",
    title: "Exporter",
    state: "iMessage",
    route: "/importer/export?app=imessage",
    note: "iMessage ne s’exporte pas\u00a0: l’adresse montre l’enregistrement de l’écran («\u00a0Filme ta conv.\u00a0»), là où mène la tuile iMessage. Absent des maquettes, à valider.",
  },
  {
    id: "03",
    section: "parcours",
    title: "Captures",
    state: "Avant sélection",
    route: "/importer/captures?app=instagram",
    note: "Zone d’ajout absente des maquettes (remplace les vignettes d’exemple).",
  },
  { id: "03b", section: "parcours", title: "Captures", state: "4 captures choisies", route: "/importer/captures?app=instagram", steps: pickCaptures, ref: "03-captures" },
  { id: "04", section: "parcours", title: "Ta conv est ajoutée", route: "/importer/ok", compte: "brouillon", journey: EXPORT, ref: "04-conv-ajoutee" },
  {
    id: "05",
    section: "parcours",
    title: "Votre histoire réunie",
    route: "/importer/histoire",
    compte: "brouillon",
    journey: { ...EXPORT, capturesAdded: true },
    ref: "05-histoire-reunie",
    note: "En production, rien ne mène encore ici\u00a0: le serveur refuse d’ajouter des captures à un export (l’écran se montre donc avec la seule conv importée).",
  },
  { id: "06", section: "parcours", title: "Qui est qui", state: "Avant les choix", route: "/qui", compte: "brouillon", journey: EXPORT },
  { id: "06b", section: "parcours", title: "Qui est qui", state: "Choix faits", route: "/qui", compte: "brouillon", journey: J, ref: "06-qui-est-qui" },
  {
    id: "C06",
    section: "parcours",
    title: "Qui est qui",
    state: "En couple",
    route: "/qui",
    compte: "brouillon",
    journey: JC,
    note: "«\u00a0En couple\u00a0» à côté de «\u00a0On se parle / On s’est vus / C’est flou\u00a0». Les objectifs changent alors\u00a0: «\u00a0Que ça aille mieux\u00a0», «\u00a0Savoir où on en est\u00a0», «\u00a0Juste comprendre\u00a0». Textes à valider.",
  },
  { id: "07", section: "parcours", title: "Email", state: "Champ vide", route: "/email", compte: "brouillon", journey: J, ref: "07-email" },
  {
    id: "07b",
    section: "parcours",
    title: "Email",
    state: "Email incomplet",
    route: "/email",
    compte: "brouillon",
    journey: J,
    steps: async (page) => {
      await page.getByLabel("Ton email").fill("noe@mail");
      await page.getByLabel("Ton email").blur();
      await page.waitForTimeout(400);
    },
    note: "Message d’erreur absent des maquettes, à valider.",
  },
  {
    id: "07c",
    section: "parcours",
    title: "Ton code",
    state: "Saisie",
    route: "/email/code",
    compte: "code",
    journey: J,
    note: "Le code reçu par email (pas de mot de passe). Textes à valider.",
  },
  {
    id: "07d",
    section: "parcours",
    title: "Ton code",
    state: "Code faux",
    route: "/email/code",
    compte: "code",
    journey: J,
    steps: async (page, { codeFaux }) => {
      await page.getByLabel("Code à 6 chiffres reçu par email").fill(codeFaux);
      await page.waitForTimeout(1300);
    },
    changement: "Un vrai code est demandé au serveur, puis un autre code est saisi\u00a0: c’est le serveur qui le refuse.",
  },
  {
    id: "08",
    section: "parcours",
    title: "Analyse",
    state: "En cours",
    route: "/lecture",
    compte: "lecture-en-cours",
    motion: true,
    wait: 250,
    note: "La bulle écrit au centre d’un anneau qui se remplit, à la place de la fenêtre de conv (écart à la maquette).",
    changement: "La lecture est figée à mi-chemin dans la base (le modèle factice lit en un instant).",
  },
  {
    id: "08b",
    section: "parcours",
    title: "Analyse",
    state: "Terminée",
    route: "/lecture",
    compte: "gratuit",
    wait: 2200,
    ref: "08-lecture",
    note: "À la fin, la gerbe remplace la fenêtre de lecture (écart à la maquette).",
  },

  /* ———— Rapport ———— */
  {
    id: "V1",
    section: "rapport",
    title: "Révélation du verdict",
    state: "Les chiffres",
    route: "/rapport/verdict",
    compte: "gratuit",
    sheet: true,
    note: "Juste après l’analyse, «\u00a0Voir mon rapport\u00a0» ouvre une scène sombre, une carte à la fois, comme des stories. Toucher à droite ou glisser pour avancer, «\u00a0Passer\u00a0» pour aller droit au rapport. Un compte gratuit voit 4 cartes, tirées du chapitre offert. Ici\u00a0: le nombre de messages défile jusqu’au vrai total. Textes à valider.",
  },
  {
    id: "V2",
    section: "rapport",
    title: "Révélation du verdict",
    state: "Le verdict",
    route: "/rapport/verdict",
    compte: "gratuit",
    sheet: true,
    steps: suivant(1),
    note: "L’emoji tombe et rebondit, les perles jaillissent, le titre arrive mot par mot, puis la phrase et la confiance (figé ici).",
  },
  {
    id: "V3",
    section: "rapport",
    title: "Révélation du verdict",
    state: "Entre vous deux",
    route: "/rapport/verdict",
    compte: "gratuit",
    sheet: true,
    steps: suivant(2),
    note: "Qui fait quoi\u00a0: les barres se remplissent une à une, puis ce que ça veut dire.",
  },
  {
    id: "V5",
    section: "rapport",
    title: "Révélation du verdict",
    state: "À toi de jouer",
    route: "/rapport/verdict",
    compte: "gratuit",
    sheet: true,
    steps: suivant(3),
    note: "La dernière carte d’un compte gratuit\u00a0: «\u00a0Voir mon rapport\u00a0» (le rapport habituel) et «\u00a0Partager mon verdict\u00a0» (prénoms masqués).",
    changement: "La 4e carte d’un compte gratuit (la 5e est pour les comptes payants, en VP5).",
  },
  {
    id: "09",
    section: "rapport",
    title: "Rapport, aperçu gratuit",
    state: "Page entière",
    route: "/rapport",
    compte: "gratuit",
    full: true,
    ref: "09-rapport-apercu-gratuit",
    changement: "Le bas de l’aperçu au dessin du prototype des bulles (PiedGratuit)\u00a0: «\u00a0Lire la suite · 9,90\u00a0€\u00a0» et les 10 bulles offertes.",
  },
  {
    id: "09q",
    section: "rapport",
    title: "Rapport, aperçu gratuit",
    state: "C’est quoi une bulle\u00a0?",
    route: "/rapport",
    compte: "gratuit",
    sheet: true,
    steps: click(/^10 bulles offertes avec ton rapport/),
    note: "Ouverte de la ligne rose du bas de l’aperçu\u00a0: «\u00a0Compris\u00a0» la ferme.",
  },
  {
    id: "10",
    section: "rapport",
    title: "Paiement",
    state: "Ta formule, Premium choisie d’avance",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    wait: 900,
    ref: "10-paiement",
    note: "La case de renonciation (que le prototype n’avait pas) sous «\u00a0C’est quoi une bulle\u00a0?\u00a0». Sur un écran court (375 × 667), les marges de Premium se resserrent pour que la feuille tienne sans défiler.",
    changement: "La feuille «\u00a0Ta formule\u00a0» du prototype des bulles remplace l’ancien paiement, partout où il s’ouvre.",
  },
  {
    id: "10r",
    section: "rapport",
    title: "Paiement",
    state: "Ta formule, le rapport seul",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    wait: 900,
    steps: click(/^Le rapport/, { role: "radio" }),
  },
  {
    id: "10o",
    section: "rapport",
    title: "Paiement",
    state: "L’offre ①, la feuille fermée sans payer",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    wait: 900,
    steps: async (page) => {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: /^Ta suite à/ }).waitFor();
      await page.waitForTimeout(900);
    },
    note: "Le compte à rebours part de l’heure de fin donnée par le serveur (5 minutes)\u00a0; la case de renonciation, que le prototype n’avait pas, au-dessus de «\u00a0Je la prends\u00a0».",
    changement: "Au dessin du prototype\u00a0: le logo, «\u00a0attends…\u00a0», la barre qui se vide.",
  },
  {
    id: "10b",
    section: "rapport",
    title: "Paiement réussi",
    state: "Le rapport seul, et l’offre ③",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    steps: payerLaFormule(/^Le rapport/),
    note: "Payé au faux Whop. Animé (la gerbe). L’offre ③ prend la place de la liste et du bouton du bas\u00a0; la case de renonciation, que le prototype n’avait pas, au-dessus de «\u00a0Ajouter 80 bulles\u00a0».",
    changement: "Au dessin du prototype\u00a0: les bulles reçues, l’offre ③ et ses perles. Sans la ligne du prix, absente du prototype.",
  },
  {
    id: "10c",
    section: "rapport",
    title: "Paiement réussi",
    state: "Premium",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    steps: payerLaFormule(/^Rapport \+ 60 bulles/),
    note: "Payé au faux Whop. Animé (la gerbe). Les bulles reçues dans l’anneau rose de leur perle.",
  },
  {
    id: "10w",
    section: "rapport",
    title: "Retour du paiement",
    state: "L’attente",
    route: "/paiement/retour?achat=00000000-0000-4000-8000-000000000000",
    compte: "gratuit",
    sheet: true,
    retenir: { chemin: "/api/paiement/*", methode: "GET" },
    note: "Le webhook n’est pas encore là\u00a0: l’achat se relit chaque seconde (une minute, puis «\u00a0met du temps\u00a0»). Textes nouveaux, sans maquette.",
  },
  {
    id: "10x",
    section: "rapport",
    title: "Retour du paiement",
    state: "Refusé",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    steps: retourDuFauxWhop("Refuser"),
    note: "«\u00a0Réessayer\u00a0» rouvre «\u00a0Ta formule\u00a0». Textes nouveaux, sans maquette.",
  },
  {
    id: "10y",
    section: "rapport",
    title: "Retour du paiement",
    state: "Annulé chez Whop",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    steps: retourDuFauxWhop("Annuler"),
    note: "Revenu de la page de Whop sans payer (status=canceled). Textes nouveaux, sans maquette.",
  },
  {
    id: "10z",
    section: "rapport",
    title: "Retour du paiement",
    state: "Des bulles reçues",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    sheet: true,
    steps: async (page) => {
      /* Pas d’écran de recharge dans ce lot : la commande de la feuille, la case cochée, part en pack (sa version de la case est celle de l’écran) */
      await page.route("**/api/paiement", (route) => route.continue({ postData: JSON.stringify({ ...JSON.parse(route.request().postData() ?? "{}"), offre: "pack80" }) }));
      const feuille = page.getByRole("dialog");
      await feuille.getByRole("checkbox").check();
      await feuille.getByRole("button", { name: /^Débloquer/ }).click();
      await page.getByRole("button", { name: "Payer", exact: true }).click();
      await page.getByRole("heading", { level: 1, name: /bulles$/ }).waitFor();
      await page.waitForTimeout(500);
    },
    note: "Un pack payé\u00a0: les bulles se disent un instant, puis on revient là où le paiement a commencé (le chat). Textes nouveaux, sans maquette.",
  },
  {
    id: "VP1",
    section: "rapport",
    title: "Révélation du verdict, rapport ouvert",
    state: "Les chiffres",
    route: "/rapport/verdict",
    compte: "equipe",
    sheet: true,
    note: "Un compte payant voit 5 cartes\u00a0: «\u00a0le moment\u00a0» et «\u00a0à toi de jouer\u00a0» viennent du chapitre 2.",
    changement:
      "Nouvelle série\u00a0: la révélation d’un rapport ouvert, avec les chapitres 1 et 2 tels que les écrit le vrai modèle (le modèle factice n’y met qu’une accroche, un récit et une chute).",
  },
  {
    id: "VP2",
    section: "rapport",
    title: "Révélation du verdict, rapport ouvert",
    state: "Le verdict",
    route: "/rapport/verdict",
    compte: "equipe",
    sheet: true,
    steps: suivant(1),
  },
  {
    id: "VP3",
    section: "rapport",
    title: "Révélation du verdict, rapport ouvert",
    state: "Entre vous deux",
    route: "/rapport/verdict",
    compte: "equipe",
    sheet: true,
    steps: suivant(2),
  },
  {
    id: "VP4",
    section: "rapport",
    title: "Révélation du verdict, rapport ouvert",
    state: "Le moment où tout a basculé",
    route: "/rapport/verdict",
    compte: "equipe",
    sheet: true,
    steps: suivant(3),
    note: "La scène rejouée\u00a0: elle écrit (les trois points), sa bulle arrive, puis ta réponse.",
  },
  {
    id: "VP5",
    section: "rapport",
    title: "Révélation du verdict, rapport ouvert",
    state: "À toi de jouer",
    route: "/rapport/verdict",
    compte: "equipe",
    sheet: true,
    steps: suivant(4),
    note: "Ton prochain pas (tiré du chapitre 2), puis «\u00a0Voir mon rapport\u00a0» et «\u00a0Partager mon verdict\u00a0».",
  },
  {
    id: "11",
    section: "rapport",
    title: "Rapport complet",
    state: "Page entière",
    route: "/rapport",
    compte: "rapport",
    full: true,
    ref: "11-rapport-complet",
    changement:
      "Le rapport du modèle factice («\u00a0Assieds-toi.\u00a0», «\u00a0Et voilà.\u00a0»), sauf les chapitres 1 et 2, réécrits comme le vrai modèle les écrit (ce que ça veut dire, la confiance, la scène, le prochain pas).",
  },
  {
    id: "11b",
    section: "rapport",
    title: "Rapport complet",
    state: "En lisant",
    route: "/rapport",
    compte: "rapport",
    sheet: true,
    steps: async (page) => {
      await page.evaluate(() => document.getElementById("chapitre-5")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
    },
    note: "Mobile\u00a0: la barre garde le chapitre en cours et la progression. Desktop\u00a0: le sommaire suit la lecture.",
  },
  {
    id: "11c",
    section: "rapport",
    title: "Rapport complet",
    state: "Sommaire",
    route: "/rapport",
    compte: "rapport",
    sheet: true,
    only: "m",
    steps: async (page) => {
      await page.evaluate(() => document.getElementById("chapitre-3")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Sommaire du rapport" }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    id: "11d",
    section: "rapport",
    title: "Rapport complet",
    state: "Reprendre",
    route: "/rapport",
    compte: "rapport",
    sheet: true,
    reprise: 5,
    wait: 900,
    note: "Au retour, on propose de reprendre là où tu t’étais arrêté (sans sauter tout seul).",
    changement: "La reprise est posée sous la clé que lit le rapport (src/state/cles.ts)\u00a0: la proposition s’affiche de nouveau.",
  },
  {
    id: "12p",
    section: "rapport",
    title: "Ta question",
    state: "Les idées",
    route: "/rapport/question",
    compte: "rapport",
    note: "La question en conversation avec BLUSH. BLUSH t’accueille, propose des questions tirées du rapport (celles de sa mémoire), comme des réponses toutes prêtes. Une réponse du chat comme une autre. Textes à valider.",
  },
  {
    id: "12q",
    section: "rapport",
    title: "Ta question",
    state: "Idée choisie",
    route: "/rapport/question",
    compte: "rapport",
    steps: premiereIdee,
    note: "Un toucher met la question dans le champ, sans l’envoyer\u00a0: la question ne part pas par erreur. On peut la modifier, ou retoucher l’idée pour la retirer.",
  },
  {
    id: "12r",
    section: "rapport",
    title: "Ta question",
    state: "BLUSH écrit",
    route: "/rapport/question",
    compte: "rapport",
    motion: true,
    retenir: { chemin: "/api/chat" },
    steps: async (page) => {
      await premiereIdee(page);
      await click("Poser ma question", { wait: 1100 })(page);
    },
    note: "Ta question part en bulle bleue\u00a0; BLUSH écrit (sa bulle et la grande bulle du haut s’animent).",
    changement: "La question est retenue avant le serveur, le temps de la capture.",
  },
  {
    id: "12s",
    section: "rapport",
    title: "Ta question",
    state: "La réponse",
    route: "/rapport/question",
    compte: "rapport",
    full: true,
    steps: async (page) => {
      await premiereIdee(page);
      await reponseDeBlush(page, () => page.getByRole("button", { name: "Poser ma question" }).first().click());
    },
    note: "Le rapport débloqué\u00a0: la question passe par le chat, et la réponse arrive en bulles, preuve et confiance comprises.",
    changement: "La question est vraiment posée au serveur (la démo inventait une réponse).",
  },
  {
    id: "18",
    section: "rapport",
    title: "Mode sobre, le verdict",
    route: "/rapport",
    compte: "sobre",
    ref: "18-sobre-verdict-difficile",
    changement: "Le mode sobre ne vient plus que d’une alerte (danger) dans la conv, pas d’un verdict difficile.",
  },
  {
    id: "19",
    section: "rapport",
    title: "Mode sobre, passer à autre chose",
    route: "/rapport",
    compte: "sobre",
    steps: click("Et maintenant ?"),
    ref: "19-sobre-passer-a-autre-chose",
  },
  {
    id: "18b",
    section: "rapport",
    title: "Mode sobre",
    state: "Besoin d’en parler",
    route: "/rapport",
    compte: "sobre",
    steps: click("Besoin d’en parler à quelqu’un ?"),
    sheet: true,
    note: "Ressources d’aide à valider.",
  },

  /* ———— Au quotidien ———— */
  {
    id: "13",
    section: "quotidien",
    title: "Accueil",
    state: "Le chat",
    route: "/app",
    compte: "equipe",
    ref: "13-accueil",
    note: "L’accueil est le chat avec BLUSH\u00a0; le rapport et sa fiche passent dans les détails du contact (écart à la maquette). En haut, BLUSH en grand comme un personnage\u00a0: un toucher ouvre «\u00a0Ce que BLUSH voit\u00a0». À droite, Maëlys comme un contact (l’anneau de votre niveau, le verdict en badge)\u00a0: un toucher ouvre sa fiche. Au-dessus du champ, les questions toutes prêtes (celles de sa mémoire), en un toucher.",
    changement: "Le compteur de bulles, à côté du bouton du compte\u00a0: «\u00a0∞\u00a0» pour l’équipe (illimitées\u00a0; un compte qui paie\u00a0: 13k à 13p).",
  },
  {
    id: "13b",
    section: "quotidien",
    title: "Accueil",
    state: "Après sa réponse",
    route: "/app",
    compte: "equipe",
    sheet: true,
    steps: ecrire(SA_REPONSE),
    note: "Sa réponse collée dans le chat\u00a0: BLUSH la lit et répond en bulles.",
    changement: "La vraie réponse du modèle factice (toujours la même).",
  },
  {
    id: "13c",
    section: "quotidien",
    title: "Accueil",
    state: "Menu « + »",
    route: "/app",
    compte: "equipe",
    steps: click("Ajouter des captures ou un export", { wait: 600 }),
    sheet: true,
  },
  {
    id: "13d",
    section: "quotidien",
    title: "Accueil",
    state: "Ce que BLUSH voit",
    route: "/app",
    compte: "equipe",
    steps: async (page) => {
      await page.locator("button[aria-haspopup=dialog]:visible").first().click();
      await page.waitForTimeout(800);
    },
    sheet: true,
  },
  {
    id: "13e",
    section: "quotidien",
    title: "Accueil",
    state: "Après « Copier »",
    route: "/app",
    compte: "equipe",
    sheet: true,
    ref: "14-son-message-et-ta-reponse",
    steps: async (page) => {
      await ecrire(QUOI_ENVOYER)(page);
      await page.getByRole("button", { name: "Copier", exact: true }).first().click();
      await page.waitForTimeout(900);
    },
    note: "Après «\u00a0Copier\u00a0», la coche «\u00a0Copié\u00a0» suffit.",
  },
  {
    id: "13f",
    section: "quotidien",
    title: "Accueil",
    state: "Vocal en cours",
    route: "/app",
    compte: "equipe",
    sheet: true,
    steps: async (page) => {
      await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
      await page.waitForTimeout(2600);
    },
    note: "Champ vide, le bouton noir à l’onde lance un vocal (le micro est demandé la première fois). Le point rouge, le temps, l’onde qui suit la voix\u00a0; la corbeille jette, la flèche envoie.",
  },
  {
    id: "13g",
    section: "quotidien",
    title: "Accueil",
    state: "Vocal envoyé",
    route: "/app",
    compte: "equipe",
    sheet: true,
    steps: async (page) => {
      await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
      await page.waitForTimeout(2200);
      await reponseDeBlush(page, () => page.getByRole("button", { name: "Envoyer le vocal" }).click());
    },
    note: "Le vocal se réécoute dans ta bulle\u00a0; BLUSH le transcrit, puis répond à ce qui est dit. Sans clé de transcription (MISTRAL_API_KEY), BLUSH répond que les vocaux arrivent bientôt. Textes à valider.",
    changement: "Le modèle factice «\u00a0entend\u00a0» toujours la même phrase, et y répond.",
  },
  {
    id: "13h",
    section: "quotidien",
    title: "Accueil",
    state: "BLUSH écrit",
    route: "/app",
    compte: "equipe",
    sheet: true,
    motion: true,
    retenir: { chemin: "/api/chat" },
    steps: ecrire(SA_REPONSE, 1480),
    note: "Quand BLUSH écrit, son logo arrive d’un bond dans la conv, respire, et ses trois perles s’allument l’une après l’autre, comme les trois points de Messages, en rose. La grande bulle du haut s’anime en même temps. À la réponse, la bulle se replie et la réponse monte.",
    changement: "Le message est retenu avant le serveur, le temps de la capture.",
  },
  {
    id: "13i",
    section: "quotidien",
    title: "Accueil",
    state: "Une question toute prête",
    route: "/app",
    compte: "equipe",
    sheet: true,
    steps: async (page) => {
      await reponseDeBlush(page, () => page.getByRole("group", { name: "Questions toutes prêtes" }).getByRole("button").first().click());
    },
    note: "Une question toute prête (tirée de sa mémoire) part en un toucher, comme si tu l’avais écrite, puis sort de la rangée. Textes à valider.",
    changement:
      "Les questions sont celles de la mémoire écrite par le modèle factice («\u00a0pourquoi elle vanne\u00a0?\u00a0», «\u00a0je relance trop\u00a0?\u00a0»…)\u00a0; «\u00a0On en est où\u00a0?\u00a0» venait de la démo.",
  },
  {
    id: "13j",
    section: "quotidien",
    title: "Accueil",
    state: "« Je lui envoie quoi ? »",
    route: "/app",
    compte: "equipe",
    sheet: true,
    steps: ecrire(QUOI_ENVOYER),
    note: "BLUSH lit la situation, puis propose la phrase à lui envoyer, à copier d’un geste, et pourquoi elle marche.",
    changement: "La vraie réponse du modèle factice à «\u00a0je lui envoie quoi\u00a0?\u00a0».",
  },
  /* Les bulles dans le chat (le prototype validé des bulles) : un compte qui paie, son rapport débloqué */
  {
    id: "13k",
    section: "quotidien",
    title: "Accueil",
    state: "Les bulles offertes",
    route: "/app",
    compte: "rapport",
    bulles: 10,
    sheet: true,
    note: "Le compteur de bulles à côté du bouton du compte, et sa première apparition expliquée au-dessus du champ (fermée, ou à la première réponse). «\u00a0comment ça marche\u00a0» ouvre «\u00a0C’est quoi une bulle\u00a0?\u00a0». Le dessin et les textes du prototype des bulles.",
  },
  {
    id: "13l",
    section: "quotidien",
    title: "Accueil",
    state: "Plus que 5 bulles",
    route: "/app",
    compte: "rapport",
    bulles: 6,
    sheet: true,
    steps: ecrire(SA_REPONSE),
    note: "«\u00a01 bulle · il t’en reste 5\u00a0» sous la réponse (ce que le serveur a débité), le compteur rose, et la carte à 5 bulles ou moins, avec «\u00a0Recharger\u00a0».",
  },
  {
    id: "13m",
    section: "quotidien",
    title: "Accueil",
    state: "Ta réponse est prête (0 bulle)",
    route: "/app",
    compte: "rapport",
    sheet: true,
    steps: ecrire(QUOI_ENVOYER),
    note: "À 0 bulle, BLUSH écrit quand même sa réponse, mais le serveur la garde\u00a0: floutée (des barres, jamais son texte), «\u00a0Recharger pour la lire\u00a0», et la carte «\u00a0Ta réponse à Maëlys est écrite\u00a0».",
  },
  {
    id: "13n",
    section: "quotidien",
    title: "Accueil",
    state: "La recharge (première fois)",
    route: "/app",
    compte: "rapport",
    sheet: true,
    steps: async (page) => {
      await ecrire(QUOI_ENVOYER)(page);
      await click("Recharger pour la lire", { wait: 1100 })(page);
    },
    note: "La recharge\u00a0: 30, 70 + 10 offertes (conseillé, choisi), 150 + 50 offertes. Le bonus de la première recharge (+40 sur le pack conseillé) quand le serveur le montre (une fois par compte, jamais le jour d’une autre offre unique). La case de renonciation avant de payer (absente du prototype, demandée par la loi). Payée, l’accueil lit la réponse prête et dit «\u00a0+120 bulles, ta réponse est là\u00a0».",
  },
  {
    id: "13o",
    section: "quotidien",
    title: "Accueil",
    state: "C’est quoi une bulle ? (le compteur)",
    route: "/app",
    compte: "rapport",
    bulles: 4,
    sheet: true,
    steps: async (page) => {
      await page
        .getByRole("button", { name: /^Tes bulles/ })
        .first()
        .click();
      await page.waitForTimeout(1100);
    },
    note: "Le compteur touché\u00a0: ce qu’est une bulle, ce que coûte chaque réponse, et «\u00a0Recharger · il t’en reste 4\u00a0».",
  },
  {
    id: "13p",
    section: "quotidien",
    title: "Accueil",
    state: "Tes bulles sont finies",
    route: "/app",
    compte: "rapport",
    sheet: true,
    note: "0 bulle, sans réponse qui attend (avant le premier message, ou après un achat repris)\u00a0: la carte «\u00a0Tes bulles sont finies\u00a0», «\u00a0BLUSH garde tout en mémoire.\u00a0» et «\u00a0Recharger\u00a0». Un message envoyé s’écrit quand même, flouté (13m).",
  },
  {
    id: "16",
    section: "quotidien",
    title: "Sa fiche",
    route: "/app/fiche",
    compte: "equipe",
    ref: "16-sa-fiche",
    note: "Un seul geste pour la remplir, «\u00a0Complète sa fiche\u00a0» (des captures ou un export\u00a0; sur ordinateur, on peut aussi les glisser sur la page). BLUSH trouve les infos et les range lui-même, chacune avec sa source. Rubrique «\u00a0À savoir\u00a0» pour ce qu’il trouve\u00a0; «\u00a0Tes notes\u00a0» restent les tiennes. Textes à valider.",
  },
  {
    id: "16b",
    section: "quotidien",
    title: "Sa fiche",
    state: "Modifier",
    route: "/app/fiche",
    compte: "equipe",
    steps: click("Modifier", { exact: true }),
    note: "Retirer une info fausse, ou ajouter la tienne dans une rubrique.",
  },
  {
    id: "16c",
    section: "quotidien",
    title: "Sa fiche",
    state: "BLUSH analyse",
    route: "/app/fiche",
    compte: "equipe",
    motion: true,
    retenir: { chemin: "/api/fiche" },
    steps: (page) => addBio(page, 1000),
    note: "Pendant l’analyse, la bulle de BLUSH écrit et un trait rose balaie la capture.",
    changement: "La capture est retenue avant le serveur, le temps de la capture.",
  },
  {
    id: "16d",
    section: "quotidien",
    title: "Sa fiche",
    state: "Infos rangées",
    route: "/app/fiche",
    compte: "equipe",
    full: true,
    steps: (page) => addBio(page),
    note: "Ce que BLUSH a trouvé et où il l’a rangé\u00a0; ce qu’il savait déjà n’est pas doublé. Les nouvelles infos portent un point rose (et s’éclairent en rose à leur arrivée). «\u00a0Annuler\u00a0» retire tout.",
    changement: "Ce que le modèle factice lit dans toute capture\u00a0: «\u00a0Étudiante en droit à Lyon\u00a0» (son profil), puis «\u00a0Adore les soirées improvisées\u00a0».",
  },
  { id: "20", section: "quotidien", title: "Mon compte", route: "/compte", compte: "equipe", ref: "20-mon-compte" },
  {
    id: "20e",
    section: "quotidien",
    title: "Mon compte",
    state: "Tes bulles et Tes achats",
    route: "/compte",
    compte: "rapport",
    bulles: 10,
    full: true,
    steps: async (page) => {
      /* Une recharge de 30 bulles, payée au faux Whop depuis Mon compte, qui y revient */
      await click("Recharger 30, 80 ou 200 bulles")(page);
      const feuille = page.getByRole("dialog");
      await feuille.getByRole("radio", { name: /^30 bulles/ }).click();
      await feuille.getByRole("checkbox").check();
      await feuille.getByRole("button", { name: /^Payer/ }).click();
      await page.getByRole("button", { name: "Payer", exact: true }).click();
      await page.waitForURL((u) => u.pathname === "/compte");
      await page.waitForTimeout(1200);
    },
    note: "«\u00a0Tes bulles\u00a0»\u00a0: le solde, «\u00a0Recharger\u00a0» (la recharge revient ici une fois payée) et «\u00a0C’est quoi une bulle\u00a0?\u00a0». «\u00a0Tes achats\u00a0»\u00a0: le jour, l’offre, les bulles reçues, le montant et son état (payé, remboursé, contesté). Sans maquette\u00a0: textes à valider.",
  },
  {
    id: "20b",
    section: "quotidien",
    title: "Mon compte",
    state: "Supprimer l’histoire",
    route: "/compte",
    compte: "equipe",
    steps: click("Supprimer l’histoire avec Maëlys"),
    sheet: true,
    note: "Confirmation absente des maquettes.",
  },
  {
    id: "20c",
    section: "quotidien",
    title: "Mon compte",
    state: "Se déconnecter",
    route: "/compte",
    compte: "equipe",
    steps: click("Se déconnecter Sur cet appareil"),
    sheet: true,
    note: "Confirmation absente des maquettes. Textes à valider.",
  },
  {
    id: "20d",
    section: "quotidien",
    title: "Mon compte",
    state: "Se déconnecter de tous les appareils",
    route: "/compte",
    compte: "equipe",
    steps: click("Se déconnecter de tous les appareils"),
    sheet: true,
    note: "Confirmation absente des maquettes. Textes à valider.",
  },

  /* ———— Plusieurs convs ———— */
  {
    id: "M1",
    section: "convs",
    title: "Tes convs",
    state: "La liste",
    route: "/app/convs",
    compte: "plusieurs",
    note: "Quand le compte a plusieurs convs, une liste comme dans Messages. Pour chaque personne\u00a0: l’anneau de votre niveau et le verdict en badge (comme sur l’accueil), le verdict, la tendance, et quand BLUSH en a parlé pour la dernière fois. Un toucher ouvre sa conv, qui s’ouvrira aussi la fois suivante. «\u00a0Mon compte\u00a0» passe ici, en haut à gauche. En bas, «\u00a0Analyser une autre conv\u00a0». Textes à valider.",
    changement: "Un vrai compte avec trois convs lues (Maëlys, Romane, Inès, fictives).",
  },
  {
    id: "M2",
    section: "convs",
    title: "Accueil",
    state: "Avec plusieurs convs",
    route: "/app",
    compte: "plusieurs",
    note: "En haut à gauche, à la place de «\u00a0Mon compte\u00a0»\u00a0: le retour à «\u00a0Tes convs\u00a0», avec les autres personnes en petit (deux au plus, puis «\u00a0+n\u00a0»). Sur ordinateur, il prend la place de «\u00a0Ton rapport\u00a0» dans la barre de la fenêtre (le rapport reste dans «\u00a0Ce que BLUSH voit\u00a0»). Avec une seule conv, rien ne change.",
  },
  {
    id: "M3",
    section: "convs",
    title: "Accueil",
    state: "Inès choisie",
    route: "/app/convs",
    compte: "plusieurs",
    sheet: true,
    steps: async (page) => {
      await page.getByRole("link", { name: /^Inès/ }).first().click();
      await page.waitForURL("**/app");
      await page.waitForTimeout(1600);
    },
    note: "Inès choisie dans la liste\u00a0: son accueil arrive par la droite, avec son verdict et son prochain pas\u00a0; le retour en haut à gauche montre les deux autres.",
  },

  /* ———— En couple ———— */
  {
    id: "C13",
    section: "couple",
    title: "Accueil",
    state: "Le chat",
    route: "/app",
    compte: "couple",
    note: "En couple, l’anneau de Maëlys suit la température (On s’éloigne, Ça coince, Ça va, On est soudés) au lieu des étapes\u00a0: ici, «\u00a0Ça coince\u00a0».",
    changement: "Le vrai back-end, et le niveau du verdict posé à «\u00a0Ça coince\u00a0» dans la base\u00a0: le modèle factice n’écrit jamais de température.",
  },
  {
    id: "C13d",
    section: "couple",
    title: "Accueil",
    state: "Ce que BLUSH voit",
    route: "/app",
    compte: "couple",
    sheet: true,
    steps: async (page) => {
      await page.locator("button[aria-haspopup=dialog]:visible").first().click();
      await page.waitForTimeout(800);
    },
    note: "La température remplace les étapes\u00a0: pas de coche ni de cadenas, juste où vous êtes.",
  },

  /* ———— États ———— */
  {
    id: "E1",
    section: "etats",
    title: "Le paiement par-dessus",
    state: "Le rapport pas débloqué, sur l’accueil",
    route: "/app",
    compte: "gratuit",
    sheet: true,
    wait: 1000,
    note: "Panneau absent des maquettes.",
  },
  /* Les erreurs de l’import, sur l’écran qui les pose (l’export ou les captures) : leurs textes et leurs liens en dépendent */
  {
    id: "E2",
    section: "etats",
    title: "Erreur",
    state: "Fichier illisible",
    route: "/importer/export?app=whatsapp&erreur=fichier",
    changement: "Sur l’écran de l’export, qui pose cette erreur (avant\u00a0: sur /importer/ok).",
  },
  {
    id: "E3",
    section: "etats",
    title: "Erreur",
    state: "Conversation de groupe",
    route: "/importer/export?app=whatsapp&erreur=groupe",
    changement: "Sur l’écran de l’export, qui pose cette erreur (avant\u00a0: sur /importer/ok).",
  },
  {
    id: "E4",
    section: "etats",
    title: "Erreur",
    state: "Export trop court",
    route: "/importer/export?app=whatsapp&erreur=courte",
    changement: "Sur l’écran de l’export, qui pose cette erreur (avant\u00a0: sur /importer/ok, avec un texte qui ne s’affiche jamais).",
  },
  {
    id: "E4b",
    section: "etats",
    title: "Erreur",
    state: "Captures trop courtes",
    route: "/importer/captures?app=instagram&erreur=courte",
    changement: "Nouveau\u00a0: sur des captures, la conv trop courte a son propre texte (20 messages suffisent).",
  },
  {
    id: "E5",
    section: "etats",
    title: "Erreur",
    state: "Échec de la lecture",
    route: "/importer/ok?erreur=lecture",
    compte: "brouillon",
    note: "Aucun écran ne pose plus cette erreur (l’échec de la lecture se dit sur /lecture)\u00a0: on n’y arrive qu’en tapant l’adresse. À garder ou à retirer.",
  },
  {
    id: "E6",
    section: "etats",
    title: "Erreur",
    state: "Capture illisible",
    route: "/importer/captures?app=instagram&erreur=capture",
    changement: "Sur l’écran des captures, qui pose cette erreur (avant\u00a0: sur /importer/ok).",
  },
  {
    id: "E7",
    section: "etats",
    title: "Erreur",
    state: "Vidéo illisible",
    route: "/importer/captures?app=imessage&erreur=video",
    changement: "Nouveau\u00a0: l’erreur d’un enregistrement d’écran illisible.",
  },
  {
    id: "E8",
    section: "etats",
    title: "Erreur",
    state: "Enregistrement trop long",
    route: "/importer/captures?app=imessage&erreur=longue",
    changement: "Nouveau\u00a0: l’erreur d’un enregistrement d’écran trop long.",
  },
  {
    id: "H1",
    section: "etats",
    title: "Survol",
    state: "Tuile d’appli (iMessage)",
    route: "/commencer",
    hover: 'a[href="/importer/captures?app=imessage"]',
    only: "d",
    changement: "La tuile iMessage mène à l’enregistrement de l’écran (le survol visait l’ancienne adresse, celle de l’export).",
  },
  {
    id: "H2",
    section: "etats",
    title: "Survol",
    state: "Tuile de choix",
    route: "/qui",
    compte: "brouillon",
    journey: J,
    hover: { role: "radio", name: "On s’est vus" },
    only: "d",
  },
  {
    id: "H3",
    section: "etats",
    title: "Survol",
    state: "Offre du paiement",
    route: "/rapport?paiement=1",
    compte: "gratuit",
    hover: { role: "radio", name: /^Le rapport/ },
    sheet: true,
    wait: 900,
    only: "d",
  },
  {
    id: "H5",
    section: "etats",
    title: "Survol",
    state: "Bouton principal",
    route: "/importer/ok",
    compte: "brouillon",
    journey: EXPORT,
    hover: { role: "link", name: /Continuer/ },
    only: "d",
  },

  /* ———— L’équipe et les relances ———— */
  {
    id: "A1",
    section: "equipe",
    title: "Tableau de bord",
    state: "L’argent et les gestes de l’équipe",
    route: "/apercu/admin",
    full: true,
    note: "Les chiffres sont ceux de l’aperçu (/apercu/admin)\u00a0; la vraie page (/admin) est réservée à BLUSH_ADMINS. Nouveaux\u00a0: les ventes et les bulles (aujourd’hui, 7 jours), l’entonnoir des achats, les offres uniques, les derniers gestes, et les trois gestes (des bulles, un rapport offert, des invitations). Textes à valider.",
    changement: "Nouveau\u00a0: l’argent, l’entonnoir, les offres uniques et les gestes de l’équipe.",
  },
  {
    id: "A2",
    section: "equipe",
    title: "Tableau de bord",
    state: "Un geste fait",
    route: "/apercu/admin",
    only: "d",
    steps: async (page) => {
      /* L’aperçu n’a pas de session : le geste répond comme à un inconnu, et l’écran dit l’échec */
      const bulles = page.getByRole("form", { name: "Donner des bulles" });
      await bulles.getByLabel("Email du compte").fill("ami@exemple.fr");
      await bulles.getByRole("button", { name: "Donner" }).click();
      await bulles.getByRole("status").filter({ hasText: /./ }).waitFor();
      await bulles.scrollIntoViewIfNeeded();
    },
    note: "Dans l’aperçu, sans session, le geste est refusé\u00a0: on voit où s’écrit sa réponse (le message, annoncé aux lecteurs d’écran). Textes à valider.",
  },
  {
    id: "R1",
    section: "equipe",
    title: "Mail de relance",
    state: "«\u00a0Ta suite t’attend\u00a0»",
    route: "/apercu/mail?type=relance",
    full: true,
    note: "Deux heures après une feuille de paiement fermée sans payer (une fois par compte). Ni prénom, ni rien de la conv. Texte à valider (et par un juriste\u00a0: la prospection).",
    changement: "Nouveau.",
  },
  {
    id: "R2",
    section: "equipe",
    title: "Désinscription",
    state: "La question",
    route: "/desinscription?id=exemple&cle=exemple",
    note: "Le lien du pied de la relance. Un bouton plutôt que le lien seul (les messageries ouvrent les liens pour les vérifier). Textes à valider.",
    changement: "Nouveau.",
  },
  {
    id: "R3",
    section: "equipe",
    title: "Désinscription",
    state: "Un lien qui ne marche pas",
    route: "/desinscription",
    changement: "Nouveau.",
  },

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
