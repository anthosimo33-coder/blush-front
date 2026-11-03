import { articlesDu, RUBRIQUES } from "@/contenu/articles";
import type { Article, BlocArticle, Genre, Personne } from "@/contenu/articles/types";

/*
 * Les garde-fous des articles (src/contenu/articles), pour tests/unit/articles.test.ts : chaque règle de la charte
 * éditoriale (plan SEO du 3 novembre 2026, section 9) que la machine sait vérifier, appliquée au registre de production
 * à chaque `npm run check`. Une faute est une phrase en français, pour qui écrit l’article : ce qui ne va pas, où, et
 * quoi faire. La relecture humaine garde le reste (le sens, le ton, un conseil qui ferait du mal).
 * Les règles lisent tout le texte affiché d’un article (textesDe), pas ses sources (des titres d’autres sites) ni sa
 * signature.
 */

/** Une lettre ou un chiffre, de n’importe quel alphabet : ce qui borne un mot (\b ne connaît pas les accents). */
const BORD = "[\\p{L}\\p{N}]";
/** Le mot ou l’expression `motif`, entier : ni collé à une lettre avant, ni après (insensible à la casse). */
const mot = (motif: string) => new RegExp(`(?<!${BORD})(?:${motif})(?!${BORD})`, "iu");

/** Les textes d’un morceau de section, tels qu’affichés. */
function textesDuBloc(b: BlocArticle): string[] {
  switch (b.type) {
    case "paragraphe":
      return [b.texte];
    case "liste":
      return [...b.elements];
    case "conv":
      return [...b.repliques.map((r) => r.texte), ...(b.legende ? [b.legende] : [])];
    case "blush":
      return [...b.bulles];
    case "regarde":
      return [...b.signes];
    case "pieges":
      return [...b.pieges];
    case "aide":
      return [];
  }
}

/** Tout le texte affiché d’un article, morceau par morceau : son titre, sa description, sa réponse courte, ses sections, sa FAQ. */
const textesDe = (a: Article): string[] => [
  a.titre,
  a.description,
  a.motCle,
  a.reponseCourte,
  ...a.sections.flatMap((s) => [s.question, ...s.blocs.flatMap(textesDuBloc)]),
  ...a.faq.flatMap((q) => [q.question, q.reponse]),
];

/** Les mots d’un texte (les lettres et les chiffres, apostrophes comprises : « c’est » est un mot). */
const motsDe = (texte: string) => texte.toLocaleLowerCase("fr").match(/[\p{L}\p{N}’']+/gu) ?? [];

/**
 * Les règles de la marque et des sujets sensibles : un motif refusé dans le texte, et ce qu’il faut écrire à la place.
 * Chacune vaut pour tout le texte affiché (le corps, les bulles, les mini-convs, la FAQ).
 */
const MOTS_REFUSES: readonly { motif: RegExp; pourquoi: string }[] = [
  {
    motif: mot("ia|intelligence artificielle"),
    pourquoi: "« IA » (ou « une IA », « l’IA ») : BLUSH ne se présente pas ainsi dans ses textes, écris « lue par BLUSH »",
  },
  {
    motif: mot("claude|anthropic|eleven ?labs|mistral|open ?ai|(?:chat)?gpt[\\p{L}\\p{N}.-]*"),
    pourquoi: "un nom de prestataire d’IA (Claude, Anthropic, ElevenLabs, Mistral, OpenAI, GPT) : jamais dans un texte public",
  },
  { motif: mot("situationships?"), pourquoi: "« situationship » : personne ne le dit en français, écris « crush »" },
  {
    motif: mot("espionn\\p{L}*|(?:g[ée]o)?localis(?:er|e|es|ent|ez|é|ée|és|ées)|logiciels? espions?|mouchards?|spyware|stalkerware|pirat\\p{L}*"),
    pourquoi: "un mot de surveillance (espionner, localiser, un logiciel espion…) : jamais de méthode pour surveiller quelqu’un (art. 226-15 du Code pénal)",
  },
  {
    motif: mot("lire (?:ses|tous ses) (?:messages|convs?|conversations|mails|sms|dm)|fouiller (?:dans )?(?:son|sa) (?:t[ée]l[ée]phone|portable|tel)|messages supprim[ée]s"),
    pourquoi: "lire ses messages ou fouiller son téléphone : jamais de surveillance, BLUSH ne lit que tes convs à toi",
  },
  {
    motif: mot("pervers(?:e)? narcissiques?|narcissiques?|bipolaires?|borderlines?|psychopath\\p{L}*|sociopath\\p{L}*|schizophr\\p{L}*|PN"),
    pourquoi: "un diagnostic sur une personne (pervers narcissique, bipolaire, borderline…) : un article décrit des messages, jamais une personne",
  },
  {
    motif: mot("(?:il|elle|iel) (?:reviendra|va revenir)|garanti(?:e|s|es)?|100\\s?%|à coup sûr|à tous les coups|sans aucun doute"),
    pourquoi: "une promesse (« il reviendra », « garanti », « 100 % ») : un article ne promet jamais un résultat",
  },
  {
    motif: mot("(?:verdict|rapport|analyse|lecture|essai|aper[cç]u)s? (?:gratuit|offert)e?s?"),
    pourquoi: "« verdict gratuit » ou une autre gratuité écrite à la main : ce qui est gratuit se lit dans le code (src/contenu/offres.ts), et le verdict vient après le paiement",
  },
  { motif: mot("satisfait(?:e|s|es)? ou rembours[ée]"), pourquoi: "« satisfait ou remboursé » : BLUSH ne le promet pas (les conditions disent quand on rembourse)" },
  {
    motif: /\d(?:[\d\s]*\d)?(?:[,.]\d+)?\s*(?:€|euros?(?![\p{L}])|EUR(?![\p{L}]))/iu,
    pourquoi: "un prix écrit à la main : le bouton d’import l’affiche, tiré du catalogue (src/contenu/offres.ts)",
  },
];

/**
 * Les mots de la zone rouge (la violence, la détresse, le chantage, les images intimes) : un article qui les emploie est
 * en zone rouge, avec son expert et le bloc d’aide en tête.
 */
const MOTS_ROUGES = mot("suicid\\p{L}*|nudes?|sextorsion|chantage|harc[eè]l\\p{L}*|viol(?:s|e|é|ée|er|ences?)?|automutil\\p{L}*|scarifi\\p{L}*");

/** Une phrase où « ta conv WhatsApp » (ou Instagram) arrive seule, sans les captures ni les enregistrements d’écran. */
function convWhatsappSeule(texte: string): boolean {
  return texte
    .split(/(?<=[.!?])\s+/)
    .some(
      (phrase) =>
        mot("(?:ta|tes|votre|vos|sa|ses) conv(?:ersation)?s? (?:whatsapp|insta(?:gram)?)").test(phrase) && !(/captures?/i.test(phrase) && /enregistrements?/i.test(phrase)),
    );
}

/** Un jour « AAAA-MM-JJ » qui existe (pas un 31 juin). */
function jourValide(jour: string): boolean {
  const d = new Date(`${jour}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === jour;
}

/** Une vraie personne : un prénom et un nom (deux mots de lettres au moins), et son rôle. */
const personneValide = ({ nom, role }: Personne) =>
  nom
    .trim()
    .split(/\s+/)
    .filter((m) => /\p{L}{2,}/u.test(m)).length >= 2 && role.trim() !== "";

/** Le nombre de mots d’un texte, comme on les compte à l’œil (« c’est » compte pour un). */
export const nombreDeMots = (texte: string) => motsDe(texte).length;

/** La semaine ISO d’un jour : « 2026-W45 » (du lundi au dimanche ; la semaine 1 est celle du premier jeudi de l’année). */
export function semaineIso(jour: string): string {
  const jeudi = new Date(`${jour}T00:00:00Z`);
  jeudi.setUTCDate(jeudi.getUTCDate() - ((jeudi.getUTCDay() + 6) % 7) + 3);
  const annee = jeudi.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(annee, 0, 4));
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - ((premierJeudi.getUTCDay() + 6) % 7) + 3);
  const semaine = 1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / (7 * 86_400_000));
  return `${annee}-W${String(semaine).padStart(2, "0")}`;
}

/** Les trigrammes de mots d’un article (trois mots qui se suivent) : son empreinte, pour comparer deux textes. */
const trigrammesDe = (a: Article) => {
  const mots = textesDe(a).flatMap(motsDe);
  return new Set(mots.slice(2).map((_, k) => `${mots[k]} ${mots[k + 1]} ${mots[k + 2]}`));
};

/**
 * La ressemblance de deux articles, de 0 à 1 : l’indice de Jaccard de leurs trigrammes de mots (les suites de trois mots
 * qu’ils ont en commun, sur toutes celles de l’un ou de l’autre). Deux textes réécrits l’un de l’autre gardent beaucoup
 * de suites communes ; deux textes sur des sujets voisins, presque aucune. Au-dessus de 0,5, ce sont deux versions d’une
 * même page (Google les traite en pages satellites).
 */
export function ressemblance(a: Article, b: Article): number {
  const ta = trigrammesDe(a);
  const tb = trigrammesDe(b);
  const communs = [...ta].filter((t) => tb.has(t)).length;
  const union = ta.size + tb.size - communs;
  return union ? communs / union : 0;
}

/** Le seuil de ressemblance au-delà duquel deux articles sont refusés. */
export const RESSEMBLANCE_MAX = 0.5;

/** Le plus de publications permises dans une même semaine ISO (règle 3 de la charte). */
const PUBLICATIONS_PAR_SEMAINE = 5;

/**
 * Les fautes d’un article seul. `exemple` : un article d’aperçu (src/app/apercu), qui n’est signé par personne : la règle
 * de la signature ne s’y applique pas, toutes les autres oui.
 */
export function fautesDeLArticle(a: Article, { exemple = false }: { exemple?: boolean } = {}): string[] {
  const fautes: string[] = [];
  const ici = `« ${a.slug} »`;
  const textes = textesDe(a);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) fautes.push(`${ici} : le slug s’écrit en minuscules sans accents, les mots séparés par des tirets (il fait l’adresse).`);
  if (!a.titre.trim() || !a.description.trim() || !a.motCle.trim()) fautes.push(`${ici} : le titre, la description et le mot-clé principal sont exigés.`);

  /* La marque et les sujets sensibles */
  for (const { motif, pourquoi } of MOTS_REFUSES) {
    const trouve = textes.find((t) => motif.test(t));
    if (trouve) fautes.push(`${ici} : ${pourquoi}. Dans : « ${trouve} »`);
  }
  const seule = textes.find(convWhatsappSeule);
  if (seule)
    fautes.push(
      `${ici} : « ta conv WhatsApp » seul : BLUSH lit aussi les captures et les enregistrements d’écran, écris « captures, enregistrement d’écran, export Instagram ou WhatsApp ». Dans : « ${seule} »`,
    );

  /* BLUSH parle en minuscules, sans point final */
  for (const bulle of a.sections.flatMap((s) => s.blocs.flatMap((b) => (b.type === "blush" ? b.bulles : [])))) {
    if (bulle !== bulle.toLocaleLowerCase("fr")) fautes.push(`${ici} : une bulle de BLUSH s’écrit en minuscules. Dans : « ${bulle} »`);
    if (/\.\s*$/.test(bulle)) fautes.push(`${ici} : une bulle de BLUSH finit sans point. Dans : « ${bulle} »`);
  }

  /* La réponse courte se lit seule : de 40 à 60 mots */
  const n = nombreDeMots(a.reponseCourte);
  if (n < 40 || n > 60) fautes.push(`${ici} : la réponse courte fait ${n} mots, elle doit en faire de 40 à 60.`);

  if (a.genre === "guide" && (a.sections.length < 3 || a.sections.length > 5)) fautes.push(`${ici} : un guide a de 3 à 5 sections, il en a ${a.sections.length}.`);

  /* La signature : une vraie personne, et l’expert en zone rouge */
  if (!exemple && !personneValide(a.relecteur))
    fautes.push(`${ici} : le relecteur est vide ou incomplet. Il faut une vraie personne, prénom et nom, avec son rôle : c’est elle qui signe « relu par ».`);
  if (a.expert && !personneValide(a.expert)) fautes.push(`${ici} : l’expert est incomplet (prénom, nom et rôle).`);

  /* Les sources : de 2 à 5, chacune avec son adresse et le jour où on l’a lue */
  const datees = a.sources.filter((s) => s.titre.trim() && /^https?:\/\/[^\s/]+\.[^\s/]+/.test(s.url) && jourValide(s.consulteLe));
  if (datees.length < 2)
    fautes.push(`${ici} : ${datees.length} source(s) datée(s) seulement. Il en faut 2 au moins, chacune avec son titre, son adresse et le jour où tu l’as lue.`);
  if (a.sources.length > 5) fautes.push(`${ici} : ${a.sources.length} sources, 5 au plus : garde les meilleures.`);

  /* Les dates : « mis à jour le » ne bouge que sur un changement de fond déclaré */
  if (!jourValide(a.publieLe) || !jourValide(a.misAJourLe)) fautes.push(`${ici} : publieLe et misAJourLe s’écrivent « AAAA-MM-JJ », un jour qui existe.`);
  else {
    const jours = a.changements.map((c) => c.le);
    const dernier = jours.reduce<string>((x, y) => (y > x ? y : x), "");
    if (!a.changements.length) fautes.push(`${ici} : aucun changement de fond déclaré. Il en faut un au moins, la publication.`);
    else if (a.misAJourLe !== dernier)
      fautes.push(
        `${ici} : « mis à jour le » (${a.misAJourLe}) n’est pas le jour du dernier changement de fond déclaré (${dernier}). Ajoute à changements ce qui a changé ce jour-là, ou remets la date d’avant : une date ne bouge jamais seule.`,
      );
    if (a.misAJourLe < a.publieLe) fautes.push(`${ici} : mis à jour (${a.misAJourLe}) avant d’être publié (${a.publieLe}).`);
    const avant = a.changements.find((c) => !jourValide(c.le) || c.le < a.publieLe || !c.quoi.trim());
    if (avant) fautes.push(`${ici} : un changement mal écrit (« ${avant.le} », « ${avant.quoi} ») : un jour qui existe, après la publication, et ce qui a changé.`);
  }

  /* Les zones : le bloc d’aide en orange, et en tête en rouge, avec un expert */
  const aides = a.sections.map((s) => s.blocs.some((b) => b.type === "aide"));
  if (a.zone === "orange" && !aides.includes(true)) fautes.push(`${ici} : zone orange sans bloc d’aide. Ajoute { type: "aide" } dans une section.`);
  if (a.zone === "rouge") {
    if (!a.expert) fautes.push(`${ici} : zone rouge sans expert. Un psychologue ou une association relit aussi, et signe (le champ expert).`);
    if (!aides[0]) fautes.push(`${ici} : zone rouge sans bloc d’aide en tête. Mets { type: "aide" } dans la première section.`);
  }
  const rouge = textes.find((t) => MOTS_ROUGES.test(t));
  if (rouge && a.zone !== "rouge") fautes.push(`${ici} : un sujet de la zone rouge (violence, détresse, chantage, images intimes), en zone ${a.zone}. Dans : « ${rouge} »`);

  return fautes;
}

/** Ce que liste le hub de chaque rubrique : les slugs de ses articles (articlesDu, comme src/components/article/HubArticles.tsx). */
const hubsDe = (articles: readonly Article[]) =>
  Object.fromEntries((Object.keys(RUBRIQUES) as Genre[]).map((genre) => [genre, articlesDu(genre, articles).map((a) => a.slug)])) as Record<Genre, string[]>;

/**
 * Les fautes d’un registre entier : celles de chaque article, puis celles qui se voient à plusieurs (un slug ou un
 * mot-clé pris deux fois, un lien vers un article qui n’existe pas, une page que rien ne lie, trop de publications dans
 * une semaine, deux textes trop semblables). `hubs` : ce que listent les hubs (par défaut, ce qu’ils listent vraiment).
 */
export function fautesDuRegistre(
  articles: readonly Article[],
  { exemple = false, hubs = hubsDe(articles) }: { exemple?: boolean; hubs?: Record<Genre, readonly string[]> } = {},
): string[] {
  const fautes = articles.flatMap((a) => fautesDeLArticle(a, { exemple }));
  const parSlug = new Map(articles.map((a) => [a.slug, a]));

  const doublons = (cle: (a: Article) => string) => {
    const vus = new Map<string, Article[]>();
    for (const a of articles) vus.set(cle(a), [...(vus.get(cle(a)) ?? []), a]);
    return [...vus.values()].filter((l) => l.length > 1);
  };
  for (const l of doublons((a) => a.slug)) fautes.push(`Le slug « ${l[0]!.slug} » est pris ${l.length} fois : une adresse par article.`);
  const motCle = (a: Article) => a.motCle.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
  for (const l of doublons(motCle))
    fautes.push(`Le mot-clé « ${l[0]!.motCle} » est celui de ${l.map((a) => `« ${a.slug} »`).join(" et ")} : un seul article par mot-clé, sinon ils se gênent dans les moteurs.`);

  /* Les liens : vers un article qui existe, et chaque article lié par un autre ou par son hub */
  for (const a of articles)
    for (const slug of a.lies) {
      if (slug === a.slug) fautes.push(`« ${a.slug} » : il se lie à lui-même.`);
      else if (!parSlug.has(slug)) fautes.push(`« ${a.slug} » : il se lie à « ${slug} », qui n’est pas dans le registre.`);
    }
  for (const a of articles) {
    const parUnArticle = articles.some((b) => b.slug !== a.slug && b.lies.includes(a.slug));
    if (!parUnArticle && !hubs[a.genre].includes(a.slug))
      fautes.push(`« ${a.slug} » est une page orpheline : ni un autre article ni son hub n’y mènent. Ajoute-le aux lies d’un article voisin.`);
  }

  /* La cadence : au plus 5 publications par semaine */
  const parSemaine = new Map<string, Article[]>();
  for (const a of articles) parSemaine.set(semaineIso(a.publieLe), [...(parSemaine.get(semaineIso(a.publieLe)) ?? []), a]);
  for (const [semaine, liste] of parSemaine)
    if (liste.length > PUBLICATIONS_PAR_SEMAINE)
      fautes.push(
        `${liste.length} publications la semaine ${semaine}, ${PUBLICATIONS_PAR_SEMAINE} au plus : décale ${liste.length - PUBLICATIONS_PAR_SEMAINE} article(s) à la semaine d’après.`,
      );

  /* Les doublons de texte */
  for (const [k, a] of articles.entries())
    for (const b of articles.slice(k + 1)) {
      const r = ressemblance(a, b);
      if (r > RESSEMBLANCE_MAX) fautes.push(`« ${a.slug} » et « ${b.slug} » se ressemblent à ${Math.round(r * 100)} % (50 % au plus) : réécris l’un, ou fais-en un seul article.`);
    }
  return fautes;
}
