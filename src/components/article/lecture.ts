import type { Article, BlocArticle, Replique } from "@/contenu/articles/types";

/*
 * Les règles pures que le gabarit des guides et du lexique lit dans un article du registre (src/contenu/articles), sans
 * rien y ajouter : les ancres des intertitres, le temps de lecture, le titre coupé en deux temps et ses mots surlignés
 * (`surligne`), l’attaque d’une section, l’appli de chaque mini-conv et la couverture d’un guide. Rien ici ne s’affiche :
 * les composants voisins les mettent en page.
 */

/** L’ancre d’un intertitre, tirée de son texte : « Il lit sans répondre ? » → « il-lit-sans-repondre ». */
export const ancre = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Le texte d’un morceau de section, tel qu’on le lit (pour compter ses mots). */
function texteDuBloc(b: BlocArticle): readonly string[] {
  switch (b.type) {
    case "paragraphe":
      return [b.texte];
    case "liste":
      return b.elements;
    case "conv":
      return [...b.repliques.map((r) => r.texte), b.legende ?? ""];
    case "blush":
      return b.bulles;
    case "regarde":
      return b.signes;
    case "pieges":
      return b.pieges;
    case "aide":
      return [];
  }
}

/** Les mots lus à la minute : un rythme de lecture à l’écran, prudent (on lit un guide, on ne le survole pas). */
const MOTS_PAR_MINUTE = 220;

/** Le temps de lecture d’un article, en minutes entières (une au moins) : tous ses mots, de la réponse courte à la FAQ. */
export function minutesDeLecture(article: Article): number {
  const textes = [article.reponseCourte, ...article.sections.flatMap((s) => [s.question, ...s.blocs.flatMap(texteDuBloc)]), ...article.faq.flatMap((q) => [q.question, q.reponse])];
  const mots = textes.reduce((n, t) => n + t.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));
}

/** Le surligneur d’un morceau du titre : la bulle rose (la situation, ce qu’on reçoit) ou la bleue (l’action, ce que tu envoies). */
export type Ton = "rose" | "bleu";

/** Un morceau du titre : son texte, et son surligneur s’il en a un. */
export type Morceau = { texte: string; ton?: Ton };

/**
 * Un texte coupé en morceaux autour de ses expressions surlignées (leur seule occurrence, garde-fous à l’appui) : les
 * titres des articles, et ceux des pages de confiance (src/components/juridique/confiance.tsx).
 */
export function decouper(texte: string, surlignes: readonly { ton: Ton; mots: string }[]): Morceau[] {
  const trouves = surlignes
    .map((s) => ({ ...s, debut: s.mots ? texte.indexOf(s.mots) : -1 }))
    .filter((t) => t.debut >= 0)
    .sort((a, b) => a.debut - b.debut);
  const morceaux: Morceau[] = [];
  let curseur = 0;
  for (const t of trouves) {
    if (t.debut < curseur) continue;
    if (t.debut > curseur) morceaux.push({ texte: texte.slice(curseur, t.debut) });
    morceaux.push({ texte: t.mots, ton: t.ton });
    curseur = t.debut + t.mots.length;
  }
  if (curseur < texte.length) morceaux.push({ texte: texte.slice(curseur) });
  return morceaux;
}

/** Les deux-points du titre, là où il se coupe en deux temps (une insécable, puis « : »). */
const DEUX_POINTS = "\u00a0:";

/**
 * Le titre d’un article en deux temps, comme un titre de magazine et son sous-titre : la requête telle qu’on la tape
 * (avant les deux-points), puis ce que l’article promet (après), chacun avec ses mots surlignés (`surligne` : la
 * situation en rose, l’action en bleu). Les deux restent un seul h1 au texte entier, celui du registre ; un titre sans
 * deux-points n’a pas de suite.
 */
export function titreEnDeuxTemps(article: Pick<Article, "titre" | "surligne">): { tete: Morceau[]; suite: Morceau[] | null } {
  const surlignes = [
    { ton: "rose", mots: article.surligne.situation },
    { ton: "bleu", mots: article.surligne.action },
  ] as const;
  const coupure = article.titre.indexOf(DEUX_POINTS);
  if (coupure < 0) return { tete: decouper(article.titre, surlignes), suite: null };
  return { tete: decouper(article.titre.slice(0, coupure), surlignes), suite: decouper(article.titre.slice(coupure + DEUX_POINTS.length).trimStart(), surlignes) };
}

/**
 * L’attaque d’un paragraphe : sa première phrase, qui répond seule à l’intertitre (on la lit d’abord), puis la suite. Le
 * texte reste entier, dans l’ordre ; un paragraphe d’une seule phrase n’a pas de suite.
 */
export function attaqueDe(texte: string): { attaque: string; suite: string } {
  /* La fin d’une phrase : sa ponctuation, puis une espace simple (le « ? » d’une citation, suivi d’une insécable et de « », reste dans sa phrase) */
  const fin = /[.!?…](?= +\S)/u.exec(texte);
  if (!fin) return { attaque: texte, suite: "" };
  return { attaque: texte.slice(0, fin.index + 1), suite: texte.slice(fin.index + 1).trimStart() };
}

/** L’appli d’une mini-conv : BLUSH lit les captures et les exports de toutes, ses exemples aussi passent de l’une à l’autre. */
export type Appli = "imessage" | "instagram" | "whatsapp";

/** Les applis, dans l’ordre où les mini-convs d’une page les prennent. */
const APPLIS: readonly Appli[] = ["imessage", "instagram", "whatsapp"];

/** L’appli de la mini-conv de rang `rang` dans sa page (la première en iMessage, la deuxième sur Instagram…). */
export const appliDuRang = (rang: number): Appli => APPLIS[rang % APPLIS.length] ?? "imessage";

/** Les mini-convs d’un article, dans l’ordre de la page, chacune avec son rang (son appli en dépend). */
function convsDe(article: Pick<Article, "sections">): { repliques: readonly Replique[]; rang: number }[] {
  return article.sections
    .flatMap((s) => s.blocs)
    .flatMap((b) => (b.type === "conv" ? [b.repliques] : []))
    .map((repliques, rang) => ({ repliques, rang }));
}

/** Ce que pèse une conv sur une couverture : le nombre de signes de ses répliques (les plus courtes tiennent sans se couper). */
const signesDe = (repliques: readonly Replique[]) => repliques.reduce((n, r) => n + r.texte.length, 0);

/**
 * La couverture d’un article : une de ses convs (son rang dans la page, et donc son appli) et une bulle de BLUSH. La conv
 * qui finit sur ton message resté sans réponse (l’attente, le sujet des guides), sinon la plus courte (elle tient entière
 * dans le téléphone) ; la page la garde ensuite à plat (BlocsArticle, `rangDeCouverture`) : le même téléphone ne revient
 * pas deux écrans plus bas. La bulle : la première du dernier bloc de BLUSH, la plus loin de la couverture dans la page,
 * et la première de son bloc (elle se lit seule, sans celle d’avant). Rien d’inventé : tout vient de l’article, la conv
 * garde sa pastille « exemple inventé ». Sans conv, pas de couverture.
 */
export function couvertureDe(article: Article): { repliques: readonly Replique[]; appli: Appli; rang: number; bulle: string | null } | null {
  const [choisie] = [...convsDe(article)].sort(
    (a, b) => Number(b.repliques.at(-1)?.de === "moi") - Number(a.repliques.at(-1)?.de === "moi") || signesDe(a.repliques) - signesDe(b.repliques),
  );
  if (!choisie) return null;
  const derniere = article.sections
    .flatMap((s) => s.blocs)
    .flatMap((b) => (b.type === "blush" ? [b.bulles] : []))
    .at(-1);
  /* En zone rouge, pas d’autocollant de BLUSH (aucune vanne) : le téléphone seul, sur la une et sur les cartes */
  return { repliques: choisie.repliques, appli: appliDuRang(choisie.rang), rang: choisie.rang, bulle: article.zone === "rouge" ? null : (derniere?.[0] ?? null) };
}
