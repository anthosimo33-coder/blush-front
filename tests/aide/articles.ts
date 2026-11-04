import { SOURCES } from "@/contenu/articles";
import type { Article, BlocArticle, Personne } from "@/contenu/articles/types";
import { EDITEUR } from "@/contenu/mentions-legales";

/*
 * Les garde-fous des articles (src/contenu/articles), pour tests/unit/articles.test.ts : chaque règle de la charte
 * éditoriale (plan SEO du 3 novembre 2026, section 9) que la machine sait vérifier, appliquée au registre de production
 * à chaque `npm run check`. Une faute est une phrase en français, pour qui écrit l’article : ce qui ne va pas, où, et
 * quoi faire. La relecture humaine garde le reste (le sens, le ton, un conseil qui ferait du mal).
 * Les règles lisent tout le texte affiché d’un article (textesDe), pas ses sources (des titres d’autres sites) ni sa
 * signature ; seule celle du nom du directeur de la publication lit tout l’article, chacun de ses champs (chainesDe).
 */

/** Une lettre ou un chiffre, de n’importe quel alphabet : ce qui borne un mot (\b ne connaît pas les accents). */
const BORD = "[\\p{L}\\p{N}]";
/** Le motif d’un mot ou d’une expression entière : ni collée à une lettre avant, ni après. */
const entier = (motif: string) => `(?<!${BORD})(?:${motif})(?!${BORD})`;
/** Le mot ou l’expression `motif`, entier (insensible à la casse). */
const mot = (motif: string) => new RegExp(entier(motif), "iu");
/** Deux mots ou expressions entiers dans une même phrase (sans . ! ? entre eux), dans un ordre ou dans l’autre. */
const dansUnePhrase = (a: string, b: string) => new RegExp(`${entier(a)}[^.!?]*${entier(b)}|${entier(b)}[^.!?]*${entier(a)}`, "iu");

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

/** Tout le texte affiché d’un article, morceau par morceau : son thème, son titre, sa description, sa réponse courte, ses sections, sa FAQ. */
const textesDe = (a: Article): string[] =>
  [
    a.theme,
    a.titre,
    a.description,
    a.motCle,
    a.reponseCourte,
    ...a.sections.flatMap((s) => [s.question, ...s.blocs.flatMap(textesDuBloc)]),
    ...a.faq.flatMap((q) => [q.question, q.reponse]),
    /* Un champ perdu (un article mal fusionné, ou lu d’ailleurs) n’a pas de texte : sa propre règle le dit */
  ].filter((t) => typeof t === "string");

/**
 * Toutes les chaînes d’un article, de chacun de ses champs, à toute profondeur : le texte affiché, l’expert, les sources,
 * l’historique. Ce qu’aucune partie de l’article ne doit contenir s’y cherche.
 */
function chainesDe(valeur: unknown): string[] {
  if (typeof valeur === "string") return [valeur];
  if (Array.isArray(valeur)) return valeur.flatMap(chainesDe);
  if (valeur && typeof valeur === "object") return Object.values(valeur).flatMap(chainesDe);
  return [];
}

/** Un texte comparé sans casse, sans accents et les espaces resserrées (une insécable compte comme une espace). */
export const aPlat = (texte: string) => texte.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();

/** Un texte, lu tel quel dans une regex. */
const tel = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Le prénom et le nom de famille du directeur de la publication, à plat : le premier et le dernier mot de son nom (pas
 * une particule du milieu, « de » ou « la », qui se trouverait partout).
 */
const MOTS_DU_DIRECTEUR = [
  ...new Set(
    aPlat(EDITEUR.directeurPublication)
      .split(" ")
      .filter(Boolean)
      .filter((m, k, mots) => k === 0 || k === mots.length - 1),
  ),
];

/**
 * Ce qui nommerait le directeur de la publication dans un article, cherché à plat (aPlat) : son prénom ou son nom de
 * famille, chacun en mot entier (son nom complet, « M. » et son nom de famille, son prénom seul), ou son titre de
 * « fondateur de BLUSH » (la fin de l’ancienne signature).
 */
const NOMME_LE_DIRECTEUR = new RegExp(entier([...MOTS_DU_DIRECTEUR.map(tel), "(?:co-?)?fondat(?:eur|rice)s? de blush"].join("|")), "u");

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
    motif: mot("espionn\\p{L}*|(?:g[ée]o)?localis\\p{L}*|logiciels? espions?|mouchards?|spyware|stalkerware|pirat\\p{L}*"),
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
    motif: mot("(?:il|elle|iel) (?:reviendra|va revenir)|garanti\\p{L}*|100\\s?%|à coup sûr|à tous les coups|sans aucun doute"),
    pourquoi: "une promesse (« il reviendra », « garanti », « 100 % ») : un article ne promet jamais un résultat",
  },
  {
    /* La gratuité de ce que vend BLUSH, dans la même phrase, quel que soit l’ordre (« ton verdict est gratuit », « offert,
       le rapport ») ; « gratuit » seul garde son autre sens (« une remarque gratuite ») */
    motif: dansUnePhrase("(?:verdict|rapport|analyse|lecture|essai|aper[cç]u)s?|blush|import\\p{L}*", "gratuit\\p{L}*|gratos|offert\\p{L}*|sans payer|ne co[uû]te rien"),
    pourquoi: "« verdict gratuit » ou une autre gratuité écrite à la main : ce qui est gratuit se lit dans le code (src/contenu/offres.ts), et le verdict vient après le paiement",
  },
  { motif: mot("satisfait\\p{L}* ou rembours\\p{L}*"), pourquoi: "« satisfait ou remboursé » : BLUSH ne le promet pas (les conditions disent quand on rembourse)" },
  {
    /* Le montant, la monnaie après (« 9,90 € », « 10 euros ») ou avant (« €9,90 », « EUR 10 ») */
    motif: /\d(?:[\d\s]*\d)?(?:[,.]\d+)?\s*(?:€|euros?(?![\p{L}])|EUR(?![\p{L}]))|(?<![\p{L}])(?:€|EUR)\s*\d/iu,
    pourquoi: "un prix écrit à la main : le bouton d’import l’affiche, tiré du catalogue (src/contenu/offres.ts)",
  },
];

/**
 * Les mots de la zone rouge (la violence, la détresse, le chantage, les images intimes, les mineurs) : un article qui les
 * emploie est en zone rouge, avec son expert et le bloc d’aide en tête. Au figuré aussi (« ce qui frappe », « un détail
 * mineur ») : la machine ne sait pas lire le sens, une autre tournure suffit (« ce qui saute aux yeux », « un petit détail »).
 */
const MOTS_ROUGES = mot("suicid\\p{L}*|nudes?|sextorsion|chantage|harc[eè]l\\p{L}*|viol(?:s|e|é|ée|er|ences?)?|frapp\\p{L}*|mineur(?:e|s|es)?|automutil\\p{L}*|scarifi\\p{L}*");

/** Une phrase où « ta conv WhatsApp » (ou Instagram) arrive seule, sans les captures d’écran. */
function convWhatsappSeule(texte: string): boolean {
  return texte
    .split(/(?<=[.!?])\s+/)
    .some((phrase) => mot("(?:ta|tes|votre|vos|sa|ses) conv(?:ersation)?s? (?:whatsapp|insta(?:gram)?)").test(phrase) && !/captures?/i.test(phrase));
}

/**
 * Les fautes de marque et de sujets sensibles d’un texte public, morceau par morceau (`textes`) : les mots refusés
 * (MOTS_REFUSES) et « ta conv WhatsApp » seul. `ici` : le nom de la page, en tête de chaque faute. Les articles s’en
 * servent, et les pages de confiance aussi (tests/unit/pages-de-confiance.test.ts), sur tout leur texte affiché.
 */
export function fautesDuTexte(textes: readonly string[], ici: string): string[] {
  const fautes: string[] = [];
  for (const { motif, pourquoi } of MOTS_REFUSES) {
    const trouve = textes.find((t) => motif.test(t));
    if (trouve) fautes.push(`${ici} : ${pourquoi}. Dans : « ${trouve} »`);
  }
  const seule = textes.find(convWhatsappSeule);
  if (seule)
    fautes.push(
      `${ici} : « ta conv WhatsApp » seul : BLUSH lit aussi les captures d’écran et l’export Instagram, écris « captures d’écran, export Instagram ou WhatsApp ». Dans : « ${seule} »`,
    );
  return fautes;
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

/**
 * Le plus long morceau surligné du titre, en signes : une borne, pas une garantie. Une bulle du titre (penchée d’un bloc,
 * src/components/article/titre.tsx) passe à la ligne entière ; à 320 px de large, la tête du titre en tient de 13 à 18
 * selon ses lettres (« mmm » plus large que « ill »), et une bulle plus large que la colonne passe à la ligne dans sa
 * bulle au lieu de déborder. Les vrais titres sont mesurés au téléphone, chaque bulle sur une ligne
 * (tests/e2e/public-admin-pages.spec.ts).
 */
export const SURLIGNE_MAX = 18;

/**
 * Les fautes des morceaux surlignés du titre (Article `surligne`) : chacun un morceau exact du titre, une seule fois, en
 * mots entiers, court, sans les deux-points (le titre se coupe là en deux temps), et les deux sans se chevaucher.
 */
function fautesDuSurligne(a: Article, ici: string): string[] {
  const fautes: string[] = [];
  const surligne: Partial<Article["surligne"]> = a.surligne ?? {};
  const places: { debut: number; fin: number }[] = [];
  for (const [nom, morceau] of [
    ["la situation (rose)", surligne.situation],
    ["l’action (bleue)", surligne.action],
  ] as const) {
    if (typeof morceau !== "string" || !morceau.trim()) {
      fautes.push(`${ici} : le titre n’a pas ${nom} à surligner. Ajoute surligne, deux morceaux exacts du titre : la situation en rose, l’action en bleu.`);
      continue;
    }
    const debut = a.titre.indexOf(morceau);
    const avant = a.titre.slice(0, Math.max(0, debut)).at(-1) ?? "";
    const apres = a.titre.slice(debut + morceau.length).at(0) ?? "";
    if (morceau !== morceau.trim()) fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») commence ou finit par une espace : écris le morceau seul.`);
    else if (debut < 0) fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») n’est pas un morceau exact du titre (« ${a.titre} »).`);
    else if (a.titre.indexOf(morceau, debut + 1) >= 0)
      fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») revient deux fois dans le titre : choisis un morceau qui n’y est qu’une fois.`);
    else if (new RegExp(BORD, "u").test(avant) || new RegExp(BORD, "u").test(apres))
      fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») coupe un mot du titre : surligne des mots entiers.`);
    else if (morceau.includes(":"))
      fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») passe par les deux-points, où le titre se coupe en deux : prends un morceau d’un côté.`);
    else if (morceau.length > SURLIGNE_MAX)
      fautes.push(`${ici} : ${nom} surlignée (« ${morceau} ») fait ${morceau.length} signes, ${SURLIGNE_MAX} au plus : la bulle doit tenir sur une ligne du téléphone.`);
    else places.push({ debut, fin: debut + morceau.length });
  }
  const [x, y] = places;
  if (x && y && x.debut < y.fin && y.debut < x.fin) fautes.push(`${ici} : la situation et l’action surlignées se chevauchent dans le titre : deux morceaux à part.`);
  return fautes;
}

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
 * Les fautes d’un article seul. `exemple` : un article d’aperçu (src/app/apercu), que personne n’a validé : la règle de
 * la validation datée ne s’y applique pas, toutes les autres oui.
 */
export function fautesDeLArticle(a: Article, { exemple = false }: { exemple?: boolean } = {}): string[] {
  const fautes: string[] = [];
  const ici = `« ${a.slug} »`;
  const textes = textesDe(a);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) fautes.push(`${ici} : le slug s’écrit en minuscules sans accents, les mots séparés par des tirets (il fait l’adresse).`);
  if (!a.titre.trim() || !a.description.trim() || !a.motCle.trim()) fautes.push(`${ici} : le titre, la description et le mot-clé principal sont exigés.`);

  /* Le thème : le surtitre de la page, de un à trois mots, une majuscule au début et rien au bout (« Les silences ») */
  const theme: unknown = a.theme;
  const motsDuTheme = typeof theme === "string" ? theme.trim().split(/\s+/).filter(Boolean) : [];
  if (typeof theme !== "string" || !motsDuTheme.length || motsDuTheme.length > 3 || !/^\p{Lu}/u.test(theme) || /[\p{P}\s]$/u.test(theme))
    fautes.push(`${ici} : le thème (« ${String(theme ?? "")} ») est un surtitre de un à trois mots, une majuscule au début, sans ponctuation au bout (« Les silences »).`);

  /* Les mots surlignés du titre */
  fautes.push(...fautesDuSurligne(a, ici));

  /* La marque et les sujets sensibles */
  fautes.push(...fautesDuTexte(textes, ici));

  /* BLUSH parle en minuscules, sans point final */
  for (const bulle of a.sections.flatMap((s) => s.blocs.flatMap((b) => (b.type === "blush" ? b.bulles : [])))) {
    if (bulle !== bulle.toLocaleLowerCase("fr")) fautes.push(`${ici} : une bulle de BLUSH s’écrit en minuscules. Dans : « ${bulle} »`);
    if (/\.\s*$/.test(bulle)) fautes.push(`${ici} : une bulle de BLUSH finit sans point. Dans : « ${bulle} »`);
  }

  /* La réponse courte se lit seule : de 40 à 60 mots */
  const n = nombreDeMots(a.reponseCourte);
  if (n < 40 || n > 60) fautes.push(`${ici} : la réponse courte fait ${n} mots, elle doit en faire de 40 à 60.`);

  if (a.genre === "guide" && (a.sections.length < 3 || a.sections.length > 5)) fautes.push(`${ici} : un guide a de 3 à 5 sections, il en a ${a.sections.length}.`);

  /* La signature : une validation datée (on valide le texte final, puis on publie), et l’expert en zone rouge */
  const valideLe: unknown = a.valideLe;
  if (!exemple) {
    if (typeof valideLe !== "string" || !valideLe.trim())
      fautes.push(`${ici} : aucune validation datée. Ajoute valideLe, le jour où le texte final a été validé (« AAAA-MM-JJ ») : rien ne se publie sans elle.`);
    else if (!jourValide(valideLe))
      fautes.push(`${ici} : la validation (valideLe, « ${valideLe} ») n’est pas un vrai jour. Écris le jour où le texte a été validé, « AAAA-MM-JJ », un jour qui existe.`);
    else if (valideLe > a.misAJourLe)
      fautes.push(
        `${ici} : validé le ${valideLe}, après sa mise à jour du ${a.misAJourLe}. On valide le texte avant de le publier : valideLe vient au plus tard le jour de misAJourLe.`,
      );
    else {
      /* Un changement de fond se valide à nouveau : la validation vient après la version d’avant (le jour du changement
         précédent, où elle a été publiée), sinon c’est la sienne. Le même jour ne compte pas : on ne saurait plus
         laquelle des deux versions elle valide. */
      const jours = a.changements.map((c) => c.le);
      const dernier = jours.reduce<string>((x, y) => (y > x ? y : x), "");
      const precedent = jours.reduce<string>((x, y) => (y < dernier && y > x ? y : x), "");
      if (precedent && valideLe <= precedent)
        fautes.push(
          `${ici} : validé le ${valideLe}, pas après le changement de fond précédent (${precedent}) : c’est la validation d’une version d’avant. Un changement de fond se valide à nouveau : pose valideLe au jour où la version du ${dernier} a été validée.`,
        );
    }
  }
  if (a.expert && !personneValide(a.expert)) fautes.push(`${ici} : l’expert est incomplet (prénom, nom et rôle).`);

  /* Le directeur de la publication ne signe pas les articles : son nom reste dans les mentions légales, jamais dans un
     article (ni son texte, ni l’expert, ni une source, ni l’historique), pour qu’il ne revienne pas par le texte */
  const nomme = chainesDe(a).find((t) => NOMME_LE_DIRECTEUR.test(aPlat(t)));
  if (nomme)
    fautes.push(
      `${ici} : l’article nomme le directeur de la publication (son prénom, son nom de famille, ou « fondateur de BLUSH »). Les guides sont signés « Par l’équipe BLUSH », sans nom : le sien reste dans les mentions légales. Dans : « ${nomme} »`,
    );

  /* Les sources : de 2 à 5 (SOURCES, que /methode dit), chacune avec son adresse et le jour où on l’a lue */
  const datees = a.sources.filter((s) => s.titre.trim() && /^https?:\/\/[^\s/]+\.[^\s/]+/.test(s.url) && jourValide(s.consulteLe));
  if (datees.length < SOURCES.min)
    fautes.push(`${ici} : ${datees.length} source(s) datée(s) seulement. Il en faut ${SOURCES.min} au moins, chacune avec son titre, son adresse et le jour où tu l’as lue.`);
  if (a.sources.length > SOURCES.max) fautes.push(`${ici} : ${a.sources.length} sources, ${SOURCES.max} au plus : garde les meilleures.`);

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

  /* Les zones : le bloc d’aide en orange, à sa place dans une section ; en rouge, la page le met elle-même en tête
     (src/components/article/PageArticle.tsx), et un expert relit */
  const aide = a.sections.some((s) => s.blocs.some((b) => b.type === "aide"));
  if (a.zone === "orange" && !aide) fautes.push(`${ici} : zone orange sans bloc d’aide. Ajoute { type: "aide" } dans une section.`);
  if (a.zone === "rouge") {
    if (!a.expert) fautes.push(`${ici} : zone rouge sans expert. Un psychologue ou une association relit aussi, et signe (le champ expert).`);
    if (aide) fautes.push(`${ici} : en zone rouge, la page met déjà le bloc d’aide en tête, sous la signature. Retire le { type: "aide" } de la section : il serait en double.`);
  }
  const rouge = textes.find((t) => MOTS_ROUGES.test(t));
  if (rouge && a.zone !== "rouge")
    fautes.push(`${ici} : un sujet de la zone rouge (violence, détresse, chantage, images intimes, mineurs), en zone ${a.zone}. Dans : « ${rouge} »`);

  return fautes;
}

/**
 * Les fautes d’un registre entier : celles de chaque article, puis celles qui se voient à plusieurs (un slug ou un
 * mot-clé pris deux fois, un lien vers un article qui n’existe pas, une page qu’aucun autre article ne lie, trop de
 * publications dans une semaine, deux textes trop semblables).
 */
export function fautesDuRegistre(articles: readonly Article[], { exemple = false }: { exemple?: boolean } = {}): string[] {
  const fautes = articles.flatMap((a) => fautesDeLArticle(a, { exemple }));
  const parSlug = new Map(articles.map((a) => [a.slug, a]));

  const doublons = (cle: (a: Article) => string) => {
    const vus = new Map<string, Article[]>();
    for (const a of articles) vus.set(cle(a), [...(vus.get(cle(a)) ?? []), a]);
    return [...vus.values()].filter((l) => l.length > 1);
  };
  for (const l of doublons((a) => a.slug)) fautes.push(`Le slug « ${l[0]!.slug} » est pris ${l.length} fois : une adresse par article.`);
  const motCle = (a: Article) => aPlat(a.motCle);
  for (const l of doublons(motCle))
    fautes.push(`Le mot-clé « ${l[0]!.motCle} » est celui de ${l.map((a) => `« ${a.slug} »`).join(" et ")} : un seul article par mot-clé, sinon ils se gênent dans les moteurs.`);

  /* Les liens : vers un article qui existe, et chaque article lié par un autre (le maillage de la charte, règle 15). Le
     hub, qui liste tous les articles de sa rubrique, ne compte pas : il mènerait toujours à chacun. Seul le tout premier
     article n’a que lui. */
  for (const a of articles)
    for (const slug of a.lies) {
      if (slug === a.slug) fautes.push(`« ${a.slug} » : il se lie à lui-même.`);
      else if (!parSlug.has(slug)) fautes.push(`« ${a.slug} » : il se lie à « ${slug} », qui n’est pas dans le registre.`);
    }
  if (articles.length > 1)
    for (const a of articles)
      if (!articles.some((b) => b.slug !== a.slug && b.lies.includes(a.slug)))
        fautes.push(`« ${a.slug} » est une page orpheline : aucun autre article n’y mène. Ajoute-le aux lies d’un article voisin (une entrée du lexique, un guide proche).`);

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
