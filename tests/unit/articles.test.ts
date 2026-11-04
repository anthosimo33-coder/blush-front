import { describe, expect, it } from "vitest";
import { ARTICLES } from "@/contenu/articles";
import type { Article, BlocArticle, Jour } from "@/contenu/articles/types";
import { EDITEUR } from "@/contenu/mentions-legales";
import { ENTREE_D_EXEMPLE, EXEMPLES, GUIDE_D_EXEMPLE, GUIDE_ORANGE_D_EXEMPLE, GUIDE_ROUGE_D_EXEMPLE } from "@/app/apercu/guide/exemples";
import { fautesDeLArticle, fautesDuRegistre, nombreDeMots, ressemblance, RESSEMBLANCE_MAX, semaineIso, SURLIGNE_MAX } from "../aide/articles";

/*
 * Les garde-fous des articles (tests/aide/articles.ts), appliqués au registre de production (src/contenu/articles) : un
 * article qui enfreint une règle de la charte fait échouer `npm run check`, donc la CI, avant toute mise en ligne. Chaque
 * règle est prouvée ici sur un article de test fautif, tiré des exemples des aperçus (src/app/apercu/guide/exemples.ts)
 * et validé un jour de test : un seul défaut à la fois, et le message qu’il fait lire à qui écrit.
 */

/** Le jour de validation de test : celui de la publication des exemples, au plus tard leur mise à jour. */
const VALIDE_LE: Jour = "2026-11-03";

/** Un exemple, validé le jour de test : un article qui passe toutes les règles. */
const signe = (a: Article): Article => ({ ...a, valideLe: VALIDE_LE });
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

  it("les exemples des aperçus suivent toutes les règles, sauf la validation datée : publiés tels quels, ils seraient refusés", () => {
    expect(fautesDuRegistre(EXEMPLES, { exemple: true })).toEqual([]);
    expect(fautesDuRegistre(EXEMPLES)).toEqual([expect.stringContaining("n’est pas un vrai jour"), expect.stringContaining("n’est pas un vrai jour")]);
  });

  it("deux articles signés, sourcés, liés l’un à l’autre : aucune faute", () => {
    expect(fautesDuRegistre([GUIDE, ENTREE])).toEqual([]);
  });

  it("les guides d’exemple des zones orange et rouge (/apercu/guide?zone=…) suivent aussi toutes les règles, sauf la validation datée", () => {
    expect(fautesDeLArticle(GUIDE_ORANGE_D_EXEMPLE, { exemple: true })).toEqual([]);
    expect(fautesDeLArticle(GUIDE_ROUGE_D_EXEMPLE, { exemple: true })).toEqual([]);
  });

  describe("le thème et les mots surlignés du titre", () => {
    it.each([
      ["vide", ""],
      ["de quatre mots", "Les silences et délais"],
      ["sans majuscule", "les silences"],
      ["fini par un point", "Les silences."],
      ["fini par une espace", "Les silences "],
    ])("refuse un thème %s : un surtitre de un à trois mots", (_, theme) => {
      expect(fautesDeLArticle({ ...GUIDE, theme })).toEqual([expect.stringContaining("le thème")]);
    });

    it("refuse un thème absent (un article mal fusionné, ou lu d’ailleurs)", () => {
      const sans: Partial<Article> = { ...GUIDE };
      delete sans.theme;
      expect(fautesDeLArticle(sans as Article)).toEqual([expect.stringContaining("le thème")]);
    });

    it("le thème est un texte affiché : les règles de la marque le lisent", () => {
      expect(fautesDeLArticle({ ...GUIDE, theme: "Lu par IA" })).toEqual([expect.stringContaining("« IA »")]);
    });

    it.each<[string, Partial<Article["surligne"]>, string]>([
      ["sans situation", { action: "quoi faire" }, "pas la situation (rose) à surligner"],
      ["sans action", { situation: "met du temps" }, "pas l’action (bleue) à surligner"],
      ["une situation absente du titre", { situation: "ne répond plus", action: "quoi faire" }, "n’est pas un morceau exact du titre"],
      ["une action qui n’est pas en mots entiers", { situation: "met du temps", action: "oi faire" }, "coupe un mot du titre"],
      ["une situation entourée d’espaces", { situation: " met du temps", action: "quoi faire" }, "commence ou finit par une espace"],
      ["une action qui passe les deux-points", { situation: "met du temps", action: "répondre\u00a0: à partir" }, "passe par les deux-points"],
      ["une action trop longue pour une ligne du téléphone", { situation: "met du temps", action: "ça veut dire quelque chose" }, `${SURLIGNE_MAX} au plus`],
      ["deux morceaux qui se chevauchent", { situation: "met du temps", action: "temps à répondre" }, "se chevauchent"],
    ])("refuse %s", (_, surligne, faute) => {
      /* Le type exige les deux ; un article mal fusionné, ou lu d’ailleurs, peut en avoir perdu un */
      expect(fautesDeLArticle({ ...GUIDE, surligne: surligne as Article["surligne"] })).toEqual([expect.stringContaining(faute)]);
    });

    it("refuse un morceau surligné qui revient deux fois dans le titre : le surligneur ne saurait pas lequel", () => {
      const titre = "Il répond, puis il ne répond plus\u00a0: ce que ça veut dire, et quoi faire";
      expect(fautesDeLArticle({ ...GUIDE, titre, surligne: { situation: "répond", action: "quoi faire" } })).toEqual([expect.stringContaining("revient deux fois")]);
      expect(fautesDeLArticle({ ...GUIDE, titre, surligne: { situation: "ne répond plus", action: "quoi faire" } })).toEqual([]);
    });
  });

  describe("la marque", () => {
    it.each([
      ["« une IA »", avecTexte("Une IA ne lit pas tes messages comme toi.")],
      ["« l’IA » dans une bulle", avecBloc({ type: "blush", bulles: ["l’ia a lu ta conv"] })],
      ["« IA » seul, dans le titre", { ...GUIDE, titre: "Analyse de conv par IA\u00a0: le délai", surligne: { situation: "Analyse de conv", action: "le délai" } }],
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
      expect(fautesDeLArticle(avecTexte("Importe tes captures d’écran ou ta conv WhatsApp en export."))).toEqual([]);
      expect(fautesDeLArticle(avecTexte("Un export Instagram ou WhatsApp se lit pareil."))).toEqual([]);
    });

    it.each([
      "Ton verdict gratuit arrive vite.",
      "Ton verdict est gratuit.",
      "Offert, le rapport complet.",
      "Importer ta conv sur BLUSH ne coûte rien.",
      "La lecture se fait sans payer.",
    ])("refuse une gratuité écrite à la main : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("« verdict gratuit »")]);
    });

    it.each(["Satisfait ou remboursé, toujours.", "Satisfaite ou remboursée, toujours."])("refuse %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("« satisfait ou remboursé »")]);
    });

    it.each(["Le rapport coûte 9,90 € seulement.", "Moins de 10 euros pour savoir.", "Le rapport à €9,90 seulement.", "EUR 10 pour savoir."])(
      "refuse un prix écrit à la main : %s",
      (texte) => {
        expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("un prix écrit à la main")]);
      },
    );

    it.each([
      "Il a mis 3 jours à répondre.",
      "Leur 2 messages du soir se ressemblent.",
      "Une remarque gratuite fait mal.",
      "Il t’a offert des fleurs.",
      "Le verdict tombe vite. Il t’a offert un verre, et puis plus rien.",
    ])("laisse passer un nombre sans monnaie, et « gratuit » ou « offert » loin de ce que vend BLUSH : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([]);
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
      "Regarde sa localisation sur Snap Map.",
    ])("refuse la surveillance : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("surveill")]);
    });

    it.each(["C’est un pervers narcissique.", "Elle est sûrement bipolaire.", "Un profil borderline."])("refuse un diagnostic : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("un diagnostic")]);
    });

    it.each(["Patiente, il reviendra.", "Un résultat garanti.", "BLUSH te le garantit.", "Ça marche à 100 % des fois."])("refuse une promesse : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("une promesse")]);
    });

    it("la zone rouge : un expert ; le bloc d’aide, la page le met elle-même en tête (pas un second dans une section)", () => {
      const rouge = { ...GUIDE, zone: "rouge" } as const satisfies Article;
      expect(fautesDeLArticle(rouge)).toEqual([expect.stringContaining("zone rouge sans expert")]);
      const enRegle: Article = { ...rouge, expert: { nom: "Sam Martin", role: "psychologue (test)" } };
      expect(fautesDeLArticle(enRegle)).toEqual([]);
      expect(fautesDeLArticle(avecBloc({ type: "aide" }, enRegle))).toEqual([expect.stringContaining("la page met déjà le bloc d’aide en tête")]);
    });

    it.each([
      ["vide", { nom: "", role: "" }],
      ["sans nom de famille", { nom: "Alex", role: "psychologue (test)" }],
      ["sans rôle", { nom: "Alex Dupont", role: " " }],
      ["un tiret", { nom: "—", role: "psychologue (test)" }],
    ])("refuse en zone rouge un expert %s : il signe « relu par », prénom, nom et rôle", (_, expert) => {
      expect(fautesDeLArticle({ ...GUIDE, zone: "rouge", expert })).toEqual([expect.stringContaining("l’expert est incomplet")]);
    });

    it.each(["Le chantage n’est jamais de l’amour.", "Il l’a frappée hier.", "Il a 15 ans, il est mineur."])("un mot de la zone rouge l’exige : %s", (texte) => {
      expect(fautesDeLArticle(avecTexte(texte))).toEqual([expect.stringContaining("sujet de la zone rouge")]);
    });

    it("la zone orange a son bloc d’aide", () => {
      const sansAide: Article = { ...ENTREE, sections: ENTREE.sections.map((s) => ({ ...s, blocs: s.blocs.filter((b) => b.type !== "aide") })) };
      expect(fautesDeLArticle(sansAide)).toEqual([expect.stringContaining("zone orange sans bloc d’aide")]);
    });
  });

  describe("la signature, les sources, les dates", () => {
    it("refuse un article sans validation datée", () => {
      /* Le type l’exige ; un article mal fusionné, ou lu d’ailleurs, peut l’avoir perdu */
      const sans: Partial<Article> = { ...GUIDE };
      delete sans.valideLe;
      expect(fautesDeLArticle(sans as Article)).toEqual([expect.stringContaining("aucune validation datée")]);
    });

    it.each<[string, Jour]>([
      ["un 31 juin", "2026-06-31"],
      ["un 30 février", "2026-02-30"],
      ["un mois 13", "2026-13-01"],
      ["le jour d’un exemple, jamais validé", "0000-00-00"],
    ])("refuse une validation à un jour impossible : %s", (_, valideLe) => {
      expect(fautesDeLArticle({ ...GUIDE, valideLe })).toEqual([expect.stringContaining(`la validation (valideLe, « ${valideLe} ») n’est pas un vrai jour`)]);
    });

    it("refuse une validation après la mise à jour : on valide, puis on publie (le jour même, ou avant)", () => {
      expect(fautesDeLArticle({ ...GUIDE, valideLe: "2026-11-04" })).toEqual([expect.stringContaining("validé le 2026-11-04, après sa mise à jour du 2026-11-03")]);
      expect(fautesDeLArticle({ ...GUIDE, valideLe: "2026-11-03" })).toEqual([]);
      expect(fautesDeLArticle({ ...GUIDE, valideLe: "2026-10-30" })).toEqual([]);
      /* Une mise à jour de fond, validée avant d’être publiée */
      const misAJour: Article = { ...GUIDE, misAJourLe: "2026-11-10", changements: [...GUIDE.changements, { le: "2026-11-10", quoi: "Une section sur les stories" }] };
      expect(fautesDeLArticle({ ...misAJour, valideLe: "2026-11-09" })).toEqual([]);
      expect(fautesDeLArticle({ ...misAJour, valideLe: "2026-11-11" })).toEqual([expect.stringContaining("après sa mise à jour du 2026-11-10")]);
    });

    it("refuse un changement de fond resté validé à la version d’avant : il se valide à nouveau, après le changement précédent", () => {
      const misAJour: Article = { ...GUIDE, misAJourLe: "2026-12-10", changements: [...GUIDE.changements, { le: "2026-12-10", quoi: "Une section sur les stories" }] };
      /* La validation de la publication, gardée telle quelle, ou plus vieille encore */
      expect(fautesDeLArticle(misAJour)).toEqual([expect.stringContaining("validé le 2026-11-03, pas après le changement de fond précédent (2026-11-03)")]);
      expect(fautesDeLArticle({ ...misAJour, valideLe: "2026-10-30" })).toEqual([expect.stringContaining("pas après le changement de fond précédent (2026-11-03)")]);
      /* Validée à nouveau, après la version d’avant et au plus tard sa propre mise à jour */
      expect(fautesDeLArticle({ ...misAJour, valideLe: "2026-11-04" })).toEqual([]);
      expect(fautesDeLArticle({ ...misAJour, valideLe: "2026-12-10" })).toEqual([]);
      /* Le changement précédent est le dernier avant la mise à jour, dans n’importe quel ordre */
      const troisieme: Article = { ...misAJour, changements: [misAJour.changements[1]!, { le: "2026-11-20", quoi: "Une FAQ de plus" }, misAJour.changements[0]!] };
      expect(fautesDeLArticle({ ...troisieme, valideLe: "2026-11-15" })).toEqual([expect.stringContaining("pas après le changement de fond précédent (2026-11-20)")]);
      expect(fautesDeLArticle({ ...troisieme, valideLe: "2026-11-21" })).toEqual([]);
    });

    it("refuse le directeur de la publication, où qu’il soit dans l’article, par son nom, son prénom, son nom de famille ou son titre : il ne signe pas les guides", () => {
      const nom = EDITEUR.directeurPublication;
      expect(nom.trim()).not.toBe("");
      const mots = nom.trim().split(/\s+/);
      const [prenom, famille] = [mots[0]!, mots.at(-1)!];
      expect(prenom).not.toBe(famille);
      const rouge: Article = { ...GUIDE, zone: "rouge", expert: { nom: "Sam Martin", role: "psychologue (test)" } };
      const cas: [string, Article][] = [
        ["le texte", avecTexte(`Relu par ${nom}, fondateur de BLUSH.`)],
        ["la FAQ, en majuscules", { ...GUIDE, faq: [...GUIDE.faq, { question: "Qui relit\u00a0?", reponse: nom.toLocaleUpperCase("fr") }] }],
        ["une insécable entre le prénom et le nom", avecTexte(nom.replace(" ", "\u00a0"))],
        ["le nom de famille seul", { ...GUIDE, faq: [...GUIDE.faq, { question: "Qui relit\u00a0?", reponse: `M.\u00a0${famille}.` }] }],
        ["le prénom seul", avecTexte(`${prenom} a relu ce guide.`)],
        ["« fondateur de BLUSH », sans nom", avecTexte("Relu par le Fondateur de\u00a0BLUSH.")],
        ["l’expert", { ...rouge, expert: { nom, role: "psychologue (test)" } }],
        ["le rôle de l’expert", { ...rouge, expert: { nom: "Sam Martin", role: "cofondateur de BLUSH" } }],
        ["une source", { ...GUIDE, sources: [{ ...GUIDE.sources[0]!, titre: `L’avis de ${nom}` }, ...GUIDE.sources.slice(1)] }],
        ["l’historique", { ...GUIDE, changements: [{ le: "2026-11-03", quoi: `Publication, relue par ${famille}` }] }],
      ];
      for (const [ou, a] of cas) expect(fautesDeLArticle(a), ou).toEqual([expect.stringContaining("l’article nomme le directeur de la publication")]);
      expect(fautesDeLArticle(rouge)).toEqual([]);
      /* Un mot entier seulement, et « fondateur » dans son autre sens */
      expect(fautesDeLArticle(avecTexte(`Son écran ${famille.toLocaleLowerCase("fr")}ant, à deux heures du matin.`))).toEqual([]);
      expect(fautesDeLArticle(avecTexte("Ce premier message est fondateur de votre histoire."))).toEqual([]);
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
      expect(
        fautesDeLArticle({
          ...GUIDE,
          misAJourLe: "2026-11-10",
          changements: [...GUIDE.changements, { le: "2026-11-10", quoi: "Une section sur les stories" }],
          valideLe: "2026-11-10",
        }),
      ).toEqual([]);
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

    it("un lien vers un article qui n’existe pas, ou une page qu’aucun autre article ne lie, est refusé", () => {
      expect(fautesDuRegistre([{ ...GUIDE, lies: ["nulle-part"] }])).toEqual([expect.stringContaining("n’est pas dans le registre")]);
      /* Le tout premier article n’a que son hub */
      expect(fautesDuRegistre([{ ...GUIDE, lies: [] }])).toEqual([]);
      /* Dès le deuxième, le hub ne compte plus (il liste tout) : chacun est lié par un autre article */
      expect(
        fautesDuRegistre([
          { ...GUIDE, lies: [] },
          { ...ENTREE, lies: [] },
        ]),
      ).toEqual([expect.stringContaining(`« ${GUIDE.slug} » est une page orpheline`), expect.stringContaining(`« ${ENTREE.slug} » est une page orpheline`)]);
      expect(fautesDuRegistre([GUIDE, { ...ENTREE, lies: [] }])).toEqual([expect.stringContaining(`« ${GUIDE.slug} » est une page orpheline`)]);
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
