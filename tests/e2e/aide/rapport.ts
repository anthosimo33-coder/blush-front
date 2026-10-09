import { expect, type Locator, type Page } from "@playwright/test";
import { sql } from "./base";
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

/** Les sept chapitres fermés d’un rapport gratuit, dans l’ordre (src/server/donnees.ts, ROLES) : le 5 porte le prénom de l’autre. */
export const CHAPITRES_FERMES = ["Le moment où tout a basculé", "Votre histoire, en actes", "Ce qui coince", "Maëlys", "Toi", "Votre duo", "Ton prochain pas"];

/** Le titre du paiement, sur le rapport de Noé et Maëlys. */
export const PAIEMENT = "La suite parle de vous deux : toi et Maëlys.";

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
export async function ouvrirLeSommaire(page: Page): Promise<Locator> {
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
export async function attendreChapitreEnCours(page: Page, numero: number, titre: string): Promise<void> {
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
    const lu = await Promise.race([a.play().then(() => true, () => false), delai]);
    a.pause();
    a.removeAttribute("src");
    a.load();
    return lu;
  }, adresse);
}
