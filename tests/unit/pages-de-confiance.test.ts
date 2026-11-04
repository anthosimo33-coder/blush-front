import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Compose, TitreSurligne } from "@/components/article/titre";
import { ctaDe } from "@/components/landing/cta";
import * as aide from "@/contenu/aide";
import { ARTICLES, articlesDu, EXEMPLE_INVENTE, RUBRIQUES, SOURCES } from "@/contenu/articles";
import { PARTIES_CONDITIONS, PAS_UN_CONSEIL, QUE_TES_CONVS, sectionDesConditions } from "@/contenu/conditions";
import { FEUILLE_CONFIDENTIALITE, PROMESSE_CONV, PROMESSE_DONNEES, PROMESSE_EFFACEMENT, PROMESSE_LIEU } from "@/contenu/confidentialite";
import { COMPTES_OFFICIELS, nomDuCompte, PHRASE_D_IDENTITE } from "@/contenu/identite";
import { EDITEUR, lignesEditeur } from "@/contenu/mentions-legales";
import { prixDe } from "@/contenu/offres";
import { A_PROPOS, GROUPES_D_AIDE, METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";
import { jourEnLettres } from "@/lib/format";
import { PAGES_PUBLIQUES } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { fautesDuTexte } from "../aide/articles";

/*
 * Les pages de confiance (/a-propos, /methode, /aide ; leurs textes : src/contenu/pages-de-confiance.ts), rendues comme
 * par le serveur, dans l’habit des guides (le cadre « Magazine ») : publiques, avec leur titre (un seul h1, au texte de
 * la page, son expression dans sa bulle) ; ce qu’elles disent de BLUSH et de son éditeur, tiré tel quel des autres
 * fichiers de src/contenu, jamais recopié ; tous les numéros de src/contenu/aide.ts à un toucher sur /aide, les urgences
 * d’abord, sans rien à vendre ; la fin rose et son seul appel sur /a-propos et /methode ; et les garde-fous des articles
 * (tests/aide/articles.ts) sur tout leur texte affiché. Leur place dans le plan du site, /llms.txt et la barre finale :
 * tests/unit/referencement.test.ts ; ouvertes dans un navigateur, sans JavaScript, et au téléphone :
 * tests/e2e/pages-de-confiance.spec.ts.
 */

/* La police des bulles (next/font) ne se charge que dans la compilation de Next ; le « Retour » demande le routeur */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/a-propos",
}));

/** Les trois pages, leur route (src/app/…/page.tsx) et leurs textes. */
const PAGES = {
  "/a-propos": { route: () => import("@/app/a-propos/page"), page: A_PROPOS },
  "/methode": { route: () => import("@/app/methode/page"), page: METHODE },
  "/aide": { route: () => import("@/app/aide/page"), page: PAGE_AIDE },
} as const;
type Chemin = keyof typeof PAGES;
const CHEMINS = Object.keys(PAGES) as Chemin[];

/** Une page rendue comme par le serveur : son HTML. */
const rendre = async (chemin: Chemin) => renderToStaticMarkup(createElement((await PAGES[chemin].route()).default));

/** Les entités du HTML rendu, lues. */
const lire = (t: string) =>
  t
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Le texte affiché d’une page, morceau par morceau (chaque texte entre deux balises), sans ses données structurées. */
const morceaux = (html: string) =>
  html
    .replace(/<script[^>]*>.*?<\/script>/gs, " ")
    .split(/<[^>]+>/)
    .map((t) => lire(t).trim())
    .filter(Boolean);

/** Le texte affiché d’une page, d’un seul tenant (les insécables restent). */
const texte = (html: string) => morceaux(html).join(" ");

/** Le graphe des données structurées d’une page rendue. */
const graphe = (html: string) => (JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": Record<string, unknown>[] })["@graph"];

/** Les liens d’une page : la valeur de chaque href, dans l’ordre. */
const liens = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => lire(m[1]!));

/** Un morceau d’une page rendue : sa barre du haut (`header`), son contenu (`main`) ou son pied (`footer`), le premier. */
const partie = (html: string, balise: "header" | "main" | "footer") => new RegExp(`<${balise}[^>]*>.*?</${balise}>`, "s").exec(html)?.[0] ?? "";

/** Un texte, en motif d’expression régulière (tel quel). */
const motif = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("les pages de confiance", () => {
  it("publiques : dans les pages fixes du plan du site, avec leur date, leur titre, indexées, à leur adresse canonique", async () => {
    for (const chemin of CHEMINS) {
      const { page, route } = PAGES[chemin];
      expect(
        PAGES_PUBLIQUES.find((p) => p.chemin === chemin),
        chemin,
      ).toMatchObject({ misAJourLe: page.misAJourLe });
      const { metadata } = await route();
      expect(metadata, chemin).toMatchObject({ title: page.court, description: page.description, alternates: { canonical: chemin }, robots: { index: true, follow: true } });
      expect(metadata.openGraph, chemin).toMatchObject({ url: chemin, siteName: "BLUSH", locale: "fr_FR", type: "website" });
    }
  });

  it("dans l’habit des guides : un seul h1, au texte de la page, son expression dans sa bulle ; la date de leur version, les deux autres pages de confiance et les pages légales au pied", async () => {
    for (const chemin of CHEMINS) {
      const html = await rendre(chemin);
      const { page } = PAGES[chemin];
      expect(html.match(/<h1[^>]*>/g), chemin).toHaveLength(1);
      /* La bulle et les groupes insécables ne font qu’habiller le titre : son texte reste celui de la page, tel quel */
      const h1 = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)![1]!;
      expect(lire(h1.replace(/<[^>]+>/g, "")), chemin).toBe(page.titre);
      /* Son expression, un morceau exact du titre, une seule fois, en mots entiers, dans sa bulle (blanc sur le rose ou le bleu) */
      const { mots, ton } = page.surligne;
      expect(page.titre.split(mots), chemin).toHaveLength(2);
      expect(page.titre, chemin).toMatch(new RegExp(`(?<!\\p{L})${motif(mots)}(?![\\p{L}])`, "u"));
      expect(h1, chemin).toMatch(new RegExp(`<span class="[^"]*text-white[^"]*${ton === "bleu" ? "bg-bubble-me" : "var\\(--elle\\)"}[^"]*">${motif(mots)}</span>`));
      /* La date de sa version, écrite comme sous un guide : « Mis à jour le 3 novembre 2026 », sans point final */
      expect(texte(html), chemin).toContain(`Mis à jour le ${jourEnLettres(page.misAJourLe, { annee: true })}`);
      expect(texte(html), chemin).not.toContain("Dernière mise à jour");
      /* Le fil d’Ariane de la barre du haut : la landing, puis la page elle-même, sous son nom court */
      const fil = /<nav aria-label="Fil d’Ariane"[^>]*>(.*?)<\/nav>/s.exec(html)![1]!;
      expect(liens(fil), chemin).toEqual(["/", chemin]);
      expect(texte(fil), chemin).toContain(page.court);
      const confiance = /<nav aria-label="À propos de BLUSH"[^>]*>(.*?)<\/nav>/s.exec(html)![1]!;
      expect(liens(confiance), chemin).toEqual(CHEMINS.filter((c) => c !== chemin));
      const legales = /<nav aria-label="Pages légales"[^>]*>(.*?)<\/nav>/s.exec(html)![1]!;
      expect(liens(legales), chemin).toEqual(["/conditions", "/mentions-legales", "/confidentialite"]);
      expect(texte(html), chemin).not.toMatch(/NaN|Infinity|undefined|\[object/);
    }
  });

  it("le titre surligné garde son texte, insécables comprises ; ce qui touche la bulle reste sur sa ligne avec elle", () => {
    const titre = (texte: string, mots: string) => renderToStaticMarkup(createElement(TitreSurligne, { texte, surligne: { mots, ton: "bleu" } }));
    for (const [texte, mots, colle] of [
      /* Ce qui part d’une insécable (« ?») s’en rapproche un peu, dans un span à soi : le texte ne change pas */
      ["Besoin d’en parler\u00a0?", "en parler", /<\/span> <span class="whitespace-nowrap">d’<span [^>]*>en parler<\/span><span class="-ml-\[0\.12em\]">\u00a0\?<\/span><\/span>$/],
      ["À propos de BLUSH", "BLUSH", /<span class="whitespace-nowrap">de <span [^>]*>BLUSH<\/span><\/span>$/],
      ["Comment on écrit nos guides", "nos guides", /<\/span> <span class="whitespace-nowrap"><span [^>]*>nos guides<\/span><\/span>$/],
    ] as const) {
      const html = titre(texte, mots);
      expect(lire(html.replace(/<[^>]+>/g, "")), texte).toBe(texte);
      expect(html, texte).toMatch(colle);
    }
    /* Une expression absente : le titre reste entier, sans bulle */
    expect(titre("À propos de BLUSH", "rien")).not.toContain("text-white");
    expect(lire(titre("À propos de BLUSH", "rien").replace(/<[^>]+>/g, ""))).toBe("À propos de BLUSH");
    /* Un morceau qui part d’une insécable la garde (trim() la mangeait) */
    for (const texte of ["\u00a0? et ensuite", " à mes messages ", "qu’est-ce que\u00a0?"])
      expect(lire(renderToStaticMarkup(createElement(Compose, { texte })).replace(/<[^>]+>/g, "")), JSON.stringify(texte)).toBe(texte);
  });

  it("aucune phrase interdite : les garde-fous des articles (la marque, l’IA, la surveillance, les promesses, la gratuité, les prix) sur tout leur texte affiché", async () => {
    const prix = prixDe("rapport");
    for (const chemin of CHEMINS) {
      const html = await rendre(chemin);
      /* Le seul prix permis : celui du rapport, lu dans le catalogue par la fin rose (jamais écrit à la main), une fois, dans
         le pied de /a-propos et de /methode ; /aide n’en a aucun. Tout autre prix reste une faute */
      const fois = (t: string) => t.split(prix).length - 1;
      expect(fois(texte(html)), chemin).toBe(chemin === "/aide" ? 0 : 1);
      expect(fois(texte(partie(html, "footer"))), chemin).toBe(chemin === "/aide" ? 0 : 1);
      const lus = [...morceaux(html).map((m) => m.replace(prix, "")), PAGES[chemin].page.description];
      expect(fautesDuTexte(lus, chemin)).toEqual([]);
    }
    /* Le garde-fou voit bien ces textes : une phrase interdite glissée dans une page la ferait échouer, et le prix du pied
       n’y passe que parce qu’il vient du catalogue (écrit à la main, il serait une faute) */
    const lus = morceaux(await rendre("/a-propos"));
    expect(fautesDuTexte([...lus.map((m) => m.replace(prix, "")), "BLUSH est une IA."], "/a-propos")).toHaveLength(1);
    expect(fautesDuTexte(lus, "/a-propos")).toEqual([expect.stringContaining("un prix écrit à la main")]);
  });

  it("/a-propos : la phrase de BLUSH telle quelle, ce qu’il est et n’est pas (les conditions), les promesses sur ta conv, sans dire « intelligence artificielle »", async () => {
    const html = await rendre("/a-propos");
    const t = texte(html);
    expect(t).toContain(`${A_PROPOS.enBref} ${PHRASE_D_IDENTITE}`);
    /* « Une lecture, pas un conseil » sans sa phrase sur l’IA (seules les conditions et la confidentialité la disent) */
    const conseil = sectionDesConditions("conseil");
    expect(conseil.blocs[0]).toMatch(new RegExp(`^${PAS_UN_CONSEIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} BLUSH est une intelligence artificielle`));
    expect(t).toContain(`${conseil.titre} ${PAS_UN_CONSEIL}`);
    expect(t).not.toMatch(/intelligence artificielle/i);
    const age = sectionDesConditions("age");
    expect(t).toContain(`${age.titre} ${age.blocs.join(" ")}`);
    expect(age.blocs.join(" ")).toContain("dès 15 ans");
    for (const promesse of [PROMESSE_CONV, PROMESSE_DONNEES, FEUILLE_CONFIDENTIALITE.partage.detail, PROMESSE_LIEU, PROMESSE_EFFACEMENT]) expect(t, promesse).toContain(promesse);
    /* La ligne « Chiffrée » de la feuille du rapport n’y est pas : PROMESSE_CONV dit déjà « chiffrée » (AProposScreen.tsx) */
    expect(t).not.toContain(FEUILLE_CONFIDENTIALITE.chiffree.detail);
    expect(liens(html)).toContain("/confidentialite");
    /* Une section inconnue des conditions : une erreur, jamais une page vide */
    expect(() => sectionDesConditions("nulle-part")).toThrow(/nulle-part/);
    expect(PARTIES_CONDITIONS.flatMap((p) => p.sections.map((s) => s.id))).toEqual(expect.arrayContaining(["conseil", "age"]));
  });

  it("/a-propos : qui édite BLUSH, tiré des mentions légales (l’éditeur, l’immatriculation, sans le nom du directeur de la publication), où lui écrire, son compte officiel", async () => {
    const html = await rendre("/a-propos");
    const t = texte(html);
    const lignes = lignesEditeur().filter((l) => l.lien !== "mailto" && l.libelle !== "Directeur de la publication");
    expect(lignes.map((l) => l.libelle)).toEqual(expect.arrayContaining(["Éditeur", "Immatriculation"]));
    for (const { libelle, valeur } of lignes) expect(t, libelle).toContain(`${libelle} ${valeur}`);
    for (const champ of [EDITEUR.nom, EDITEUR.immatriculation]) expect(t).toContain(champ);
    /* Son nom reste dans les mentions légales seulement (sa décision du 4 novembre 2026) */
    expect(t).not.toContain("Directeur de la publication");
    expect(html).not.toContain(EDITEUR.directeurPublication);
    expect(liens(html)).toEqual(expect.arrayContaining([`mailto:${EDITEUR.email}`, "/mentions-legales"]));
    /* Le compte officiel, celui des données structurées (sameAs) : son adresse et son nom */
    for (const c of COMPTES_OFFICIELS) {
      expect(liens(html)).toContain(c.url);
      expect(t).toContain(`${c.reseau} ${nomDuCompte(c.url)}`);
    }
    expect(nomDuCompte("https://www.instagram.com/askblush_/")).toBe("@askblush_");
  });

  it("/a-propos : les pages voisines (la méthode, l’aide, les rubriques qui ont des articles) et sa page « À propos » reliée à l’éditeur du site", async () => {
    const html = await rendre("/a-propos");
    const t = texte(html);
    const vers = liens(html);
    expect(vers).toEqual(expect.arrayContaining(["/methode", "/aide"]));
    /* Chaque page sous le nom de tous les liens vers elle (les pieds de page), puis sa phrase */
    for (const page of [METHODE, PAGE_AIDE]) expect(t).toContain(`${page.court} ${page.sous}`);
    for (const genre of ["guide", "lexique"] as const) expect(vers.includes(RUBRIQUES[genre].chemin), genre).toBe(articlesDu(genre).length > 0);
    /* Son fil d’Ariane, celui de la barre du haut : la landing, puis elle, sous son nom court */
    const g = graphe(html);
    expect(g.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "AboutPage", "BreadcrumbList"]);
    const [editeur, site, page, fil] = g;
    expect(editeur).toMatchObject({
      "@id": `${URL_SITE}/#editeur`,
      name: "BLUSH",
      legalName: EDITEUR.nom,
      email: EDITEUR.email,
      sameAs: COMPTES_OFFICIELS.map((c) => c.url),
      publishingPrinciples: `${URL_SITE}/methode`,
    });
    expect(page).toMatchObject({
      "@id": `${URL_SITE}/a-propos`,
      name: A_PROPOS.titre,
      about: { "@id": editeur!["@id"] },
      isPartOf: { "@id": site!["@id"] },
      breadcrumb: { "@id": fil!["@id"] },
    });
    expect(fil).toMatchObject({
      itemListElement: [
        { position: 1, name: "BLUSH", item: URL_SITE },
        { position: 2, name: A_PROPOS.court, item: `${URL_SITE}/a-propos` },
      ],
    });
  });

  it("/a-propos et /methode : la fin rose de la landing, leur seul appel (aucun bouton dans la barre du haut) ; /aide : le pied seul, sur le papier", async () => {
    const cta = ctaDe(null);
    for (const chemin of ["/a-propos", "/methode"] as const) {
      const html = await rendre(chemin);
      /* Un seul lien vers l’import, celui de la fin rose, avec son prix lu dans le catalogue */
      expect(
        liens(html).filter((h) => h === cta.href),
        chemin,
      ).toHaveLength(1);
      expect(liens(partie(html, "footer")), chemin).toContain(cta.href);
      expect(texte(partie(html, "footer")), chemin).toContain(cta.label);
      expect(texte(partie(html, "header")), chemin).not.toContain(cta.header);
      expect(liens(partie(html, "main")), chemin).not.toContain(cta.href);
    }
    /* La phrase de BLUSH une seule fois sur /a-propos (en tête) ; au pied de /methode, comme sous un guide */
    expect(texte(await rendre("/a-propos")).split(PHRASE_D_IDENTITE)).toHaveLength(2);
    expect(texte(partie(await rendre("/methode"), "footer"))).toContain(PHRASE_D_IDENTITE);
    const aide = await rendre("/aide");
    expect(liens(aide)).not.toContain(cta.href);
    expect(texte(aide)).not.toContain(PHRASE_D_IDENTITE);
    expect(texte(partie(aide, "footer"))).not.toMatch(/envoie la conv|pour toi/);
  });

  it("/methode : chaque règle, la relecture sous la responsabilité du directeur de la publication sans le nommer, où signaler une erreur ; rien sur les avis", async () => {
    const html = await rendre("/methode");
    const t = texte(html);
    for (const s of METHODE.sections) {
      expect(html, s.id).toMatch(new RegExp(`<h2 id="${s.id}"[^>]*>`));
      for (const b of s.blocs) for (const phrase of typeof b === "string" ? [b] : b) expect(t, phrase).toContain(phrase);
    }
    /* Relu et validé avant d’être publié, sous la responsabilité du directeur de la publication, que la page renvoie aux
       mentions légales sans le nommer (ni dans son texte, ni dans un attribut, ni dans ses données structurées) */
    const relecture = METHODE.sections.find((s) => s.id === "relecture")!.blocs.join(" ");
    expect(relecture).toMatch(/relu puis validé, sous la responsabilité du directeur de la publication[^.]*mentions légales/);
    expect(relecture).toMatch(/date de mise à jour[^.]*historique des changements/);
    expect(relecture).not.toMatch(/sign|personne nommée|son nom/i);
    /* Le renvoi : sa propre ligne vers les mentions légales, sous les règles, pas seulement le lien du pied (commun aux pages légales) */
    expect(html).toMatch(new RegExp(`<a [^>]*href="/mentions-legales"[^>]*>(?:(?!</a>).)*${METHODE.mentions}(?:(?!</a>).)*</a>`, "s"));
    expect(t).toContain(`${METHODE.mentions} ${METHODE.mentionsSous}`);
    expect(html).not.toContain(EDITEUR.directeurPublication);
    expect(t).toContain(EDITEUR.email);
    expect(liens(html)).toEqual(expect.arrayContaining([`mailto:${EDITEUR.email}`, "/aide"]));
    expect(t).toContain(PAGE_AIDE.court);
    /* Ce que vérifie la machine est lu dans le code : le nombre de sources, la pastille des exemples, la règle des convs importées */
    expect(t).toContain(`de ${SOURCES.min} à ${SOURCES.max} sources`);
    expect(t).toContain(`«\u00a0${EXEMPLE_INVENTE}\u00a0»`);
    expect(t).toContain(`«\u00a0${QUE_TES_CONVS}\u00a0»`);
    /* Une règle des conditions, une obligation de qui importe, jamais une garantie technique de BLUSH */
    expect(t).not.toMatch(/ne lit que tes convs/);
    /* Le lexique y mène aussi (sa signature) : la page dit qu’il suit les mêmes règles */
    expect(t).toMatch(/lexique[^.]*mêmes règles/);
    /* La note et le nombre des avis attendent l’avocat (TODO(produit) de src/contenu/pages-de-confiance.ts) */
    expect(t).not.toMatch(/avis|testeurs|4,8|654/i);
    const g = graphe(html);
    expect(g.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebPage", "BreadcrumbList"]);
    /* Seule /a-propos parle de l’éditeur (about) */
    expect(g[2]).toMatchObject({ "@id": `${URL_SITE}/methode`, name: METHODE.titre, breadcrumb: { "@id": g[3]!["@id"] } });
    expect(g[2]).not.toHaveProperty("about");
    expect(g[3]).toMatchObject({ itemListElement: [{ name: "BLUSH" }, { name: METHODE.court, item: `${URL_SITE}/methode` }] });
    /* Chaque règle dans le sommaire (sur un ordinateur), à un toucher de son intertitre, dans l’ordre */
    const sommaire = /<nav aria-labelledby="[^"]*"[^>]*>(.*?)<\/nav>/s.exec(partie(html, "main"))![1]!;
    expect(texte(sommaire)).toContain("Dans cette page");
    expect(liens(sommaire)).toEqual(METHODE.sections.map((s) => `#${s.id}`));
  });

  it("/methode dit vrai : chaque article du registre a sa validation datée (au plus tard sa mise à jour), aucun nom de relecteur, et 2 à 5 sources datées", () => {
    for (const a of ARTICLES) {
      expect(a.valideLe <= a.misAJourLe, a.slug).toBe(true);
      expect(a, a.slug).not.toHaveProperty("relecteur");
      expect(JSON.stringify(a), a.slug).not.toContain(EDITEUR.directeurPublication);
      expect(a.sources.length, a.slug).toBeGreaterThanOrEqual(SOURCES.min);
      expect(a.sources.length, a.slug).toBeLessThanOrEqual(SOURCES.max);
    }
  });

  it("/aide : tous les numéros de src/contenu/aide.ts, chacun à un toucher (tel:, sms:, https:), par groupe, du plus urgent au moins urgent", async () => {
    const html = await rendre("/aide");
    const t = texte(html);
    /* Les urgences d’abord : la phrase telle quelle, un bouton par numéro dont elle est écrite (NUMEROS_D_URGENCE), puis
       le 114 par SMS (la seule ligne par situation qui s’écrit par SMS : elle fait venir les secours), aucun de plus */
    const numeros = Object.values(aide.NUMEROS_D_URGENCE);
    const parSms = aide.LIGNES_PAR_SITUATION.filter((l) => l.lien.startsWith("sms:"));
    expect(parSms.map((l) => l.lien)).toEqual(["sms:114"]);
    const situations = aide.LIGNES_PAR_SITUATION.filter((l) => !l.lien.startsWith("sms:"));
    expect(t).toContain(aide.URGENCES);
    for (const n of numeros) expect(t, n).toContain(`Appeler le ${n}`);
    expect(GROUPES_D_AIDE.map((g) => g.id)).toEqual(["urgence", "ecoute", "situation"]);
    expect(GROUPES_D_AIDE[0]!.lignes.map((l) => l.lien)).toEqual([...numeros.map((n) => `tel:${n}`), "sms:114"]);
    expect(GROUPES_D_AIDE[2]!.lignes.map((l) => l.lien)).toEqual(situations.map((l) => l.lien));
    /* Chaque groupe a sa phrase, sous son titre : celle des urgences est URGENCES, telle quelle */
    expect(GROUPES_D_AIDE[0]!.texte).toBe(aide.URGENCES);
    for (const g of GROUPES_D_AIDE) expect(t, g.id).toContain(`${g.titre} ${g.texte}`);
    /* Les lignes d’écoute : leur nom, ce qu’elles promettent, leur numéro, et l’appel */
    for (const l of aide.LIGNES_D_ECOUTE) {
      expect(liens(html), l.name).toContain(`tel:${l.tel}`);
      expect(t, l.name).toContain(`${l.name} ${l.detail} ${l.label}`);
    }
    /* Les lignes par situation : leur nom, pour qui, ce qu’elles promettent, ce qu’on lit ; le 114 par SMS, jamais en appel */
    for (const l of aide.LIGNES_PAR_SITUATION) {
      expect(liens(html), l.name).toContain(l.lien);
      expect(t, l.name).toContain(`${l.name} ${l.pour} ${l.detail} ${l.label}`);
    }
    expect(liens(html)).toContain("sms:114");
    expect(liens(html)).not.toContain("tel:114");
    /* Le 3018 s’appelle ou s’écrit : deux boutons, l’appel et son tchat, comme sur la feuille du rapport doux */
    for (const l of aide.LIGNES_PAR_SITUATION.filter((l) => "tchat" in l)) {
      expect(html, l.name).toContain(`aria-label="Appeler le ${l.label}"`);
      expect(html, l.name).toContain(`href="${l.tchat}"`);
      expect(html, l.name).toContain(`aria-label="Écrire en tchat au ${l.label}"`);
    }
    /* Chaque lien d’appel, de SMS ou vers une page d’aide vient d’aide.ts, une seule fois, et chacun de ses groupes est sur la page, dans l’ordre */
    const gestes = liens(html).filter((h) => /^(tel|sms|https):/.test(h));
    expect(new Set(gestes).size).toBe(gestes.length);
    expect(gestes).toEqual(GROUPES_D_AIDE.flatMap((g) => g.lignes.flatMap((l) => (l.tchat ? [l.lien, l.tchat] : [l.lien]))));
    expect(gestes).toEqual([
      ...numeros.map((n) => `tel:${n}`),
      ...parSms.map((l) => l.lien),
      ...aide.LIGNES_D_ECOUTE.map((l) => `tel:${l.tel}`),
      ...situations.flatMap((l) => ("tchat" in l ? [l.lien, l.tchat] : [l.lien])),
    ]);
    /* Rien n’est oublié : tous les liens d’aide.ts sont là, une fois */
    expect(new Set(gestes)).toEqual(
      new Set([
        ...numeros.map((n) => `tel:${n}`),
        ...aide.LIGNES_D_ECOUTE.map((l) => `tel:${l.tel}`),
        ...aide.LIGNES_PAR_SITUATION.flatMap((l) => ("tchat" in l ? [l.lien, l.tchat] : [l.lien])),
      ]),
    );
    for (const g of GROUPES_D_AIDE) expect(html, g.id).toMatch(new RegExp(`<h2 id="${g.id}"[^>]*>${g.titre}</h2>`));
    /* Des numéros français : la page le dit */
    expect(PAGE_AIDE.sous).toContain("en France");
  });

  it("/aide : rien à vendre, ni bouton d’achat, ni appel à importer sa conv, ni prix", async () => {
    const html = await rendre("/aide");
    const t = texte(html);
    const cta = ctaDe(null);
    expect(t).not.toContain(cta.label);
    expect(t).not.toContain(prixDe("rapport"));
    expect(t).not.toMatch(/import|achat|acheter|payer|paiement|rapport/i);
    for (const h of liens(html)) expect(h).not.toMatch(/^\/(commencer|importer|paiement|compte|connexion)/);
  });
});
