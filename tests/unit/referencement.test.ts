import { readdirSync, readFileSync } from "node:fs";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTREE_D_EXEMPLE, EXEMPLES, GUIDE_D_EXEMPLE } from "@/app/apercu/guide/exemples";
import { ARTICLES } from "@/contenu/articles";
import { CONDITIONS } from "@/contenu/conditions";
import { CONFIDENTIALITE_MISE_A_JOUR } from "@/contenu/confidentialite";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { MENTIONS } from "@/contenu/mentions-legales";
import { A_PROPOS, METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";
import { donneesDuSite } from "@/lib/donnees-structurees";
import { derniereMiseAJour, jourEnLettres } from "@/lib/format";
import { CHEMINS_PRIVES, PAGES_PUBLIQUES, pagePublique, pagesPubliques } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { BARRE_FINALE } from "../../next.config";
import { verifierLesPagesPubliques } from "../aide/referencement";

/*
 * Ce que les moteurs de recherche voient (src/lib/referencement.ts, src/app/robots.ts, src/app/sitemap.ts, /llms.txt,
 * la barre finale de next.config.ts, IndexNow) : les pages publiques, registre des articles compris, chacune indexable
 * avec son adresse canonique et dans le plan du site, rien de privé. Ici le vrai registre (src/contenu/articles, vide
 * tant qu’aucun article n’est signé) ; tests/unit/articles-pages.test.ts refait tout avec des articles.
 */

/* Les pages importent la police des bulles (next/font), qui ne se charge que dans la compilation de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));

afterEach(() => vi.unstubAllEnvs());

/** Le Disallow de robots.txt qui couvre ce chemin, lu comme les moteurs le lisent (un début de chemin), s’il y en a un. */
const disallowDe = (chemin: string) => CHEMINS_PRIVES.find((prive) => chemin.startsWith(prive));

/** Les pages fixes, dans l’ordre du plan du site : la landing, les pages légales, puis les pages de confiance. */
const FIXES = ["/", "/confidentialite", "/conditions", "/mentions-legales", "/a-propos", "/methode", "/aide"];

/** Le fichier de la clé IndexNow (public/<clé>.txt) : 32 caractères hexadécimaux. */
const FICHIERS_INDEXNOW = readdirSync("public").filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));

describe("le référencement", () => {
  it("une page publique dit elle-même qu’elle s’indexe, avec son adresse canonique et son aperçu complet (nom du site, langue, genre)", () => {
    const m = pagePublique("/conditions", { title: "Conditions", description: "Les conditions." });
    expect(m.robots).toMatchObject({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("/conditions");
    expect(m.openGraph).toMatchObject({ title: "Conditions", description: "Les conditions.", url: "/conditions", siteName: "BLUSH", locale: "fr_FR", type: "website" });
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: "/opengraph-image", width: 1200, height: 630 })]);
    expect(pagePublique("/", { title: "BLUSH", description: "x" }).title).toEqual({ absolute: "BLUSH" });
  });

  it("un article : un aperçu « article » avec ses dates de publication et de mise à jour, et son image à lui", () => {
    const m = pagePublique("/guides/un-guide", { title: "Un guide", description: "x", article: { publieLe: "2026-11-03", misAJourLe: "2026-11-10" } });
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: "2026-11-03", modifiedTime: "2026-11-10", siteName: "BLUSH", locale: "fr_FR" });
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: "/guides/un-guide/image", width: 1200, height: 630 })]);
    expect(m.twitter).toMatchObject({ images: ["/guides/un-guide/image"] });
  });

  it("robots.txt : en ligne, les pages publiques lisibles, l’API et les pages privées écartées, le plan du site cité, sans « Host » ; hors de Vercel, rien", async () => {
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    vi.stubEnv("VERCEL", "1");
    const r = robots();
    const regles = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(regles.allow).toBe("/");
    expect(regles.disallow).toEqual(expect.arrayContaining(["/api/", "/app", "/rapport", "/compte", "/admin", "/apercu"]));
    /* Les verdicts partagés restent lisibles par les robots des aperçus (leur page dit noindex elle-même) */
    expect(regles.disallow).not.toContain("/v");
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(r).not.toHaveProperty("host");
  });

  it("chaque page publique, registre compris, s’indexe avec son adresse canonique et figure dans le plan du site, avec sa date", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const pages = pagesPubliques();
    expect(pages.map((p) => p.chemin).slice(0, PAGES_PUBLIQUES.length)).toEqual(FIXES);
    expect(pages).toHaveLength(PAGES_PUBLIQUES.length + (ARTICLES.length ? ARTICLES.length + new Set(ARTICLES.map((a) => a.genre)).size : 0));
    await verifierLesPagesPubliques(pages, sitemap());
    expect(sitemap()[0]!.priority).toBe(1);
  });

  it("le plan du site : la date des pages légales et de confiance est celle qu’elles affichent, jamais celle du build", () => {
    const dates = Object.fromEntries(PAGES_PUBLIQUES.map((p) => [p.chemin, p.misAJourLe]));
    expect(dates).toMatchObject({
      "/conditions": CONDITIONS.misAJourLe,
      "/mentions-legales": MENTIONS.misAJourLe,
      "/confidentialite": CONFIDENTIALITE_MISE_A_JOUR,
      "/a-propos": A_PROPOS.misAJourLe,
      "/methode": METHODE.misAJourLe,
      "/aide": PAGE_AIDE.misAJourLe,
    });
    expect(CONDITIONS.maj).toBe("Dernière mise à jour\u00a0: 26 octobre 2026.");
    expect(MENTIONS.maj).toBe("Dernière mise à jour\u00a0: 3 novembre 2026.");
    /* Le premier du mois, comme on l’écrit : « 1er », jamais « 1 » (la date des pages légales, des articles, des offres) */
    expect(derniereMiseAJour("2026-12-01")).toBe("Dernière mise à jour\u00a0: 1er décembre 2026.");
    expect([jourEnLettres("2026-11-01"), jourEnLettres("2026-11-01", { court: true }), jourEnLettres("2026-11-10", { annee: true })]).toEqual([
      "1er novembre",
      "1er nov.",
      "10 novembre 2026",
    ]);
    for (const { chemin, misAJourLe } of PAGES_PUBLIQUES) expect(misAJourLe, chemin).toMatch(/^2026-\d{2}-\d{2}$/);
  });

  it("une rubrique n’existe qu’avec un article : son hub, à jour de son article le plus récent, puis ses articles", () => {
    expect(pagesPubliques([]).map((p) => p.chemin)).toEqual(FIXES);
    const recent = {
      ...ENTREE_D_EXEMPLE,
      slug: "ghosting-2",
      motCle: "ghosting 2",
      misAJourLe: "2026-11-20",
      changements: [{ le: "2026-11-20", quoi: "Une section de plus" }],
    } as const;
    const pages = pagesPubliques([...EXEMPLES, recent]);
    expect(pages.slice(FIXES.length).map((p) => [p.chemin, p.misAJourLe])).toEqual([
      ["/guides", "2026-11-03"],
      ["/guides/il-met-du-temps-a-repondre", "2026-11-03"],
      ["/lexique", "2026-11-20"],
      ["/lexique/ghosting", "2026-11-03"],
      ["/lexique/ghosting-2", "2026-11-20"],
    ]);
    expect(pagesPubliques([GUIDE_D_EXEMPLE]).map((p) => p.chemin)).not.toContain("/lexique");
  });

  it.skipIf(ARTICLES.length)("sans article, les deux hubs n’existent pas : la page introuvable (404), hors des moteurs", async () => {
    for (const hub of [await import("@/app/guides/page"), await import("@/app/lexique/page")]) {
      expect(hub.generateMetadata()).toEqual({});
      expect(() => hub.default()).toThrow(expect.objectContaining({ digest: expect.stringContaining("404") }));
    }
  });

  it("la landing : l’éditeur et son compte officiel, le site et ses autres noms, l’appli décrite par la phrase de BLUSH", () => {
    const [editeur, site, appli] = donneesDuSite(URL_SITE, "9.90")["@graph"];
    expect(editeur).toMatchObject({ "@type": "Organization", "@id": `${URL_SITE}/#editeur`, name: "BLUSH", sameAs: ["https://www.instagram.com/askblush_/"] });
    expect(site).toMatchObject({
      "@type": "WebSite",
      name: "BLUSH",
      alternateName: ["askblush", "Ask Blush", "askblush.com"],
      url: URL_SITE,
      publisher: { "@id": `${URL_SITE}/#editeur` },
    });
    expect(appli).toMatchObject({ "@type": "WebApplication", description: PHRASE_D_IDENTITE, offers: { price: "9.90", priceCurrency: "EUR" } });
  });

  it("aucun chemin public (registre et exemples compris, /llms.txt, la clé IndexNow) n’est couvert par un Disallow, lu comme un début de chemin", () => {
    /* La règle des moteurs : « /qui » écarte aussi « /quiz… », « /app » aussi « /application… » */
    expect(disallowDe("/quiz-de-crush")).toBe("/qui");
    expect(disallowDe("/application-de-rencontre")).toBe("/app");
    expect(disallowDe("/retour-de-flamme")).toBe("/retour");
    const chemins = [...pagesPubliques([...ARTICLES, ...EXEMPLES]).map((p) => p.chemin), "/llms.txt", "/sitemap.xml", "/opengraph-image", ...FICHIERS_INDEXNOW.map((f) => `/${f}`)];
    for (const chemin of chemins) expect(disallowDe(chemin), chemin).toBeUndefined();
  });

  it("la barre finale d’une page publique mène à la même adresse sans (308) ; /ingest, /api, les fichiers de Next et les pages du proxy gardent la leur", () => {
    expect(BARRE_FINALE.permanent).toBe(true);
    const correspond = getPathMatch(BARRE_FINALE.source, { strict: true, removeUnnamedParams: true });
    for (const { chemin } of pagesPubliques([...ARTICLES, ...EXEMPLES]).filter((p) => p.chemin !== "/"))
      expect(correspond(`${chemin}/`), `${chemin}/`).toEqual({ chemin: chemin.slice(1) });
    for (const garde of [
      "/",
      "/conditions",
      "/guides/un-guide",
      "/ingest/e/",
      "/ingest/s/",
      "/ingest/decide/",
      "/api/reveil/",
      "/_next/static/chunks/",
      "/commencer/",
      "/apercu/guide/",
      "/conditionsx/",
      "/guides/a/b/",
    ])
      expect(correspond(garde), garde).toBe(false);
  });

  it("/llms.txt : la phrase de BLUSH, puis ses pages publiques, sans nom d’IA ni rubrique vide", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const r = GET();
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const texte = await r.text();
    expect(texte).toMatch(/^# BLUSH\n\n> /);
    expect(texte).toContain(`> ${PHRASE_D_IDENTITE}`);
    expect(PHRASE_D_IDENTITE).toBe("BLUSH lit une conv que tu importes (captures d’écran, export Instagram ou WhatsApp) et te dit ce qui se passe vraiment entre vous.");
    for (const { chemin, nom } of PAGES_PUBLIQUES) expect(texte).toContain(`- [${nom}](${URL_SITE}${chemin === "/" ? "" : chemin})`);
    expect(texte).not.toMatch(/(?<![\p{L}])(IA|Claude|Anthropic|ElevenLabs|Mistral|OpenAI|GPT)(?![\p{L}])/u);
    if (!ARTICLES.length) expect(texte).not.toMatch(/## (Guides|Lexique)/);
  });

  it("IndexNow : une seule clé, publique, servie à la racine ; envoyée par la CI après une mise en production réussie, sans jamais la faire échouer", () => {
    expect(FICHIERS_INDEXNOW).toHaveLength(1);
    const fichier = FICHIERS_INDEXNOW[0]!;
    expect(readFileSync(`public/${fichier}`, "utf8")).toBe(fichier.replace(/\.txt$/, ""));
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const deployer = ci.slice(ci.indexOf("\n  deployer:"));
    const etape = deployer.slice(deployer.indexOf("- name: IndexNow"));
    /* Dans le job de mise en production seulement, après la vérification du nouveau déploiement */
    expect(ci.indexOf("api.indexnow.org")).toBeGreaterThan(ci.indexOf("\n  deployer:"));
    expect(deployer.indexOf("- name: IndexNow")).toBeGreaterThan(deployer.indexOf("- name: Le nouveau déploiement répond"));
    expect(etape).toMatch(/if: success\(\) && github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
    expect(etape).toMatch(/continue-on-error: true/);
    expect(etape).toMatch(/timeout-minutes: 1\n/);
    expect(etape).toContain("$DOMAINE/sitemap.xml");
  });
});
