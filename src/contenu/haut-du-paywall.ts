import { PAYWALL } from "@/contenu/paiement";
import type { ApercuDuPaywall, SignalDuPaywall, TendanceDuPaywall } from "@/types";

/*
 * Le haut du paywall (la maquette « Le mix » : le titre de H1, la bulle de H3, validée le 16 octobre) : un titre en deux
 * lignes, la seconde en rose, tiré de ce que le code a compté (src/server/ecrans/haut-du-paywall.ts), jamais du modèle.
 * Cinq titres sont en ligne ensemble, et chaque conv montre le sien, d’après ses chiffres (genreDuHaut) :
 *   1. tendance : ses messages ont chuté à une date, et ne sont pas remontés (« Depuis le 12 mars, Lucas t’écrit 2 fois moins. ») ;
 *   2. toi : tu portes la conv, 2 déséquilibres au moins de ton côté, 1 au plus du sien (« C’est toi qui portes la conv. ») ;
 *   3. elle : l’inverse (« Lucas court après toi. ») ;
 *   4. contraste : un de chaque côté au moins (« Tu ouvres la conv. Lucas, lui, revient. ») ;
 *   5. égalité : un déséquilibre au plus (« Vous êtes à égalité. Presque. »).
 * Sans assez de chiffres pour eux (une conv de quelques jours, des captures dont les heures sont approximatives), une
 * proposition du 27 octobre 2026 : le titre « volume », tiré de ce qui se compte sans l’heure des messages (qui écrit le
 * plus, qui pose les questions, qui écrit le plus long : « Tu lui envoies 2 fois plus de messages. »). Le titre d’avant
 * (« aucun ») ne reste qu’aux convs de moins de 10 messages. Le genre montré est gardé sur la conv (stories.accroche) :
 * /admin compte les achats de chacun, et le jour où « volume » a été compté la première fois : son taux se compare à
 * celui qu’avait le titre d’avant, sans A/B (trop peu de convs pour le trancher vite).
 */

/** Les titres du haut du paywall, dans l’ordre où la règle les essaie (aussi l’ordre de /admin). */
export const GENRES_DU_HAUT = ["tendance", "toi", "elle", "contraste", "egalite", "volume", "aucun"] as const;
export type GenreDuHaut = (typeof GENRES_DU_HAUT)[number];

/** Le nom d’un titre, dans /admin. */
export const NOM_DU_GENRE: Record<GenreDuHaut, string> = {
  tendance: "Tendance\u00a0: «\u00a0Depuis le…, il t’écrit 2 fois moins\u00a0»",
  toi: "Tout vient de toi\u00a0: «\u00a0C’est toi qui portes la conv\u00a0»",
  elle: "Tout vient de l’autre\u00a0: «\u00a0… court après toi\u00a0»",
  contraste: "Contraste\u00a0: «\u00a0Tu ouvres la conv. …, lui, revient\u00a0»",
  egalite: "Égalité\u00a0: «\u00a0Vous êtes à égalité. Presque\u00a0»",
  volume: "Sans heures\u00a0: «\u00a0Tu lui envoies 2 fois plus de messages\u00a0»",
  aucun: "Sans assez de chiffres\u00a0: le titre d’avant",
};

/** Un déséquilibre compte pour le titre quand il est net ; la longueur des messages, elle, ne fait qu’un détail. */
const compte = (s: SignalDuPaywall) => s.id !== "longueur" && s.cote !== "pareil";

/** Assez de chiffres pour dire « à égalité » : 5 jours de conv au moins, et un délai de réponse de chaque côté. */
function assezPourLEgalite(a: ApercuDuPaywall): boolean {
  const ouvre = a.signaux.find((s) => s.id === "ouvre");
  return !!ouvre && ouvre.toi + ouvre.elle >= 5 && a.signaux.some((s) => s.id === "delai");
}

/** Le titre d’une conv : la règle, dans l’ordre de GENRES_DU_HAUT. */
export function genreDuHaut(a: ApercuDuPaywall): GenreDuHaut {
  if (a.tendance) return "tendance";
  const nets = a.signaux.filter(compte);
  const toi = nets.filter((s) => s.cote === "toi").length;
  const elle = nets.length - toi;
  if (toi >= 2 && elle <= 1) return "toi";
  if (elle >= 2 && toi <= 1) return "elle";
  if (toi && elle) return "contraste";
  if (assezPourLEgalite(a)) return "egalite";
  return a.sansHeures ? "volume" : "aucun";
}

/* ———— Ce que l’écran montre ———— */

type Cote = SignalDuPaywall["cote"];

/** Une ligne de la carte (ordinateur) : ses deux chiffres et leur unité, la part de « toi » dans la barre, qui l’emporte. */
export type LigneDuHaut = { label: string; toi: { n: string; unite: string }; elle: { n: string; unite: string }; partToi: number; cote: Cote };

/** Une case (sous le titre sur téléphone, sous la courbe sur ordinateur) : un chiffre, son unité, ce qu’il dit. */
export type CaseDuHaut = { valeur: string; unite: string; texte: string; cote: Cote };

export type HautDuPaywall = {
  genre: GenreDuHaut;
  /** Une ligne (le titre d’avant), ou deux, la seconde en rose. */
  titre: [string] | [string, string];
  /** Sous le titre, sur ordinateur (sur téléphone, les cases le disent). */
  sous: string;
  /** La bulle de BLUSH, interrompue : ce qu’il t’écrit dans ton rapport. */
  question: string;
  /** La carte des déséquilibres (ordinateur), son titre et ses lignes ; null : la courbe à la place, ou rien. */
  carte: { titre: string; lignes: LigneDuHaut[] } | null;
  cases: CaseDuHaut[];
  courbe: TendanceDuPaywall | null;
};

/** L’autre personne : son prénom, tel que l’écran le montre, et son pronom. */
type Autre = { nom: string; il: boolean };

const H = 3600e3;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 12 mars », « 1er mars » ; l’année en plus quand ce n’est pas celle de `annee`. `court` : « 12 mars », « 3 janv. ». */
export function dateDuHaut(iso: string, { annee, court = false }: { annee?: number; court?: boolean } = {}): string {
  const [a, m, j] = iso.split("-").map(Number) as [number, number, number];
  const jour = `${j === 1 ? "1er" : j}\u00a0${(court ? MOIS_COURTS : MOIS)[m - 1]}`;
  return annee !== undefined && a !== annee ? `${jour} ${a}` : jour;
}

/** Le premier jour de la semaine `i` de la courbe (AAAA-MM-JJ) : la semaine de la chute commence à `depuis`. */
export const semaineDeLaCourbe = (t: TendanceDuPaywall, i: number) => new Date(Date.parse(t.depuis) + (i - t.coupure) * 7 * 24 * H).toISOString().slice(0, 10);

/** Les autres textes du haut du paywall. */
export const TEXTES_DU_HAUT = {
  /** Ta réponse à la bulle de BLUSH, en bleu, comme dans une messagerie. */
  reponse: "vas-y dis-moi",
  toi: "Toi",
  /** Au-dessus de la courbe (ordinateur). */
  courbe: "Ses messages par jour, semaine par semaine",
  /** Ce que dit la courbe, pour un lecteur d’écran. */
  courbeLue: (avant: string, apres: string, depuis: string) => `Ses messages par jour, semaine par semaine\u00a0: ${avant} avant, ${apres} depuis le ${depuis}`,
};

/** « 4,5 », « 38 » : un nombre de messages par jour. */
export const nombre = (x: number) => String(x).replace(".", ",");

const sur10 = (x: number, y: number) => (x + y ? Math.round((10 * x) / (x + y)) : 5);
const fois = (x: number, y: number) => Math.round(x / Math.max(1, y));
/** Combien de fois plus, sans arrondir 1,5 à 2 ni 4,5 à 5 : au dixième sous 10 (« 1,6 », « 2 », « 4,5 »), à l’unité au-delà (« 12 »). */
const combienDeFois = (x: number, y: number) => {
  const r = x / Math.max(1, y);
  return r >= 10 ? String(Math.round(r)) : nombre(Math.round(r * 10) / 10);
};

/** Un délai : « 4 » « min », « 2 » « h ». */
function duree(ms: number): { n: string; unite: string } {
  return ms < H ? { n: String(Math.max(1, Math.round(ms / 60e3))), unite: "min" } : { n: String(Math.round(ms / H)), unite: "h" };
}
const enTexte = (d: { n: string; unite: string }) => `${d.n}\u00a0${d.unite}`;

/** La première lettre en minuscule, sauf quand la phrase commence par son prénom. */
const ensuite = (phrase: string, a: Autre) => (phrase.startsWith(a.nom) ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1));

const pronoms = (a: Autre) => ({ il: a.il ? "il" : "elle", lui: a.il ? "lui" : "elle", le: a.il ? "le" : "la", de: a.il ? "de lui" : "d’elle" });

const LABELS: Record<SignalDuPaywall["id"], string> = {
  ouvre: "Ouvre la journée",
  reprend: "Reprend après un silence",
  relance: "Relance sans réponse",
  delai: "Répond le plus vite",
  longueur: "Écrit le plus long",
  messages: "Envoie le plus de messages",
  questions: "Pose les questions",
};

/** Le début du titre, de ton côté. */
const TITRE_TOI: Record<SignalDuPaywall["id"], string> = {
  ouvre: "Tu ouvres la conv.",
  reprend: "Tu reviens après les silences.",
  relance: "Tu relances.",
  delai: "Tu réponds vite.",
  longueur: "Tu écris plus long.",
  messages: "Tu écris plus.",
  questions: "Tu poses les questions.",
};

/** La ligne rose, du sien : « Lucas, lui, revient. » */
const TITRE_ELLE: Record<SignalDuPaywall["id"], string> = {
  ouvre: "ouvre la conv.",
  reprend: "revient.",
  relance: "relance.",
  delai: "répond vite.",
  longueur: "écrit plus long.",
  messages: "écrit plus.",
  questions: "pose les questions.",
};
const titreElle = (s: SignalDuPaywall, a: Autre) => `${a.nom}, ${pronoms(a).lui}, ${TITRE_ELLE[s.id]}`;

/** Ce que dit un déséquilibre net, en une phrase, avec ses chiffres. */
function phrase(s: SignalDuPaywall, a: Autre): string {
  const { lui } = pronoms(a);
  const elle = s.cote === "elle";
  switch (s.id) {
    case "ouvre":
      return elle ? `${sur10(s.elle, s.toi)} jours sur 10, c’est ${a.nom} qui dit bonjour.` : `${sur10(s.toi, s.elle)} jours sur 10, c’est toi qui dis bonjour.`;
    case "reprend":
      return elle
        ? `Après un silence, c’est ${a.nom} qui reprend, ${sur10(s.elle, s.toi)} fois sur 10.`
        : `Après un silence, c’est toi qui reprends, ${sur10(s.toi, s.elle)} fois sur 10.`;
    case "relance":
      if (elle) return s.toi === 0 ? `${a.nom} relance, toi jamais.` : `${a.nom} relance ${fois(s.elle, s.toi)} fois plus que toi.`;
      return s.elle === 0 ? `Tu relances, ${lui} jamais.` : `Tu relances ${fois(s.toi, s.elle)} fois plus que ${lui}.`;
    case "delai":
      return `${a.nom} te répond en ${enTexte(duree(s.elle))}, toi en ${enTexte(duree(s.toi))}.`;
    case "longueur":
      return elle ? `${a.nom} écrit ${fois(s.elle, s.toi)} fois plus long que toi.` : `Tu écris ${fois(s.toi, s.elle)} fois plus long que ${lui}.`;
    case "messages":
      return elle
        ? `${a.nom} t’envoie ${combienDeFois(s.elle, s.toi)} fois plus de messages que toi\u00a0: ${s.elle} contre ${s.toi}.`
        : `Tu lui envoies ${combienDeFois(s.toi, s.elle)} fois plus de messages\u00a0: ${s.toi} contre ${s.elle}.`;
    case "questions":
      if (elle) return s.toi === 0 ? `${a.nom} te pose ${s.elle} questions, toi aucune.` : `${a.nom} te pose ${combienDeFois(s.elle, s.toi)} fois plus de questions que toi.`;
      return s.elle === 0 ? `Tu lui poses ${s.toi} questions, ${lui} aucune.` : `Tu poses ${combienDeFois(s.toi, s.elle)} fois plus de questions que ${lui}.`;
  }
}

/** La ligne d’un déséquilibre sur la carte. */
function ligne(s: SignalDuPaywall): LigneDuHaut {
  const base = { label: LABELS[s.id], cote: s.cote };
  const part = (x: number, y: number) => (x + y ? Math.round((100 * x) / (x + y)) : 50);
  switch (s.id) {
    case "ouvre":
    case "reprend": {
      const t = sur10(s.toi, s.elle);
      return { ...base, toi: { n: String(t), unite: "sur 10" }, elle: { n: String(10 - t), unite: "sur 10" }, partToi: t * 10 };
    }
    case "relance":
      return { ...base, toi: { n: String(s.toi), unite: "fois" }, elle: { n: String(s.elle), unite: "fois" }, partToi: part(s.toi, s.elle) };
    /* Le plus rapide a la plus grande part de la barre */
    case "delai":
      return { ...base, toi: duree(s.toi), elle: duree(s.elle), partToi: part(s.elle, s.toi) };
    case "longueur":
      return { ...base, toi: { n: String(Math.round(s.toi)), unite: "mots" }, elle: { n: String(Math.round(s.elle)), unite: "mots" }, partToi: part(s.toi, s.elle) };
    case "messages":
      return { ...base, toi: { n: String(s.toi), unite: "msg" }, elle: { n: String(s.elle), unite: "msg" }, partToi: part(s.toi, s.elle) };
    case "questions":
      return { ...base, toi: { n: String(s.toi), unite: "fois" }, elle: { n: String(s.elle), unite: "fois" }, partToi: part(s.toi, s.elle) };
  }
}

/** La case d’un déséquilibre : son chiffre le plus parlant, et ce qu’il dit. */
function caseDe(s: SignalDuPaywall, a: Autre): CaseDuHaut {
  const { il, lui, de } = pronoms(a);
  const elle = s.cote === "elle";
  const cote = s.cote;
  switch (s.id) {
    case "ouvre":
    case "reprend": {
      const quoi = s.id === "ouvre" ? "ouvre la journée" : "reprend après un silence";
      if (cote === "pareil") return { valeur: `${sur10(s.toi, s.elle)}–${10 - sur10(s.toi, s.elle)}`, unite: "", texte: `qui ${quoi}`, cote };
      return elle
        ? { valeur: String(sur10(s.elle, s.toi)), unite: "\u00a0/10", texte: `${il} ${quoi}`, cote }
        : { valeur: String(sur10(s.toi, s.elle)), unite: "\u00a0/10", texte: s.id === "ouvre" ? "tu ouvres la journée" : "tu reprends après un silence", cote };
    }
    case "relance":
      if (elle)
        return s.toi === 0
          ? { valeur: String(s.elle), unite: "\u00a0fois", texte: `${il} relance, toi jamais`, cote }
          : { valeur: `${fois(s.elle, s.toi)}×`, unite: "", texte: `${il} relance plus que toi`, cote };
      return s.elle === 0
        ? { valeur: String(s.toi), unite: "\u00a0fois", texte: `tu relances, ${lui} jamais`, cote }
        : { valeur: `${fois(s.toi, s.elle)}×`, unite: "", texte: `tu relances plus que ${lui}`, cote };
    case "delai": {
      if (cote === "pareil") {
        const d = duree(Math.max(s.toi, s.elle));
        return { valeur: d.n, unite: `\u00a0${d.unite}`, texte: "pour vous répondre", cote };
      }
      const d = duree(elle ? s.elle : s.toi);
      return { valeur: d.n, unite: `\u00a0${d.unite}`, texte: elle ? `pour qu’${il} te réponde` : "pour que tu répondes", cote };
    }
    case "longueur":
      if (cote === "pareil") return { valeur: `${Math.round(s.toi)}–${Math.round(s.elle)}`, unite: "", texte: "mots par message", cote };
      return { valeur: `${fois(elle ? s.elle : s.toi, elle ? s.toi : s.elle)}×`, unite: "", texte: elle ? `${il} écrit plus long` : "tu écris plus long", cote };
    case "messages":
      if (cote === "pareil") return { valeur: `${s.toi}–${s.elle}`, unite: "", texte: "messages envoyés", cote };
      return elle
        ? { valeur: `${combienDeFois(s.elle, s.toi)}×`, unite: "", texte: `${il} t’écrit plus`, cote }
        : { valeur: `${combienDeFois(s.toi, s.elle)}×`, unite: "", texte: "tu lui écris plus", cote };
    case "questions":
      if (cote === "pareil") return { valeur: `${s.toi}–${s.elle}`, unite: "", texte: "questions posées", cote };
      if (elle)
        return s.toi === 0
          ? { valeur: String(s.elle), unite: "\u00a0questions", texte: `${de}, aucune de toi`, cote }
          : { valeur: `${combienDeFois(s.elle, s.toi)}×`, unite: "", texte: `${il} pose plus de questions`, cote };
      return s.elle === 0
        ? { valeur: String(s.toi), unite: "\u00a0questions", texte: `de toi, aucune ${de}`, cote }
        : { valeur: `${combienDeFois(s.toi, s.elle)}×`, unite: "", texte: "tu poses plus de questions", cote };
  }
}

/** Ce que tu le fais attendre (il répond plus vite que toi) : ton délai, et le sien. */
function attente(delai: SignalDuPaywall, a: Autre): CaseDuHaut {
  const d = duree(delai.toi);
  return { valeur: d.n, unite: `\u00a0${d.unite}`, texte: `pour lui répondre, ${pronoms(a).lui} ${enTexte(duree(delai.elle))}`, cote: "toi" };
}

/** Le plus fort d’un côté, dans un ordre de préférence. */
const premier = (nets: SignalDuPaywall[], ordre: SignalDuPaywall["id"][]) => [...nets].sort((x, y) => ordre.indexOf(x.id) - ordre.indexOf(y.id))[0];
/** Ce qui court après l’autre, le plus parlant d’abord ; ce qu’il fait, lui, face à toi (le contraste), le plus parlant d’abord. */
const ORDRE_TOI: SignalDuPaywall["id"][] = ["ouvre", "relance", "reprend", "delai"];
const ORDRE_ELLE: SignalDuPaywall["id"][] = ["reprend", "relance", "ouvre", "delai"];

const QUESTION = (fin: string) => `BLUSH t’écrit ${fin}`;

/** La première ligne du titre « volume », d’un déséquilibre net sans heures : qui écrit plus, qui pose les questions, qui écrit plus long. */
function titreSansHeures(s: SignalDuPaywall, a: Autre): string {
  const elle = s.cote === "elle";
  switch (s.id) {
    case "messages":
      return elle ? `${a.nom} t’envoie ${combienDeFois(s.elle, s.toi)} fois plus de messages.` : `Tu lui envoies ${combienDeFois(s.toi, s.elle)} fois plus de messages.`;
    case "questions":
      if (elle) return s.toi === 0 ? `C’est ${a.nom} qui pose toutes les questions.` : `${a.nom} te pose ${combienDeFois(s.elle, s.toi)} fois plus de questions.`;
      return s.elle === 0 ? "C’est toi qui poses toutes les questions." : `Tu poses ${combienDeFois(s.toi, s.elle)} fois plus de questions.`;
    default:
      return phrase(s, a);
  }
}

/** Le haut du paywall d’une conv, d’après ses chiffres : son titre, sa phrase, la bulle de BLUSH, la carte et les cases. */
export function hautDuPaywall(a: ApercuDuPaywall, autre: Autre, { annee = new Date().getFullYear() }: { annee?: number } = {}): HautDuPaywall {
  const genre = genreDuHaut(a);
  const { il, lui, le } = pronoms(autre);
  const nets = a.signaux.filter(compte);
  const deToi = nets.filter((s) => s.cote === "toi");
  const deLui = nets.filter((s) => s.cote === "elle");
  const lignes = (liste: SignalDuPaywall[]) => liste.slice(0, 3).map(ligne);

  switch (genre) {
    case "tendance": {
      const t = a.tendance!;
      const ratio = t.apres ? t.avant / t.apres : Infinity;
      const moins = ratio >= 5 ? null : ratio >= 1.8 ? `${Math.round(ratio)} fois moins` : `${Math.round((1 - t.apres / t.avant) * 10) * 10}\u00a0% de moins`;
      const delai = t.delai ? { avant: duree(t.delai.avant), apres: duree(t.delai.apres) } : null;
      return {
        genre,
        titre: [`Depuis le ${dateDuHaut(t.depuis, { annee })},`, moins ? `${autre.nom} t’écrit ${moins}.` : `${autre.nom} ne t’écrit presque plus.`],
        sous:
          `Avant, ${il} t’envoyait ${nombre(t.avant)} messages par jour. Depuis, ${nombre(t.apres)}.` +
          (delai ? ` Et ${il} met ${enTexte(delai.apres)} à te répondre, contre ${enTexte(delai.avant)} avant.` : ""),
        question: QUESTION("ce qui a changé"),
        carte: null,
        cases: [
          { valeur: `${nombre(t.avant)} → ${nombre(t.apres)}`, unite: "", texte: "messages par jour", cote: "elle" },
          ...(delai ? [{ valeur: `${enTexte(delai.avant)} → ${enTexte(delai.apres)}`, unite: "", texte: "pour te répondre", cote: "elle" as const }] : []),
        ],
        courbe: t,
      };
    }
    case "toi": {
      const [t1, t2] = [premier(deToi, ORDRE_TOI)!, ...deToi.filter((s) => s !== premier(deToi, ORDRE_TOI))];
      const sien = deLui[0];
      return {
        genre,
        titre: ["C’est toi qui portes la conv.", sien ? titreElle(sien, autre) : `${autre.nom}, ${lui}, répond.`],
        sous: [phrase(t1, autre), t2 && phrase(t2, autre), sien && `Mais ${ensuite(phrase(sien, autre), autre)}`].filter(Boolean).join(" "),
        question: QUESTION(`ce que ça dit de ${lui}`),
        carte: { titre: "Qui porte la conv", lignes: lignes([t1, ...(t2 ? [t2] : []), ...(sien ? [sien] : [])]) },
        cases: [caseDe(t1, autre), caseDe(sien ?? t2!, autre)],
        courbe: null,
      };
    }
    case "elle": {
      /* Plus rapide que toi, il le dit en rose (« Toi, tu le fais attendre ») : son délai passe dans la phrase, après le reste */
      const plusRapide = deLui.find((s) => s.id === "delai");
      const [e1, e2] = [...deLui.filter((s) => s !== plusRapide)].sort((x, y) => ORDRE_TOI.indexOf(x.id) - ORDRE_TOI.indexOf(y.id));
      const tien = deToi[0];
      const preuves = [e1!, ...(e2 ? [e2] : []), ...(plusRapide ? [plusRapide] : [])];
      return {
        genre,
        titre: [
          `${autre.nom} court après toi.`,
          plusRapide ? `Toi, tu ${le} fais attendre.` : tien ? `Toi, ${ensuite(TITRE_TOI[tien.id], autre)}` : `Toi, tu ${le} laisses venir.`,
        ],
        sous: [...preuves.map((s) => phrase(s, autre)), tien && `Mais ${ensuite(phrase(tien, autre), autre)}`].filter(Boolean).join(" "),
        question: QUESTION(`ce qu’${il} attend de toi`),
        carte: { titre: "Qui court après qui", lignes: lignes([...preuves, ...(tien ? [tien] : [])]) },
        /* Plus rapide que toi : la seconde case le prouve (« 2 h pour lui répondre, lui 3 min »), comme la ligne rose le dit */
        cases: [caseDe(e1!, autre), plusRapide ? attente(plusRapide, autre) : caseDe(preuves[1] ?? tien!, autre)],
        courbe: null,
      };
    }
    case "contraste": {
      const tien = premier(deToi, ORDRE_TOI)!;
      const sien = premier(deLui, ORDRE_ELLE)!;
      const pourquoi: Partial<Record<SignalDuPaywall["id"], string>> = {
        reprend: `pourquoi ${il} revient`,
        relance: `pourquoi ${il} relance`,
        delai: `pourquoi ${il} répond si vite`,
      };
      return {
        genre,
        titre: [TITRE_TOI[tien.id], titreElle(sien, autre)],
        sous: `${phrase(tien, autre)} Mais ${ensuite(phrase(sien, autre), autre)}`,
        question: QUESTION(pourquoi[sien.id] ?? "ce que ça veut dire"),
        carte: { titre: "Qui fait le premier pas", lignes: lignes([tien, sien, ...nets.filter((s) => s !== tien && s !== sien)]) },
        cases: [caseDe(tien, autre), caseDe(sien, autre)],
        courbe: null,
      };
    }
    case "egalite": {
      /* Le détail qui penche : le seul déséquilibre net, ou la longueur des messages */
      const detail = nets[0] ?? a.signaux.find((s) => s.id === "longueur" && s.cote !== "pareil");
      const ouvre = a.signaux.find((s) => s.id === "ouvre")!;
      const delai = a.signaux.find((s) => s.id === "delai")!;
      return {
        genre,
        titre: ["Vous êtes à égalité.", detail ? "Presque." : "Ce qui se joue est ailleurs."],
        sous: detail
          ? `Personne ne court après l’autre. Un seul chiffre penche\u00a0: ${ensuite(phrase(detail, autre), autre)}`
          : "Personne ne court après l’autre\u00a0: vous ouvrez la conv et vous répondez à peu près autant l’un que l’autre.",
        question: QUESTION(detail ? "ce que ce détail veut dire" : "ce qui se joue vraiment"),
        carte: { titre: "Qui fait quoi", lignes: lignes([ouvre, delai, ...(detail && detail !== ouvre && detail !== delai ? [detail] : [])]) },
        cases: [
          detail ? caseDe(detail, autre) : caseDe({ ...ouvre, cote: "pareil" }, autre),
          detail === delai ? caseDe({ ...ouvre, cote: "pareil" }, autre) : caseDe({ ...delai, cote: "pareil" }, autre),
        ],
        courbe: null,
      };
    }
    case "volume": {
      /* Sans heures : ce qui se compte quand même (des messages, des questions, leur longueur), dans cet ordre */
      const liste = a.sansHeures ?? [];
      const messages = liste.find((s) => s.id === "messages")!;
      const questions = liste.find((s) => s.id === "questions");
      const longueur = liste.find((s) => s.id === "longueur");
      const carte = { titre: "Qui écrit le plus", lignes: lignes(liste) };
      const nets = liste.filter((s) => s.cote !== "pareil");
      const n1 = nets[0];
      /* Personne n’écrit nettement plus : leurs chiffres, à peu près pareils, et ce qui se joue ailleurs */
      if (!n1) {
        const second = questions && questions.toi + questions.elle > 0 ? questions : longueur;
        return {
          genre,
          titre: ["Vous vous écrivez autant.", "Ce qui se joue est ailleurs."],
          sous: `Personne ne court après l’autre\u00a0: ${messages.toi} messages pour toi, ${messages.elle} pour ${lui}.`,
          question: QUESTION("ce qui se joue vraiment"),
          carte,
          cases: [caseDe(messages, autre), ...(second ? [caseDe(second, autre)] : [])],
          courbe: null,
        };
      }
      const toi = n1.cote === "toi";
      const oppose = nets.find((s) => s.cote !== n1.cote);
      /* La seconde case : le déséquilibre d’en face, un autre du même côté, ou le compte des messages (ou des questions) */
      const compteur = n1.id === "messages" ? (questions && questions.toi + questions.elle > 0 ? questions : null) : messages;
      const seconde = oppose ?? nets[1] ?? (compteur && { ...compteur, cote: "pareil" as const });
      return {
        genre,
        titre: [
          titreSansHeures(n1, autre),
          toi ? (oppose ? titreElle(oppose, autre) : `${autre.nom}, ${lui}, répond.`) : oppose ? `Toi, ${ensuite(TITRE_TOI[oppose.id], autre)}` : `Toi, tu ${le} laisses venir.`,
        ],
        sous: [...nets.filter((s) => s !== oppose).map((s) => phrase(s, autre)), oppose && `Mais ${ensuite(phrase(oppose, autre), autre)}`].filter(Boolean).join(" "),
        question: QUESTION(toi ? `ce que ça dit de ${lui}` : `ce qu’${il} attend de toi`),
        carte,
        cases: [caseDe(n1, autre), ...(seconde ? [caseDe(seconde, autre)] : [])],
        courbe: null,
      };
    }
    case "aucun":
      /* La bulle de BLUSH dit déjà la promesse : pas de phrase dessous */
      return { genre, titre: [PAYWALL.titre(autre.nom)], sous: "", question: QUESTION("ce qui se passe entre vous"), carte: null, cases: [], courbe: null };
  }
}
