import type { Browser, BrowserContext, Locator, Page, Response } from "@playwright/test";
import { fauxCloudflare } from "./captcha";

/*
 * Une page de l’appli chargée en entier (une adresse ouverte, un rechargement, un lien qui recharge tout) s’affiche avant
 * que React ne l’anime : touché trop tôt, un bouton ne fait rien et un champ rempli est oublié, comme pour quelqu’un qui
 * touche trop vite sur un téléphone lent. Next pose son annonceur de navigation (<next-route-announcer>) une fois la page
 * animée (hydratée) : c’est le signal qu’on attend avant le moindre geste. Les navigations dans l’appli (un lien de Next,
 * router.push) n’en ont pas besoin : la page est déjà vivante.
 */

/**
 * Une attente des tests : un aller-retour au serveur sur une machine chargée (un import, une réponse du chat, une page
 * rendue par le serveur, une page qui devient vivante). Le même temps que celui d’un expect (playwright.config.ts) :
 * aucune attente des aides ne dure plus longtemps, sauf le dessin d’une image (DESSIN, aide/partage.ts) et la lecture de
 * captures (LECTURE_DES_CAPTURES, aide/instagram-captures.ts).
 */
export const RESEAU = 30_000;

/**
 * Attend que la page affichée réponde aux gestes. Une page de l’appli (Next y laisse `self.__next_f`) l’est quand Next a
 * posé son annonceur ; une autre (about:blank, une image, un autre site) l’est tout de suite. À appeler après un geste qui
 * recharge toute la page (window.location, un simple <a>), une fois sa nouvelle adresse affichée (toHaveURL) : avant,
 * c’est encore l’ancienne page qui répondrait.
 */
export async function pagePrete(page: Page): Promise<void> {
  await page.waitForFunction(() => !("__next_f" in self) || document.querySelector("next-route-announcer") !== null, undefined, { timeout: RESEAU });
}

const suivies = new WeakSet<Page>();

/**
 * Fait attendre la page vivante après chaque chargement demandé par le test : goto, reload, goBack et goForward rendent
 * la main une fois la page hydratée. goto et reload n’attendent plus l’événement load (les images, les polices) mais le
 * document lu, puis l’hydratation : c’est elle qui compte pour un geste. Appliqué à toutes les pages des tests (aide/index.ts).
 */
function suivreLesChargements(page: Page): void {
  if (suivies.has(page)) return;
  suivies.add(page);
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  const goBack = page.goBack.bind(page);
  const goForward = page.goForward.bind(page);
  page.goto = async (url, options) => {
    const reponse = await goto(url, { waitUntil: "domcontentloaded", ...options });
    await pagePrete(page);
    return reponse;
  };
  page.reload = async (options) => {
    const reponse = await reload({ waitUntil: "domcontentloaded", ...options });
    await pagePrete(page);
    return reponse;
  };
  page.goBack = async (options) => {
    const reponse = await goBack(options);
    await pagePrete(page);
    return reponse;
  };
  page.goForward = async (options) => {
    const reponse = await goForward(options);
    await pagePrete(page);
    return reponse;
  };
}

/*
 * Les tests se jouent sans le son de BLUSH : WebKit joue vraiment les sons de l’interface sur la machine qui lance les
 * tests. Le réglage « Sons et vibrations » part coupé (la clé de src/lib/sound.ts), sauf s’il est déjà posé.
 */
export async function couperLesSons(contexte: BrowserContext): Promise<void> {
  await contexte.addInitScript(() => {
    try {
      if (localStorage.getItem("blush.sons.v1") === null) localStorage.setItem("blush.sons.v1", "0");
    } catch {
      /* stockage indisponible : l’appli joue alors comme sur un navigateur neuf */
    }
  });
}

/** Toutes les pages de ce navigateur, celles d’aujourd’hui et celles qu’il ouvrira (un second onglet). */
export function suivreLeNavigateur(contexte: BrowserContext): void {
  contexte.on("page", suivreLesChargements);
  for (const page of contexte.pages()) suivreLesChargements(page);
}

/**
 * Un autre appareil : un navigateur à part, sans les cookies du test (ni session, ni brouillon), avec les réglages du
 * projet (l’adresse de l’appli, l’écran, la langue, l’IP du test). Renvoie sa page. Les tests le prennent par la
 * fixture `autreAppareil` (aide/index.ts), qui le referme à la fin du test, même quand il échoue en route.
 */
export async function nouvelAppareil(browser: Browser): Promise<Page> {
  const contexte = await browser.newContext();
  suivreLeNavigateur(contexte);
  await fauxCloudflare(contexte);
  await couperLesSons(contexte);
  return contexte.newPage();
}

/** La requête qu’on attend : son chemin (exact, ou un motif), sa méthode (POST par défaut), et un filtre de plus si besoin. */
export type Requete = { chemin: string | RegExp; methode?: string; filtre?: (r: Response) => boolean; timeout?: number };

/**
 * Fait `geste` et rend la réponse de la requête qu’il déclenche. L’attente part avec le geste : l’une ne reste jamais
 * sans l’autre (un geste qui échoue n’abandonne pas une attente qui échouerait plus tard, sans personne pour l’écouter).
 */
export async function reponseAuGeste(page: Page, { chemin, methode = "POST", filtre = () => true, timeout = RESEAU }: Requete, geste: () => Promise<unknown>): Promise<Response> {
  const [reponse] = await Promise.all([
    page.waitForResponse(
      (r) => {
        const p = new URL(r.url()).pathname;
        return (typeof chemin === "string" ? p === chemin : chemin.test(p)) && r.request().method() === methode && filtre(r);
      },
      { timeout },
    ),
    geste(),
  ]);
  return reponse;
}

/**
 * Ouvre une page qui a besoin du compte (l’accueil, sa fiche, Mon compte, « Tes convs »), ou recharge celle-ci, et attend
 * qu’elle soit vivante : ses interrupteurs, ses convs et son chat ne répondent bien qu’ensuite (touché plus tôt, un
 * interrupteur revient en arrière, une conv suit son lien sans être choisie, un geste vise la conv du cookie). Une page
 * d’une conv rend le compte avec elle (PageDeConv) : elle est vivante une fois sa conv posée (`data-conv-posee` sur
 * <html>, src/components/shell/PoseConv.tsx), son contenu hydraté. « Tes convs » lit le compte une fois vivante : on
 * attend cette lecture (GET /api/compte). Le chargement, l’hydratation puis la lecture se suivent : deux attentes de
 * suite au plus.
 */
export async function ouvrir(page: Page, adresse?: string): Promise<void> {
  /* Une lecture partie de cette page-ci : pas celle, encore en route, de la page d’avant */
  const depuis = Date.now();
  const lecture = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/compte" && r.request().method() === "GET" && r.request().timing().startTime >= depuis, {
    timeout: 2 * RESEAU,
  });
  /* Celle des deux attentes qui ne vient pas (la lecture, sur une page d’une conv) ne reste pas sans personne pour l’écouter */
  lecture.catch(() => {});
  await (adresse ? page.goto(adresse) : page.reload());
  await Promise.race([lecture, page.waitForFunction(() => "convPosee" in document.documentElement.dataset, undefined, { timeout: 2 * RESEAU })]);
}

/**
 * Attend que la page soit au repos depuis `repos` ms : plus aucune animation finie en cours (celles qui tournent sans
 * fin ne comptent pas : une capture les arrête), plus aucune bulle en vol (un double posé par-dessus le chat, retiré par
 * un minuteur une fois la vraie bulle arrivée), et plus aucun changement du document. Une animation finie déclenche
 * souvent la suite (une classe, un attribut, une autre animation) : capturée trop tôt, la page n’est pas tout à fait la
 * même d’un lancement à l’autre. Au bout de `max` ms, une erreur ; avec `echouer: false`, false (la page bouge encore).
 * Pour les captures : la référence visuelle (visuel.spec.ts), la galerie (scripts/galerie).
 */
export async function pageAuRepos(page: Page, { repos = 600, max = 15_000, echouer = true }: { repos?: number; max?: number; echouer?: boolean } = {}): Promise<boolean> {
  const pose = await page.evaluate(
    ({ repos, max }) =>
      new Promise<boolean>((fini) => {
        let dernier = performance.now();
        const debut = dernier;
        const changements = new MutationObserver(() => (dernier = performance.now()));
        changements.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        const verifier = () => {
          const anime =
            !!document.querySelector(".flight") || document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity);
          if (anime) dernier = performance.now();
          const auRepos = performance.now() - dernier >= repos;
          if (auRepos || performance.now() - debut > max) {
            changements.disconnect();
            fini(auRepos);
          } else setTimeout(verifier, 50);
        };
        verifier();
      }),
    { repos, max },
  );
  if (!pose && echouer) throw new Error(`la page bouge encore après ${max / 1000} secondes`);
  return pose;
}

/**
 * Choisit des fichiers par un bouton de l’écran (par défaut « Choisir le fichier enregistré »), dans le sélecteur du
 * système. L’attente du sélecteur et le toucher partent ensemble : l’une ne reste jamais sans l’autre.
 */
export async function choisirFichier(page: Page, chemins: string | string[], bouton: string | Locator = "Choisir le fichier enregistré"): Promise<void> {
  const cible = typeof bouton === "string" ? page.getByRole("button", { name: bouton, exact: true }) : bouton;
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), cible.click()]);
  await selecteur.setFiles(chemins);
}

/**
 * Note ce que la page met dans le presse-papiers (« Copier ») au moment où elle l’y met : WebKit ne laisse pas un test
 * relire le presse-papiers. À appeler avant d’ouvrir la page. Renvoie de quoi lire la dernière copie.
 */
export async function releverLePressePapiers(page: Page): Promise<() => Promise<string | undefined>> {
  await page.addInitScript(() => {
    const presse = navigator.clipboard;
    if (!presse) return;
    const ecrire = presse.writeText.bind(presse);
    presse.writeText = (texte: string) => {
      (window as unknown as { __copieDuTest: string }).__copieDuTest = texte;
      return ecrire(texte);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __copieDuTest?: string }).__copieDuTest);
}
