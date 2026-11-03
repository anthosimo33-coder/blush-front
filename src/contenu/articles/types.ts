/*
 * Un article de BLUSH : un guide (une situation qu’on vit, /guides/…) ou une entrée du lexique (un mot qu’on entend,
 * /lexique/…). Des données, comme les conditions (src/contenu/conditions.ts) : les pages, le plan du site, /llms.txt et
 * les garde-fous (tests/unit/articles.test.ts) les lisent toutes au même endroit, le registre (./index.ts).
 * Le corps se lit seul, en phrases complètes et tutoyées ; BLUSH ne parle que dans ses bulles, en minuscules. Le gabarit
 * (src/components/article) pose le reste : la signature, les mini-convs marquées « exemple inventé », le bouton d’import
 * tiré du code (jamais un prix ni une gratuité écrits ici), les sources, les liens.
 */

/** La rubrique : un guide (/guides/<slug>) ou une entrée du lexique (/lexique/<slug>). */
export type Genre = "guide" | "lexique";

/**
 * La zone du sujet, décidée avant d’écrire. Verte : la drague, les délais, les mots (la voix de BLUSH en entier). Orange :
 * la rupture, la jalousie, l’estime de soi (sans diagnostic, sources citées, le bloc d’aide). Rouge : la violence, le
 * contrôle, le harcèlement, la détresse, les mineurs (le bloc d’aide en tête, aucune vanne, un expert nommé qui relit).
 */
export type Zone = "verte" | "orange" | "rouge";

/** Un jour du calendrier, « AAAA-MM-JJ » (un jour de Paris). */
export type Jour = `${number}-${number}-${number}`;

/** Une vraie personne, nommée : son prénom et son nom, et son rôle (« fondateur de BLUSH », « psychologue »). Jamais un personnage inventé. */
export type Personne = { nom: string; role: string };

/** Une source citée : son titre, son adresse, et le jour où on l’a lue (une source sans date ne compte pas). */
type Source = { titre: string; url: string; consulteLe: Jour };

/**
 * Un changement de fond : son jour, et ce qui a changé (« Publication », « Nouvelle section sur les stories »). Une
 * virgule corrigée n’en est pas un : « mis à jour le » ne bouge que sur un changement déclaré ici.
 */
type Changement = { le: Jour; quoi: string };

/** Une réplique d’une mini-conv inventée : de qui lit (`moi`, en bleu, à droite) ou de l’autre personne (`autre`, en gris, à gauche). */
export type Replique = { de: "moi" | "autre"; texte: string };

/**
 * Un morceau d’une section, rendu par le gabarit (src/components/article/blocs.tsx) :
 * - `paragraphe` : une idée, deux ou trois phrases ;
 * - `liste` : des puces ;
 * - `conv` : une mini-conv en bulles, toujours marquée « exemple inventé » (`legende` : une ligne dessous, ce qu’elle dit) ;
 * - `blush` : BLUSH qui parle, une à trois bulles roses, en minuscules et sans point final, jamais une information
 *   absente du texte ;
 * - `regarde` : « Ce que BLUSH regarde », les signes qu’il lit dans une conv, écrits à neuf (jamais tirés des prompts) ;
 * - `pieges` : « Les pièges », ce qu’il vaut mieux ne pas faire ;
 * - `aide` : le bloc d’aide, avec les numéros de src/contenu/aide.ts tels qu’ils sont (exigé en zone orange et rouge,
 *   dans la première section en zone rouge).
 */
export type BlocArticle =
  | { type: "paragraphe"; texte: string }
  | { type: "liste"; elements: readonly string[] }
  | { type: "conv"; repliques: readonly Replique[]; legende?: string }
  | { type: "blush"; bulles: readonly string[] }
  | { type: "regarde"; signes: readonly string[] }
  | { type: "pieges"; pieges: readonly string[] }
  | { type: "aide" };

/** Une section : son intertitre, une question qu’on se pose, et ses morceaux (la première phrase y répond seule). */
type SectionArticle = { question: string; blocs: readonly BlocArticle[] };

/** Une question de la FAQ, tirée de ce qu’on tape dans les moteurs, et sa réponse en deux ou trois phrases (en texte, sans balisage FAQPage). */
type QuestionFaq = { question: string; reponse: string };

/** Un article du registre (./index.ts). Les garde-fous de tests/unit/articles.test.ts vérifient chaque champ. */
export type Article = {
  /** Son adresse, courte, en minuscules et tirets : /guides/<slug> ou /lexique/<slug>. Unique dans tout le registre. */
  slug: string;
  genre: Genre;
  /** Le H1, la requête telle qu’on la tape (« Il met du temps à répondre : … »). Aussi le titre de la page et de son aperçu. */
  titre: string;
  /** La description pour les moteurs et les aperçus : une ou deux phrases. */
  description: string;
  /** Le mot-clé principal, un seul article par mot-clé (sinon les deux pages se gênent dans les moteurs). */
  motCle: string;
  zone: Zone;
  publieLe: Jour;
  /** Le jour du dernier changement de fond : la date la plus récente de `changements`, jamais une date changée seule. */
  misAJourLe: Jour;
  /** Les changements de fond, datés, la publication comprise. */
  changements: readonly Changement[];
  /** Qui a relu et signé (« relu par … ») : exigé, une vraie personne. */
  relecteur: Personne;
  /** L’expert qui a relu aussi (un psychologue, une association) : exigé en zone rouge. */
  expert?: Personne;
  /** Les sources, datées : deux au moins, cinq au plus. */
  sources: readonly Source[];
  /** « La réponse courte », de 40 à 60 mots, qui se lit seule (c’est elle que reprennent les moteurs et les assistants). */
  reponseCourte: string;
  /** Les sections, de trois à cinq pour un guide, aux intertitres en questions. */
  sections: readonly SectionArticle[];
  faq: readonly QuestionFaq[];
  /** Les slugs des articles liés (une entrée du lexique, des guides voisins) : ils existent dans le registre. */
  lies: readonly string[];
};
