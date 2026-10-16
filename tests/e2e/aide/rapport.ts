import { expect, type Locator, type Page } from "@playwright/test";
import { FACTICE } from "../../../src/server/ia/factice-valeurs";
import { CLE_REPRISE } from "../../../src/state/cles";
import { chiffrer, dechiffrer, derniereHistoire, histoiresDe, sql } from "./base";
import { pagePrete } from "./page";

/*
 * Les aides du verdict et du rapport : la révélation du verdict en cartes (/rapport/verdict), puis le rapport, où l’on se
 * déplace comme un lecteur, avec le sommaire (à gauche sur ordinateur, dans une feuille sur téléphone).
 */

/* ———— La révélation du verdict (/rapport/verdict) ———— */

/** La carte affichée, par son titre : chacun commence par « Étape N sur M : » (dit aux lecteurs d’écran seulement). */
export const carteDuVerdict = (page: Page, n: number, sur: number, titre: string) => page.getByRole("heading", { name: `Étape ${n} sur ${sur} : ${titre}` });

/**
 * La scène du verdict prête : « Voir mon rapport » y mène en rechargeant toute la page (window.location), on attend donc
 * qu’elle soit vivante, puis sa première carte, et son compteur arrivé au nombre de messages (il défile dans le
 * navigateur). Les flèches du clavier et les touchers répondent alors. `sur` : le nombre de cartes (4 pour un compte gratuit).
 */
export async function attendreLaScene(page: Page, messages: number, sur = 4): Promise<void> {
  await expect(page).toHaveURL(/\/rapport\/verdict$/);
  await pagePrete(page);
  await expect(carteDuVerdict(page, 1, sur, `${messages} messages, du premier au dernier.`)).toBeVisible();
  await expect(page.getByRole("main").getByText(String(messages), { exact: true })).toBeVisible();
}

/**
 * Un toucher sur la scène, loin des boutons (à mi-hauteur) : à gauche (le premier tiers) on recule, ailleurs on avance
 * (src/app/rapport/verdict/VerdictReveal.tsx, onTap).
 */
export async function toucherLaScene(page: Page, cote: "gauche" | "droite"): Promise<void> {
  const { width, height } = page.viewportSize()!;
  await page.getByRole("main").click({ position: { x: Math.round(width * (cote === "gauche" ? 0.1 : 0.85)), y: Math.round(height * 0.45) } });
}

/* ———— Le rapport (/rapport) ———— */

/**
 * Les sept chapitres fermés d’un rapport gratuit, dans l’ordre (2 à 8) : les titres que le verdict du modèle factice
 * écrit pour l’histoire de Noé et Maëlys (FACTICE.titres, lus là, jamais recopiés). Le rapport débloqué les garde.
 */
export const CHAPITRES_FERMES: string[] = Object.values(FACTICE.titres("Maëlys"));

/** Le titre du chapitre `n` (2 à 8) du rapport de Noé et Maëlys : celui que son verdict a écrit, fermé comme débloqué. */
export const titreDuChapitre = (n: number): string => {
  const titre = CHAPITRES_FERMES[n - 2];
  if (titre === undefined) throw new RangeError(`chapitre ${n} : pas de titre écrit par le verdict (2 à 8)`);
  return titre;
};

/**
 * Les titres d’attente des chapitres 2 à 8 (src/contenu/chapitres.ts, titreDAttente), le 5 au prénom de l’autre : ceux
 * d’un verdict sans titres, et du sommaire du mail « ton rapport est prêt ». Recopiés ici : les tests ne lisent pas la
 * source qu’ils vérifient.
 */
export const CHAPITRES_D_ATTENTE = ["Le moment où tout a basculé", "Votre histoire, en actes", "Ce qui coince", "Maëlys", "Toi", "Votre duo", "Ton prochain pas"];

/**
 * Le verdict de la dernière conv du compte, tel que l’appli le gardait avant le 13 octobre : sans les titres des
 * chapitres fermés (une conv lue avant eux, en production). Le rapport retombe alors sur leurs titres d’attente.
 */
export async function verdictDAvantLesTitres(email: string): Promise<void> {
  const [v] = await sql()<{ data: Uint8Array }[]>`select data from verdicts where story_id = ${derniereHistoire(email)}`;
  if (!v) throw new Error(`aucun verdict pour ${email}`);
  const donnees = dechiffrer<{ sortie: Record<string, unknown> }>(v.data);
  const avant = Object.fromEntries(Object.entries(donnees.sortie).filter(([champ]) => champ !== "titres"));
  await sql()`update verdicts set data = ${chiffrer({ ...donnees, sortie: avant })} where story_id = ${derniereHistoire(email)}`;
}

/** Un titre dans une expression régulière, tel quel. */
export const telQuel = (titre: string) => titre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Le titre du paiement, sur le rapport de Noé et Maëlys. */
export const PAIEMENT = "La suite parle de vous deux\u00a0: toi et Maëlys.";

/** Le titre de l’offre unique ① (la feuille du paiement fermée sans payer). */
export const OFFRE_SUITE = "Ta suite à −22\u00a0%";

/** L’écran est-il un ordinateur ? Le sommaire y est une colonne à gauche (à partir de 1024 px, le point lg de Tailwind). */
export const surOrdinateur = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Ouvre le rapport de la conv ouverte, et attend son titre (« Noé & Maëlys »). Renvoie la colonne du rapport (<main>). */
export async function ouvrirLeRapport(page: Page, adresse = "/rapport"): Promise<Locator> {
  await page.goto(adresse);
  const rapport = page.getByRole("main");
  await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  return rapport;
}

/**
 * Une feuille des bulles ou du paiement (« Ta formule », l’offre ①, « C’est quoi une bulle ? », la recharge), au dessin du
 * prototype des bulles sur ordinateur : son voile couvre tout l’écran, en-tête compris (pas de bande blanche au-dessus),
 * et son titre garde sa taille (`titre`, en px). Sur téléphone, rien de plus : la feuille y monte du bas, sur tout l’écran.
 */
export async function feuilleSurOrdinateur(page: Page, feuille: Locator, { titre }: { titre?: number } = {}): Promise<void> {
  if (!surOrdinateur(page)) return;
  const voile = await feuille.locator(":scope > div[aria-hidden='true']").boundingBox();
  expect(voile?.y, "le voile de la feuille couvre aussi l’en-tête").toBe(0);
  if (titre !== undefined) await expect(feuille.locator("h2").first()).toHaveCSS("font-size", `${titre}px`);
}

/** La police de l’appli (Nunito), pas celle des messages (Figtree) : la pile de polices que le navigateur a retenue. */
export const NUNITO = /^nunito/i;

/**
 * Ferme la feuille ouverte (le paiement, le sommaire, « Quelle conv ? ») comme on le fait : Échap sur ordinateur ; sur
 * téléphone, un toucher sur le voile, au-dessus de la feuille (elle monte du bas de l’écran, sans bouton pour la fermer).
 */
export async function fermerLaFeuille(page: Page): Promise<void> {
  if (surOrdinateur(page)) await page.keyboard.press("Escape");
  else await page.touchscreen.tap((page.viewportSize()?.width ?? 0) / 2, 24);
}

/**
 * Le sommaire, ouvert : sur ordinateur, la colonne de gauche (toujours là) ; sur téléphone, la feuille qu’ouvre le
 * bouton en haut à droite.
 */
async function ouvrirLeSommaire(page: Page): Promise<Locator> {
  if (surOrdinateur(page)) return page.getByRole("navigation", { name: "Sommaire" });
  await page.getByRole("button", { name: "Sommaire du rapport" }).click();
  const feuille = page.getByRole("dialog", { name: "Sommaire" });
  await expect(feuille).toBeVisible();
  return feuille;
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Attend que ce titre soit arrivé en haut de l’écran, dans son premier tiers (là où le rapport dit le chapitre « en
 * cours ») : le défilement a bien eu lieu, pas seulement un titre déjà à l’écran.
 */
export async function attendreEnHaut(page: Page, titre: Locator): Promise<void> {
  const tiers = (page.viewportSize()?.height ?? 0) / 3;
  await expect.poll(async () => (await titre.boundingBox())?.y ?? Infinity, { message: "le titre arrive en haut de l’écran" }).toBeLessThan(tiers);
}

/**
 * Note, dès le chargement de chaque page, jusqu’où elle a défilé (la fenêtre, ou une colonne qui défile) : de quoi
 * vérifier qu’une page n’a pas bougé toute seule. À appeler avant d’ouvrir la page. Renvoie de quoi lire le plus grand
 * défilement de la page affichée depuis son chargement.
 */
export async function suivreLeDefilement(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __defilementDuTest: number };
    w.__defilementDuTest = 0;
    addEventListener(
      "scroll",
      (e) => {
        const el = e.target instanceof Element ? e.target : document.scrollingElement;
        w.__defilementDuTest = Math.max(w.__defilementDuTest, scrollY, el?.scrollTop ?? 0);
      },
      { capture: true, passive: true },
    );
  });
  return () => page.evaluate(() => (window as unknown as { __defilementDuTest?: number }).__defilementDuTest ?? 0);
}

/** Le temps d’un défilement doux (un saut vers un chapitre) : ce qu’on regarde pour dire qu’une page n’a pas bougé. */
export const DEFILEMENT_DOUX = 1_000;

/**
 * Attend que le rapport dise ce chapitre « en cours » : sur ordinateur, le sommaire le surligne (aria-current) ; sur
 * téléphone, la barre du haut l’affiche (« 3/8 · Ch. 3 »).
 */
async function attendreChapitreEnCours(page: Page, numero: number, titre: string): Promise<void> {
  if (surOrdinateur(page))
    await expect(page.getByRole("navigation", { name: "Sommaire" }).getByRole("link", { name: titre, exact: true })).toHaveAttribute("aria-current", "location");
  else await expect(page.getByRole("banner").getByRole("button", { name: new RegExp(`${numero}/\\d+ · ${echapper(titre)}$`) })).toBeVisible();
}

/**
 * Va à un chapitre ouvert par le sommaire, comme un lecteur : le défilement fini, le chapitre est à l’écran et le rapport
 * le dit en cours (c’est lui qu’il retient pour « Reprendre ta lecture »). `titre` : son titre dans le sommaire (« Ch. 3 »
 * pour le modèle factice).
 */
export async function allerAuChapitre(page: Page, numero: number, titre: string): Promise<void> {
  const sommaire = await ouvrirLeSommaire(page);
  /* Sur ordinateur, un lien vers l’ancre du chapitre ; sur téléphone, une ligne de la feuille */
  await sommaire.getByRole(surOrdinateur(page) ? "link" : "button", { name: titre, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sommaire" })).toBeHidden();
  /* Le défilement est doux : on attend qu’il soit arrivé, pas seulement que le chapitre entre à l’écran */
  await attendreEnHaut(page, page.getByRole("main").getByRole("heading", { level: 2, name: new RegExp(`^Chapitre ${numero} : `) }));
  await attendreChapitreEnCours(page, numero, titre);
}

/**
 * Pose où la lecture du rapport de cette histoire s’était arrêtée (son chapitre), dans le navigateur, avant que le rapport
 * ne le lise : il propose alors d’y reprendre (src/app/rapport/useReprise.ts).
 */
export async function poserLaReprise(page: Page, histoire: string, chapitre: number): Promise<void> {
  await page.addInitScript(({ cle, histoire, chapitre }) => localStorage.setItem(cle, JSON.stringify({ [histoire]: chapitre })), { cle: CLE_REPRISE, histoire, chapitre });
}

type BlocEcrit = { kind: string; text?: string; level?: string; messages?: { from: "toi" | "elle"; text: string }[]; factsAfter?: string[] };

/**
 * Les rapports écrits du compte, tels que le vrai modèle les écrit (prompts/05-rapport.md) : le modèle factice n’y met
 * qu’une accroche, un récit et une chute. Au chapitre 2, `essentiel`, `vu` et `action` : la révélation du verdict d’un
 * compte payant montre alors ses cartes « le moment » et « à toi de jouer » (cardsOf, verdict/cartes.ts), et le rapport
 * les affiche. `chapitre1` : au chapitre 1 aussi, `sens` et `confiance` (ceux du verdict du modèle factice, comme pour
 * un compte gratuit). Les messages montrés sont ceux de la conv, que le rapport cite déjà.
 */
export async function rapportCommeLeVraiModele(email: string, { chapitre1 = false }: { chapitre1?: boolean } = {}): Promise<void> {
  let ecrits = 0;
  for (const { id } of await histoiresDe(email)) {
    const [r] = await sql()<{ data: Uint8Array | null }[]>`select data from reports where story_id = ${id}`;
    if (!r?.data) continue;
    const rapport = dechiffrer<{ chapitres: { number: number; blocks: BlocEcrit[] }[] }>(r.data);
    const cites = rapport.chapitres.flatMap((c) => c.blocks.flatMap((b) => b.messages ?? []));
    const [elle, toi] = [cites.find((m) => m.from === "elle"), cites.find((m) => m.from === "toi")];
    const [verdict, bascule] = [1, 2].map((n) => rapport.chapitres.find((c) => c.number === n));
    if (!verdict || !bascule || !elle || !toi) throw new Error("le rapport écrit n’a plus ses chapitres 1 et 2, ou ne cite plus la conv");
    if (chapitre1)
      verdict.blocks = [
        ...verdict.blocks.slice(0, -1),
        { kind: "meaning", text: "C’est flou parce que t’as esquivé." },
        { kind: "confidence", level: "probable", text: "7 preuves dans votre conv" },
        ...verdict.blocks.slice(-1),
      ];
    const [accroche, ...suite] = bascule.blocks;
    bascule.blocks = [
      accroche!,
      { kind: "essential", text: "Elle t’a tendu la perche, et t’as parlé du métro." },
      { kind: "seen", messages: [elle, toi], factsAfter: ["Trois minutes plus tard, t’as changé de sujet."] },
      ...suite.slice(0, -1),
      { kind: "play", text: "Samedi au marché, c’est toi qui proposes le prochain verre." },
      ...suite.slice(-1),
    ];
    await sql()`update reports set data = ${chiffrer(rapport)} where story_id = ${id}`;
    ecrits++;
  }
  if (!ecrits) throw new Error(`aucun rapport écrit pour ${email}`);
}

/**
 * Efface le rapport écrit de la dernière histoire du compte, comme avant la fin de son écriture (le verdict, lui, reste) :
 * le seul moyen de voir, avec le modèle factice qui écrit en un instant, ce que l’écran montre pendant l’écriture.
 */
export async function rapportPasEncoreEcrit(email: string): Promise<void> {
  const r = await sql()`
    delete from reports where story_id = (
      select s.id from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1
    )`;
  if (!r.count) throw new Error(`aucun rapport écrit pour ${email}`);
}

/* ———— Le vocal du rapport ———— */

/** Les moments d’écoute du vocal du rapport notés pour ce compte (« debut », « fin », « reecoute », « ferme »), dans l’ordre. */
export async function ecoutesDuVocal(email: string): Promise<string[]> {
  const lignes = await sql()<{ evenement: string }[]>`
    select e.evenement from vocal_ecoutes e join stories s on s.id = e.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by e.id`;
  return lignes.map((l) => l.evenement);
}

/**
 * Ce navigateur sait-il lire le MP3 de ce vocal ? Les vocaux du modèle factice sont du silence en MP3 : la lecture
 * (« Mettre en pause ») ne se vérifie que là où le navigateur les lit, ses autres gestes partout.
 */
export async function litLeMp3(page: Page, adresse: string): Promise<boolean> {
  return page.evaluate(async (src) => {
    const a = new Audio(src);
    a.muted = true;
    /* Une lecture qui ne répond pas en quelques secondes ne compte pas comme lue */
    const delai = new Promise<boolean>((r) => setTimeout(() => r(false), 3_000));
    const lu = await Promise.race([
      a.play().then(
        () => true,
        () => false,
      ),
      delai,
    ]);
    a.pause();
    a.removeAttribute("src");
    a.load();
    return lu;
  }, adresse);
}
