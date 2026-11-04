import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ctaDe } from "@/components/landing/cta";
import { LIGNES_D_ECOUTE, LIGNES_PAR_SITUATION, NUMEROS_D_URGENCE, URGENCES } from "@/contenu/aide";
import { ARTICLES, liesDe } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { EDITEUR } from "@/contenu/mentions-legales";
import { prixDe } from "@/contenu/offres";
import { jourEnLettres } from "@/lib/format";
import { minutesDeLecture } from "@/components/article/lecture";
import { PageArticle } from "@/components/article/PageArticle";
import { donneesDeLArticle } from "@/lib/donnees-structurees";
import { PAGES_PUBLIQUES, pagesPubliques } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { aPlat } from "../aide/articles";
import { verifierLesPagesPubliques } from "../aide/referencement";

/*
 * Les pages des guides et du lexique (src/app/guides, src/app/lexique, src/components/article) avec un registre qui a
 * des articles : les deux exemples des aperçus (src/app/apercu/guide/exemples.ts), validés un jour de test, à la place
 * du registre de production. Les routes telles que Next les appelle
 * (generateStaticParams, generateMetadata, la page, l’image), rendues comme par le serveur : le gabarit de la charte,
 * les données structurées, le plan du site et /llms.txt.
 */

vi.mock("@/contenu/articles", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/contenu/articles")>();
  const { EXEMPLES } = await import("@/app/apercu/guide/exemples");
  const registre: readonly Article[] = EXEMPLES.map((a): Article => ({ ...a, valideLe: "2026-11-02" }));
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

/**
 * Le texte de chaque titre de ce niveau (h1, h2…) d’une page rendue, tel que le lisent les moteurs : ses balises
 * retirées sans rien ajouter (les bulles et les groupes insécables du gabarit n’y changent rien), ses entités lues.
 */
const titres = (html: string, niveau: "h1" | "h2" | "h3") =>
  [...html.matchAll(new RegExp(`<${niveau}[^>]*>(.*?)</${niveau}>`, "gs"))].map(([, dedans]) =>
    dedans!
      .replace(/<!--.*?-->/gs, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"'),
  );

/** Le HTML d’un élément de la page, de sa balise d’ouverture (`debut`) à la première balise `fin` qui suit. */
const element = (html: string, debut: string, fin: string) => {
  const k = html.indexOf(debut);
  return k < 0 ? "" : html.slice(k, html.indexOf(fin, k) + fin.length);
};

/** Le graphe des données structurées d’une page rendue. */
const graphe = (html: string) => (JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": Record<string, unknown>[] })["@graph"];

const SALE = /NaN|Infinity|undefined|\[object/;

/** Un texte, lu tel quel dans une regex. */
const tel = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const [GUIDE, ENTREE] = ARTICLES as [Article, Article];

/** L’expert de test d’une page rouge, inventé. */
const EXPERT = { nom: "Sam Martin", role: "psychologue (test)" };

/** Le guide de test passé en zone rouge, avec son expert. */
const ROUGE: Article = { ...GUIDE, zone: "rouge", expert: EXPERT };
/** La page rouge, rendue par le gabarit (aucune route n’en a). */
const pageRouge = () => renderToStaticMarkup(createElement(PageArticle, { article: ROUGE, lies: liesDe(ROUGE) }) as ReactElement);

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
    expect(pages.map((p) => p.chemin).slice(PAGES_PUBLIQUES.length)).toEqual(["/guides", "/guides/il-met-du-temps-a-repondre", "/lexique", "/lexique/ghosting"]);
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
    /* Un seul h1, au texte du registre, deux-points compris : les bulles du titre (la situation en rose, l’action en
       bleu) ne font que l’habiller. Le thème le surmonte. */
    expect(titres(html, "h1")).toEqual([GUIDE.titre]);
    const h1 = element(html, "<h1", "</h1>");
    for (const mots of [GUIDE.surligne.situation, GUIDE.surligne.action]) expect(h1, mots).toMatch(new RegExp(`<span class="[^"]*rotate[^"]*">${tel(mots)}</span>`));
    expect(t).toMatch(new RegExp(`${tel(GUIDE.theme)} .*${tel(GUIDE.titre.slice(0, 12))}`));
    expect(t).toContain("Par l’équipe BLUSH · mis à jour le 3 novembre 2026 · Notre méthode");
    /* Le lien vers /methode vient du gabarit, dans la signature (charte, règle 15), et l’historique dit chaque changement de fond, daté */
    expect(html).toMatch(/mis à jour le .*?<a [^>]*href="\/methode"[^>]*>Notre méthode<\/a>/s);
    /* La fiche du guide : l’équipe et sa méthode, la mise à jour, les sources, les exemples inventés (sous les sources, comme /methode le dit), l’historique */
    const [publication] = GUIDE.changements;
    expect(t).toMatch(/La fiche du guide .* Écrit par L’équipe BLUSH · Notre méthode Mis à jour 3 novembre 2026 Sources .* Exemples Les convs de cette page sont inventées/);
    expect(t).toContain(`Historique ${jourEnLettres(publication!.le, { annee: true })} · ${publication!.quoi}`);
    /* Le pied mène aux pages de confiance, puis aux pages légales */
    expect(html).toMatch(/<nav aria-label="À propos de BLUSH"[^>]*>.*href="\/a-propos".*href="\/methode".*href="\/aide".*<\/nav>/s);
    expect(t).toContain(`La réponse courte ${GUIDE.reponseCourte}`);
    /* Les intertitres : chaque question en h2, avec son ancre, dans l’ordre, entre la réponse courte et la FAQ */
    const h2 = titres(html, "h2");
    expect(h2.slice(h2.indexOf("La réponse courte"), h2.indexOf("Les questions qu’on se pose") + 1)).toEqual([
      "La réponse courte",
      ...GUIDE.sections.map((s) => s.question),
      "Les questions qu’on se pose",
    ]);
    const intertitres = [...html.matchAll(/<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/gs)].map(([, id, dedans]) => ({ id: id!, texte: titres(`<h2>${dedans!}</h2>`, "h2")[0] }));
    const ancreDe = (question: string) => intertitres.find((h) => h.texte === question)?.id;
    for (const s of GUIDE.sections) expect(ancreDe(s.question), s.question).toMatch(/^[a-z0-9-]+$/);
    /* « Dans ce guide » : ses chiffres, puis un lien vers chaque intertitre, dans l’ordre (son ancre), et la FAQ */
    const sommaire = element(html, '<ol data-sommaire=""', "</ol>");
    expect([...sommaire.matchAll(/href="#([a-z0-9-]+)"/g)].map(([, a]) => a)).toEqual([...GUIDE.sections.map((s) => ancreDe(s.question)), "questions"]);
    expect(t).toContain(`Dans ce guide ${minutesDeLecture(GUIDE)}\u00a0min de lecture · ${GUIDE.sections.length}\u00a0questions`);
    /* Chaque mini-conv : « La conv », sa pastille « exemple inventé » (une seule), « Ce que ça montre » et sa légende ; la
       couverture et la carte du guide lié, qui reprennent une conv, ont aussi la leur, en décor (écrite par le CSS) */
    const convs = GUIDE.sections.flatMap((s) => s.blocs.flatMap((b) => (b.type === "conv" ? [b] : [])));
    const blocsDeFigures = [...html.matchAll(/<figure data-conv=""[^>]*>(.*?)<\/figure>/gs)].map(([, f]) => f!);
    const figures = blocsDeFigures.map(texte);
    expect(figures).toHaveLength(convs.length);
    for (const [k, f] of figures.entries()) {
      expect(f.match(/exemple inventé/g), f).toHaveLength(1);
      expect(f).toContain("La conv");
      if (convs[k]!.legende) expect(f).toContain(`Ce que ça montre ${convs[k]!.legende}`);
    }
    expect(element(html, '<section aria-labelledby="plus-loin"', "</section>").match(/data-t="exemple inventé"/g)).toHaveLength(1);
    const une = element(html, "<article><header", "</header>");
    expect(une).toContain('data-couverture=""');
    expect(une.match(/data-t="exemple inventé"/g)).toHaveLength(1);
    /* La couverture ne redit rien dans le texte de la page : il passe de la signature à la réponse courte, et sa conv
       reste à plat dans l’article (le même téléphone ne revient pas), les autres dans un téléphone sur un ordinateur */
    expect(texte(une).match(/exemple inventé/g)).toBeNull();
    expect(t).toContain("Notre méthode La réponse courte");
    expect(blocsDeFigures.filter((f) => !f.includes("ordi:rounded-t-[54px]"))).toHaveLength(1);
    expect(t).toContain("Les convs de cette page sont inventées");
    /* La bulle de BLUSH est dessinée une fois, et reprise partout par <use> */
    expect(html.match(/id="bulle-blush"/g)).toHaveLength(1);
    expect(html.match(/<use href="#bulle-blush"/g)!.length).toBeGreaterThan(3);
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
    /* Sous le titre de la fin rose, la phrase de BLUSH, une seule fois dans la page (le pied ne la redit pas) */
    expect(t).toContain(`Tu veux savoir pour toi\u00a0? ${PHRASE_D_IDENTITE} ${cta.label}`);
    expect(t.split(PHRASE_D_IDENTITE)).toHaveLength(2);
    /* Les liés, les sources datées, le fil d’Ariane */
    expect(html).toContain(`href="/lexique/${ENTREE.slug}"`);
    for (const s of GUIDE.sources) expect(t).toContain(`${s.titre} , consultée le 3 novembre 2026`);
    /* Le fil d’Ariane, dans la barre du haut : BLUSH (la landing), puis la rubrique ; le guide, c’est le titre dessous */
    const fil = element(html, '<nav aria-label="Fil d’Ariane"', "</nav>");
    expect(fil).toMatch(/<a [^>]*href="\/"[^>]*>.*?blush.*?<\/a>.*<a [^>]*href="\/guides"[^>]*>Guides<\/a>/s);
    expect(fil).toContain('aria-label="blush, accueil"');
    /* Ni le bloc d’aide (zone verte), ni rien de la landing (ses îlots, la note des avis) */
    expect(t).not.toContain(URGENCES);
    expect(html).not.toContain("#avis-titre");
  });

  it("ses données structurées : l’article de l’éditeur BLUSH, sa page et le jour de sa validation, son fil d’Ariane", async () => {
    const g = graphe(await pageDe(GUIDE));
    expect(g.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebPage", "Article", "BreadcrumbList"]);
    const [editeur, , page, article, fil] = g;
    const url = `${URL_SITE}/guides/${GUIDE.slug}`;
    expect(article).toMatchObject({
      headline: GUIDE.titre,
      datePublished: GUIDE.publieLe,
      dateModified: GUIDE.misAJourLe,
      author: { "@id": editeur!["@id"] },
      publisher: { "@id": editeur!["@id"] },
      image: `${url}/image`,
      articleSection: GUIDE.theme,
    });
    expect(editeur).toMatchObject({ "@type": "Organization", name: "BLUSH" });
    /* La validation, datée, sans personne : ni relecteur ni Person (seul l’expert d’une page rouge en est une) */
    expect(page).toMatchObject({ "@id": url, lastReviewed: "2026-11-02", mainEntity: { "@id": article!["@id"] } });
    expect(page).not.toHaveProperty("reviewedBy");
    expect(JSON.stringify(g)).not.toContain("Person");
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
    /* Les urgences à un toucher, comme sur /aide : un bouton par numéro de la phrase */
    for (const n of Object.values(NUMEROS_D_URGENCE)) {
      expect(html, n).toContain(`href="tel:${n}"`);
      expect(t, n).toContain(`Appeler le ${n}`);
    }
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

  it("la zone rouge : sobre partout, le bloc d’aide en tête, avant la réponse courte ; l’expert signe aussi ; l’appel n’est qu’un lien discret, sans bouton ni prix", () => {
    const html = pageRouge();
    const t = texte(html);
    expect(t.match(new RegExp(tel(URGENCES), "g"))).toHaveLength(1);
    expect(t.indexOf(URGENCES)).toBeLessThan(t.indexOf("La réponse courte"));
    expect(t.indexOf("relu par")).toBeLessThan(t.indexOf(URGENCES));
    for (const n of Object.values(NUMEROS_D_URGENCE)) expect(html, n).toContain(`href="tel:${n}"`);
    /* Ni couverture, ni bulle dans le titre (son texte reste celui du registre), ni autocollant rose pour BLUSH */
    expect(html).not.toContain("data-couverture");
    expect(titres(html, "h1")).toEqual([ROUGE.titre]);
    expect(element(html, "<h1", "</h1>")).not.toMatch(/rotate|text-white/);
    expect(html).toContain("BLUSH\u00a0: ");
    expect(html).not.toContain("-rotate-[1.5deg]");
    /* Le bloc d’aide est dans la une, à côté du titre : le surtitre rouge de /aide, puis son titre */
    expect(element(html, "<article><header", "</header>")).toContain(`En danger, tout de suite`);
    /* Sous le titre de la page, le sien est un h2 : les titres se suivent sans sauter de marche */
    expect(html).toMatch(/<h2 id="[^"]+"[^>]*>.*?Besoin d’en parler/s);
    expect(t).toContain("Par l’équipe BLUSH · relu par Sam Martin, psychologue (test) · mis à jour le 3 novembre 2026 · Notre méthode");
    /* Ses données structurées : l’expert relit la page (une Person), l’article reste celui de l’éditeur */
    const [, , page, article] = donneesDeLArticle(ROUGE, URL_SITE)["@graph"];
    expect(page).toMatchObject({ reviewedBy: { "@type": "Person", name: EXPERT.nom, jobTitle: EXPERT.role }, lastReviewed: "2026-11-02" });
    expect(article).toMatchObject({ author: { "@id": `${URL_SITE}/#editeur` }, publisher: { "@id": `${URL_SITE}/#editeur` } });
    expect(t).toContain("Importe-la sur BLUSH");
    expect(t).not.toContain(ctaDe(null).label);
    expect(t).not.toContain(prixDe("rapport"));
  });

  it("aucune page d’article, verte, orange ou rouge, ni ses données structurées ne nomme le directeur de la publication ; « relu par » n’y signe que l’expert d’une page rouge", async () => {
    const nom = aPlat(EDITEUR.directeurPublication);
    expect(nom.trim()).not.toBe("");
    /* Le vert et l’orange par leur route (la page et le JSON-LD qu’elle porte), le rouge par le gabarit et ses données structurées */
    const vert = await pageDe(GUIDE);
    const orange = await pageDe(ENTREE);
    const pages: { zone: Article["zone"]; a: Article; html: string; donnees: unknown }[] = [
      { zone: "verte", a: GUIDE, html: vert, donnees: graphe(vert) },
      { zone: "orange", a: ENTREE, html: orange, donnees: graphe(orange) },
      { zone: "rouge", a: ROUGE, html: pageRouge(), donnees: donneesDeLArticle(ROUGE, URL_SITE)["@graph"] },
    ];
    for (const { zone, a, html, donnees } of pages) {
      expect(a.zone).toBe(zone);
      const jsonLd = JSON.stringify(donnees);
      /* Nulle part : ni le texte, ni un attribut, ni le JSON-LD (en capitales, sans accents, une insécable au milieu, pareil) */
      expect(aPlat(html), zone).not.toContain(nom);
      expect(aPlat(jsonLd), zone).not.toContain(nom);
      expect(jsonLd, zone).not.toMatch(/relu par/i);
      expect(html.match(/relu par/gi) ?? [], zone).toHaveLength(a.expert ? 1 : 0);
      expect(
        (texte(html).match(/relu par [^·]*/gi) ?? []).map((r) => r.trim()),
        zone,
      ).toEqual(a.expert ? [`relu par ${a.expert.nom}, ${a.expert.role}`] : []);
    }
  });

  it("les hubs : chaque article de la rubrique avec sa description, l’autre rubrique, et leurs données structurées", async () => {
    const hub = await import("@/app/guides/page");
    expect(hub.generateMetadata()).toMatchObject({ alternates: { canonical: "/guides" }, title: "Guides" });
    const html = renderToStaticMarkup(hub.default());
    const t = texte(html);
    expect(t).not.toMatch(SALE);
    expect(titres(html, "h1")).toEqual(["Guides"]);
    /* La une : le guide le plus récent, son titre en h2, sa couverture ; les autres en cartes */
    expect(t).toContain(`À la une · ${GUIDE.theme}`);
    expect(titres(html, "h2")).toContain(GUIDE.titre);
    expect(html).toContain('data-couverture=""');
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
