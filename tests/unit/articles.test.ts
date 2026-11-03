import { describe, expect, it } from "vitest";
import { ARTICLES } from "@/contenu/articles";
import type { Article, BlocArticle, Jour } from "@/contenu/articles/types";
import { ENTREE_D_EXEMPLE, EXEMPLES, GUIDE_D_EXEMPLE } from "@/app/apercu/guide/exemples";
import { fautesDeLArticle, fautesDuRegistre, nombreDeMots, ressemblance, RESSEMBLANCE_MAX, semaineIso } from "../aide/articles";

/*
 * Les garde-fous des articles (tests/aide/articles.ts), appliqués au registre de production (src/contenu/articles) : un
 * article qui enfreint une règle de la charte fait échouer `npm run check`, donc la CI, avant toute mise en ligne. Chaque
 * règle est prouvée ici sur un article de test fautif, tiré des exemples des aperçus (src/app/apercu/guide/exemples.ts)
 * et signé par une personne inventée : un seul défaut à la fois, et le message qu’il fait lire à qui écrit.
 */

/** Une personne de test, inventée : un prénom, un nom et un rôle. */
const RELECTEUR = { nom: "Alex Dupont", role: "relecteur de test" };

/** Un exemple, signé par la personne de test : un article qui passe toutes les règles. */
const signe = (a: Article): Article => ({ ...a, relecteur: RELECTEUR });
const GUIDE = signe(GUIDE_D_EXEMPLE);
const ENTREE = signe(ENTREE_D_EXEMPLE);

/** Le guide de test, avec un morceau de plus au bout de sa première section. */
const avecBloc = (bloc: BlocArticle, a: Article = GUIDE): Article => ({
  ...a,
  sections: a.sections.map((s, k) => (k === 0 ? { ...s, blocs: [...s.blocs, bloc] } : s)),
});
/** Le guide de test, avec un paragraphe de plus. */
const avecTexte = (texte: string) => avecBloc({ type: "paragraphe", texte });

describe("les garde-fous des articles", () => {
  it("le registre de production les passe tous (vide tant qu’aucun article n’est signé)", () => {
    expect(fautesDuRegistre(ARTICLES)).toEqual([]);
  });

  it("les exemples des aperçus suivent toutes les règles, sauf la signature : publiés tels quels, ils seraient refusés", () => {
    expect(fautesDuRegistre(EXEMPLES, { exemple: true })).toEqual([]);
    expect(fautesDuRegistre(EXEMPLES).filter((f) => f.includes("relecteur est vide"))).toHaveLength(2);
  });

  it("deux articles signés, sourcés, liés l’un à l’autre : aucune faute", () => {
    expect(fautesDuRegistre([GUIDE, ENTREE])).toEqual([]);
  });

  describe("la marque", () => {
    it.each([
      ["« une IA »", avecTexte("Une IA ne lit pas tes messages comme toi.")],
      ["« l’IA » dans une bulle", avecBloc({ type: "blush", bulles: ["l’ia a lu ta conv"] })],
      ["« IA » seul, dans le titre", { ...GUIDE, titre: "Analyse de conv par IA\u00a0: le délai" }],
      ["« intelligence artificielle »", avecTexte("Une intelligence artificielle lit la conv.")],
    ])("refuse %s", (_, a) => {
      expect(fautesDeLArticle(a)).toEqual([expect.stringContaining("« IA »")]);
    });

    it.each(["Claude", "Anthropic", "ElevenLabs", "Mistral", "OpenAI", "GPT", "ChatGPT", "GPT-5"])("refuse le nom d’un prestataire d’IA : %s", (nom) => {
      expect(fautesDeLArticle(avecTexte(`Le texte est lu par ${nom} avant toi.`))).toEqual([expect.stringContaining("prestataire d’IA")]);
    });

    it("refuse « situationship » (on dit « crush »)", () => {
      expect(fautesDeLArticle(avecTexte("Dans une situationship, on se cherche."))).toEqual([expect.stringContaining("« crush »")]);
    });

    it("refuse « ta conv WhatsApp » seul, pas la liste de toutes les sources", () => {
      expect(fautesDeLArticle(avecTexte("Importe ta conv WhatsApp et regarde."))).toEqual([expect.stringContaining("« ta conv WhatsApp » seul")]);
      expect(fautesDeLArticle(avecTexte("Importe tes captures, un enregistrement d’écran ou ta conv WhatsApp en export."))).toEqual([]);
      expect(fautesDeLArticle(avecTexte("Un export Instagram ou WhatsApp se lit pareil."))).toEqual([]);
    });

    it("refuse « verdict gratuit », « satisfait ou remboursé » et un prix écrit à la main", () => {
      expect(fautesDeLArticle(avecTexte("Ton verdict gratuit arrive vite."))).toEqual([expect.stringContaining("« verdict gratuit »")]);
      expect(fautesDeLArticle(avecTexte("Satisfait ou remboursé, toujours."))).toEqual([expect.stringContaining("« satisfait ou remboursé »")]);
      expect(fautesDeLArticle(avecTexte("Le rapport coûte 9,90 € seulement."))).toEqual([expect.stringContaining("un prix écrit à la main")]);
      expect(fautesDeLArticle(avecTexte("Moins de 10 euros pour savoir."))).toEqual([expect.stringContaining("un prix écrit à la main")]);
      /* Un nombre sans monnaie reste permis */
      expect(fautesDeLArticle(avecTexte("Il a mis 3 jours à répondre."))).toEqual([]);
    });

    it("BLUSH parle en minuscules, sans point final", () => {
      expect(fautesDeLArticle(avecBloc({ type: "blush", bulles: ["Il répond vite"] }))).toEqual([expect.stringContaining("en minuscules")]);
      expect(fautesDeLArticle(avecBloc({ type: "blush", bulles: ["il répond vite."] }))).toEqual([expect.stringContaining("sans point")]);
    });
  });

  describe("les sujets sensibles", () => {
    it.each([
      "Tu peux espionner son compte.",
      "Pour le localiser, il y a des applis.",
      "Tu as le droit de lire ses messages.",
      "Fouiller son téléphone ne sert à rien.",
      "Un logiciel espion le dirait.",
    ])("refuse la surveillance : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("surveill")]);
    });

    it.each(["C’est un pervers narcissique.", "Elle est sûrement bipolaire.", "Un profil borderline."])("refuse un diagnostic : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("un diagnostic")]);
    });

    it.each(["Patiente, il reviendra.", "Un résultat garanti.", "Ça marche à 100 % des fois."])("refuse une promesse : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("une promesse")]);
    });

    it("la zone rouge : un expert, et le bloc d’aide en tête ; un mot de la zone rouge l’exige", () => {
      const rouge = { ...GUIDE, zone: "rouge" } as const satisfies Article;
      expect(fautesDeLArticle(rouge)).toEqual([expect.stringContaining("zone rouge sans expert"), expect.stringContaining("zone rouge sans bloc d’aide en tête")]);
      const enRegle: Article = { ...avecBloc({ type: "aide" }, rouge), expert: { nom: "Sam Martin", role: "psychologue (test)" } };
      expect(fautesDeLArticle(enRegle)).toEqual([]);
      expect(fautesDeLArticle(avecTexte("Le chantage n’est jamais de l’amour."))).toEqual([expect.stringContaining("sujet de la zone rouge")]);
    });

    it("la zone orange a son bloc d’aide", () => {
      const sansAide: Article = { ...ENTREE, sections: ENTREE.sections.map((s) => ({ ...s, blocs: s.blocs.filter((b) => b.type !== "aide") })) };
      expect(fautesDeLArticle(sansAide)).toEqual([expect.stringContaining("zone orange sans bloc d’aide")]);
    });
  });

  describe("la signature, les sources, les dates", () => {
    it.each([
      ["vide", { nom: "", role: "" }],
      ["sans nom de famille", { nom: "Alex", role: "relecteur" }],
      ["sans rôle", { nom: "Alex Dupont", role: " " }],
      ["un tiret", { nom: "—", role: "relecteur" }],
    ])("refuse un relecteur %s", (_, relecteur) => {
      expect(fautesDeLArticle({ ...GUIDE, relecteur })).toEqual([expect.stringContaining("relecteur est vide")]);
    });

    it("refuse moins de 2 sources datées (une seule, sans date, sans adresse), et plus de 5", () => {
      const [une, deux] = GUIDE.sources;
      expect(fautesDeLArticle({ ...GUIDE, sources: [une!] })).toEqual([expect.stringContaining("1 source(s) datée(s)")]);
      expect(fautesDeLArticle({ ...GUIDE, sources: [une!, { ...deux!, consulteLe: "2026-02-31" }] })).toEqual([expect.stringContaining("1 source(s) datée(s)")]);
      expect(fautesDeLArticle({ ...GUIDE, sources: [une!, { ...deux!, url: "pas une adresse" }] })).toEqual([expect.stringContaining("1 source(s) datée(s)")]);
      const six = Array.from({ length: 6 }, (_, k) => ({ ...une!, url: `https://example.com/${k}` }));
      expect(fautesDeLArticle({ ...GUIDE, sources: six })).toEqual([expect.stringContaining("5 au plus")]);
    });

    it("« mis à jour le » ne bouge que sur un changement de fond déclaré", () => {
      expect(fautesDeLArticle({ ...GUIDE, misAJourLe: "2026-11-10" })).toEqual([expect.stringContaining("n’est pas le jour du dernier changement de fond")]);
      expect(fautesDeLArticle({ ...GUIDE, misAJourLe: "2026-11-10", changements: [...GUIDE.changements, { le: "2026-11-10", quoi: "Une section sur les stories" }] })).toEqual([]);
      expect(fautesDeLArticle({ ...GUIDE, changements: [] })).toEqual([expect.stringContaining("aucun changement de fond")]);
    });

    it("la réponse courte fait de 40 à 60 mots", () => {
      expect(nombreDeMots(GUIDE.reponseCourte)).toBeGreaterThanOrEqual(40);
      expect(fautesDeLArticle({ ...GUIDE, reponseCourte: "Trop court pour se lire seul." })).toEqual([expect.stringContaining("la réponse courte fait 6 mots")]);
      expect(fautesDeLArticle({ ...GUIDE, reponseCourte: `${GUIDE.reponseCourte} ${GUIDE.reponseCourte}` })).toEqual([expect.stringContaining("de 40 à 60")]);
    });
  });

  describe("le registre entier", () => {
    it("un mot-clé principal par article (accents et majuscules comptent pareil), un slug par article", () => {
      const meme = { ...ENTREE, motCle: "Il met du temps a repondre" };
      expect(fautesDuRegistre([GUIDE, meme])).toEqual([expect.stringContaining("un seul article par mot-clé")]);
      expect(fautesDuRegistre([GUIDE, { ...ENTREE, slug: GUIDE.slug, lies: [] }])).toContainEqual(expect.stringContaining("est pris 2 fois"));
    });

    it("un lien vers un article qui n’existe pas, ou une page que rien ne lie, est refusé", () => {
      expect(fautesDuRegistre([{ ...GUIDE, lies: ["nulle-part"] }])).toEqual([expect.stringContaining("n’est pas dans le registre")]);
      /* Seul, un article est lié par son hub ; si le hub ne le listait pas, ni un autre article : orphelin */
      expect(fautesDuRegistre([{ ...GUIDE, lies: [] }])).toEqual([]);
      expect(
        fautesDuRegistre(
          [
            { ...GUIDE, lies: [] },
            { ...ENTREE, lies: [] },
          ],
          { hubs: { guide: [], lexique: [ENTREE.slug] } },
        ),
      ).toEqual([expect.stringContaining(`« ${GUIDE.slug} » est une page orpheline`)]);
    });

    it("au plus 5 publications par semaine (du lundi au dimanche)", () => {
      expect([semaineIso("2026-11-02"), semaineIso("2026-11-08"), semaineIso("2026-11-09"), semaineIso("2027-01-01")]).toEqual(["2026-W45", "2026-W45", "2026-W46", "2026-W53"]);
      /* Du mardi 3 au dimanche 8 novembre 2026 */
      const jours: Jour[] = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
      const six = jours.map((jour, k): Article => ({
        ...GUIDE,
        slug: `guide-${k}`,
        motCle: `mot ${k}`,
        publieLe: jour,
        misAJourLe: jour,
        changements: [{ le: jour, quoi: "Publication" }],
      }));
      expect(fautesDuRegistre(six)).toContainEqual(expect.stringContaining("6 publications la semaine 2026-W45, 5 au plus"));
      expect(fautesDuRegistre(six.slice(0, 5)).filter((f) => f.includes("publications"))).toEqual([]);
    });

    it("deux textes semblables à plus de 50 % (Jaccard sur les trigrammes de mots) sont refusés", () => {
      expect(ressemblance(GUIDE, ENTREE)).toBeLessThan(0.1);
      expect(ressemblance(GUIDE, GUIDE)).toBe(1);
      const copie: Article = {
        ...GUIDE,
        slug: "il-repond-lentement",
        motCle: "il répond lentement",
        titre: "Il répond lentement\u00a0: à partir de quand ça veut dire quelque chose",
      };
      expect(ressemblance(GUIDE, copie)).toBeGreaterThan(RESSEMBLANCE_MAX);
      expect(fautesDuRegistre([GUIDE, copie])).toContainEqual(expect.stringMatching(/se ressemblent à \d+ %/));
    });
  });
});
