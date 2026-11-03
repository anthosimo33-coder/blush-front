import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ctaDe } from "@/components/landing/cta";
import { LIGNES_D_ECOUTE, LIGNES_PAR_SITUATION, URGENCES } from "@/contenu/aide";
import { ARTICLES, liesDe } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { prixDe } from "@/contenu/offres";
import { PageArticle } from "@/components/article/PageArticle";
import { pagesPubliques } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { verifierLesPagesPubliques } from "../aide/referencement";

/*
 * Les pages des guides et du lexique (src/app/guides, src/app/lexique, src/components/article) avec un registre qui a
 * des articles : les deux exemples des aperçus (src/app/apercu/guide/exemples.ts), signés par une personne inventée, à
 * la place du registre de production (vide tant qu’aucun article n’est signé). Les routes telles que Next les appelle
 * (generateStaticParams, generateMetadata, la page, l’image), rendues comme par le serveur : le gabarit de la charte,
 * les données structurées, le plan du site et /llms.txt.
 */

vi.mock("@/contenu/articles", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/contenu/articles")>();
  const { EXEMPLES } = await import("@/app/apercu/guide/exemples");
  const registre: readonly Article[] = EXEMPLES.map((a) => ({ ...a, relecteur: { nom: "Alex Dupont", role: "relecteur de test" } }));
  return {
    ...vrai,
    ARTICLES: registre,
    articlesDu: (genre: Article["genre"], articles = registre) => vrai.articlesDu(genre, articles),
    articleDe: (genre: Article["genre"], slug: string, articles = registre) => vrai.articleDe(genre, slug, articles),
    liesDe: (article: Article, articles = registre) => vrai.liesDe(article, articles),
  };
});
/* La police des bulles (next/font) ne se charge que dans la compilation de Next ; le « Retour » demande le routeur */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/guides/il-met-du-temps-a-repondre",
}));

/** Les deux paramètres d’une page, tels que Next les passe. */
const props = <P extends object>(params: P) => ({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });

/** Le texte d’une page rendue : ses balises retirées, ses entités lues, ses espaces resserrées (les insécables restent). */
const texte = (html: string) =>
  html
    .replace(/<script[^>]*>.*?<\/script>/gs, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/[ \t\n\r]+/g, " ");

/** Le graphe des données structurées d’une page rendue. */
const graphe = (html: string) => (JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": Record<string, unknown>[] })["@graph"];

const SALE = /NaN|Infinity|undefined|\[object/;

/** Un texte, lu tel quel dans une regex. */
const tel = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const [GUIDE, ENTREE] = ARTICLES as [Article, Article];

/** La page d’un guide ou d’une entrée, telle que sa route la rend. */
async function pageDe(a: Article): Promise<string> {
  const element =
    a.genre === "guide"
      ? await (await import("@/app/guides/[slug]/page")).default(props({ slug: a.slug }))
      : await (await import("@/app/lexique/[terme]/page")).default(props({ terme: a.slug }));
  return renderToStaticMarkup(element);
}

describe("les guides et le lexique, avec des articles", () => {
  it("chaque page publique, hubs et articles compris, s’indexe avec son adresse canonique et figure dans le plan du site, avec sa date", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const pages = pagesPubliques();
    expect(pages.map((p) => p.chemin).slice(4)).toEqual(["/guides", "/guides/il-met-du-temps-a-repondre", "/lexique", "/lexique/ghosting"]);
    await verifierLesPagesPubliques(pages, sitemap());
  });

  it("les routes ne connaissent que le registre : ses slugs au build, la page introuvable pour le reste", async () => {
    const guides = await import("@/app/guides/[slug]/page");
    const lexique = await import("@/app/lexique/[terme]/page");
    expect([guides.dynamicParams, lexique.dynamicParams]).toEqual([false, false]);
    expect(guides.generateStaticParams()).toEqual([{ slug: GUIDE.slug }]);
    expect(lexique.generateStaticParams()).toEqual([{ terme: ENTREE.slug }]);
    expect((await import("@/app/guides/[slug]/image/route")).generateStaticParams()).toEqual([{ slug: GUIDE.slug }]);
    expect((await import("@/app/lexique/[terme]/image/route")).generateStaticParams()).toEqual([{ terme: ENTREE.slug }]);
    /* Un slug d’une autre rubrique, ou inconnu : notFound(), la page introuvable de Next (404) */
    await expect(guides.generateMetadata(props({ slug: ENTREE.slug }))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(guides.default(props({ slug: "nulle-part" }))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(lexique.default(props({ terme: GUIDE.slug }))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("un guide : son aperçu « article », avec ses dates et son image dessinée (1200 × 630)", async () => {
    const guides = await import("@/app/guides/[slug]/page");
    const m = await guides.generateMetadata(props({ slug: GUIDE.slug }));
    expect(m.title).toBe(GUIDE.titre);
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: GUIDE.publieLe, modifiedTime: GUIDE.misAJourLe, url: `/guides/${GUIDE.slug}` });
    const { GET } = await import("@/app/guides/[slug]/image/route");
    const image = await GET(new Request(`${URL_SITE}/guides/${GUIDE.slug}/image`), { params: Promise.resolve({ slug: GUIDE.slug }) });
    expect([image.status, image.headers.get("content-type")]).toEqual([200, "image/png"]);
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    const inconnue = await GET(new Request(`${URL_SITE}/guides/nulle-part/image`), { params: Promise.resolve({ slug: "nulle-part" }) });
    expect(inconnue.status).toBe(404);
  });

  it("le gabarit d’un guide : titre, signature, réponse courte, sections en questions, mini-convs inventées, BLUSH, FAQ, bouton, liens, sources", async () => {
    const html = await pageDe(GUIDE);
    const t = texte(html);
    expect(t).not.toMatch(SALE);
    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${tel(GUIDE.titre)}</h1>`));
    expect(t).toContain("Par l’équipe BLUSH · relu par Alex Dupont, relecteur de test · mis à jour le 3 novembre 2026");
    expect(t).toContain(`La réponse courte ${GUIDE.reponseCourte}`);
    for (const s of GUIDE.sections) expect(html, s.question).toMatch(new RegExp(`<h2 id="[a-z0-9-]+"[^>]*>${tel(s.question)}</h2>`));
    const convs = GUIDE.sections.flatMap((s) => s.blocs.filter((b) => b.type === "conv"));
    expect(t.match(/exemple inventé/g)).toHaveLength(convs.length);
    expect(t).toContain("Les convs de cette page sont inventées");
    /* Qui parle, pour les lecteurs d’écran : toi, l’autre, BLUSH */
    expect(t).toContain("L’autre\u00a0: dsl je viens de voir");
    expect(t).toContain("BLUSH\u00a0: il répond vite le soir");
    for (const titre of ["Ce que BLUSH regarde", "Les pièges", "Les questions qu’on se pose", "Pour aller plus loin", "Sources"]) expect(t, titre).toContain(titre);
    for (const q of GUIDE.faq) expect(t).toContain(`${q.question} ${q.reponse}`);
    /* Le bouton et ce qu’il y a dessous viennent du code, jamais d’un article */
    const cta = ctaDe(null);
    expect(html).toContain(`href="${cta.href}"`);
    expect(t).toContain(cta.label);
    expect(t).toContain(cta.note!);
    expect(t).toContain(`Le rapport\u00a0: ${prixDe("rapport")}`);
    expect(t).toContain("Tu veux savoir pour toi\u00a0? Importe ta conv\u00a0: captures d’écran, export Instagram ou WhatsApp.");
    /* Les liés, les sources datées, la phrase de BLUSH, le fil d’Ariane */
    expect(html).toContain(`href="/lexique/${ENTREE.slug}"`);
    for (const s of GUIDE.sources) expect(t).toContain(`${s.titre} , consultée le 3 novembre 2026`);
    expect(t).toContain(PHRASE_D_IDENTITE);
    expect(html).toMatch(/<nav aria-label="Fil d’Ariane"[^>]*>.*href="\/".*BLUSH.*href="\/guides".*Guides/s);
    /* Ni le bloc d’aide (zone verte), ni rien de la landing (ses îlots, la note des avis) */
    expect(t).not.toContain(URGENCES);
    expect(html).not.toContain("#avis-titre");
  });

  it("ses données structurées : l’article de l’éditeur BLUSH, sa page relue par son relecteur, son fil d’Ariane", async () => {
    const g = graphe(await pageDe(GUIDE));
    expect(g.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebPage", "Article", "BreadcrumbList"]);
    const [editeur, , page, article, fil] = g;
    const url = `${URL_SITE}/guides/${GUIDE.slug}`;
    expect(article).toMatchObject({
      headline: GUIDE.titre,
      datePublished: GUIDE.publieLe,
      dateModified: GUIDE.misAJourLe,
      author: { "@id": editeur!["@id"] },
      image: `${url}/image`,
    });
    expect(page).toMatchObject({ "@id": url, reviewedBy: [{ "@type": "Person", name: "Alex Dupont", jobTitle: "relecteur de test" }], mainEntity: { "@id": article!["@id"] } });
    expect(fil).toMatchObject({
      itemListElement: [
        { position: 1, item: URL_SITE },
        { position: 2, name: "Guides", item: `${URL_SITE}/guides` },
        { position: 3, name: GUIDE.titre, item: url },
      ],
    });
    /* Pas de FAQPage : Google ne montre plus ce résultat, la FAQ reste en texte */
    expect(JSON.stringify(g)).not.toContain("FAQPage");
  });

  it("une entrée de la zone orange : son bloc d’aide, avec les numéros de src/contenu/aide.ts tels qu’ils sont, puis le bouton", async () => {
    const html = await pageDe(ENTREE);
    const t = texte(html);
    expect(t).toContain("Besoin d’en parler\u00a0?");
    expect(t).toContain(URGENCES);
    for (const l of LIGNES_D_ECOUTE) expect(html).toContain(`href="tel:${l.tel}"`);
    /* Les cinq lignes par situation, chacune à son lien (le 3018 aussi à son tchat), et ce qu’elles disent tel quel */
    for (const s of LIGNES_PAR_SITUATION) {
      expect(html).toContain(`href="${s.lien}"`);
      expect(t).toContain(s.pour);
      if ("tchat" in s) expect(html).toContain(`href="${s.tchat}"`);
    }
    expect(t.indexOf(URGENCES)).toBeLessThan(t.indexOf(ctaDe(null).label));
    expect(graphe(html).find((n) => n["@type"] === "BreadcrumbList")).toMatchObject({ itemListElement: [{}, { name: "Lexique" }, { name: ENTREE.titre }] });
  });

  it("la zone rouge : le bloc d’aide en tête, avant la réponse courte ; l’expert signe aussi ; l’appel n’est qu’un lien discret, sans bouton ni prix", () => {
    const rouge: Article = { ...GUIDE, zone: "rouge", expert: { nom: "Sam Martin", role: "psychologue (test)" } };
    const html = renderToStaticMarkup(createElement(PageArticle, { article: rouge, lies: liesDe(rouge) }) as ReactElement);
    const t = texte(html);
    expect(t.match(new RegExp(tel(URGENCES), "g"))).toHaveLength(1);
    expect(t.indexOf(URGENCES)).toBeLessThan(t.indexOf("La réponse courte"));
    expect(t.indexOf("relu par")).toBeLessThan(t.indexOf(URGENCES));
    /* Sous le titre de la page, le sien est un h2 : les titres se suivent sans sauter de marche */
    expect(html).toMatch(/<h2 id="[^"]+"[^>]*>.*?Besoin d’en parler/s);
    expect(t).toContain("relu par Alex Dupont, relecteur de test et Sam Martin, psychologue (test)");
    expect(t).toContain("Importe-la sur BLUSH");
    expect(t).not.toContain(ctaDe(null).label);
    expect(t).not.toContain(prixDe("rapport"));
  });

  it("les hubs : chaque article de la rubrique avec sa description, l’autre rubrique, et leurs données structurées", async () => {
    const hub = await import("@/app/guides/page");
    expect(hub.generateMetadata()).toMatchObject({ alternates: { canonical: "/guides" }, title: "Guides" });
    const html = renderToStaticMarkup(hub.default());
    const t = texte(html);
    expect(t).not.toMatch(SALE);
    expect(html).toMatch(/<h1[^>]*>Guides<\/h1>/);
    expect(html).toContain(`href="/guides/${GUIDE.slug}"`);
    expect(t).toContain(GUIDE.description);
    expect(html).toContain('href="/lexique"');
    expect(graphe(html).map((n) => n["@type"])).toEqual(["Organization", "WebSite", "CollectionPage", "BreadcrumbList"]);
    const lexique = renderToStaticMarkup((await import("@/app/lexique/page")).default());
    expect(lexique).toContain(`href="/lexique/${ENTREE.slug}"`);
    expect(lexique).toContain('href="/guides"');
  });

  it("/llms.txt : une partie par rubrique, son hub puis ses articles et leur description", async () => {
    const t = await (await import("@/app/llms.txt/route")).GET().text();
    expect(t).toContain(`## Guides\n\n- [Guides](${URL_SITE}/guides)\n- [${GUIDE.titre}](${URL_SITE}/guides/${GUIDE.slug}): ${GUIDE.description}`);
    expect(t).toContain(`## Lexique\n\n- [Lexique](${URL_SITE}/lexique)\n- [${ENTREE.titre}](${URL_SITE}/lexique/${ENTREE.slug}): ${ENTREE.description}`);
  });
});
