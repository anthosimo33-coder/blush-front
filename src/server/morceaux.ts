import "server-only";
import { lire, type Format, type Histoire, type Lecture, type Message } from "@prompts/lib/conv";
import { idMessage } from "@prompts/lib/ligne";
import { accordDesNoms, aplatir, estUnSurnom, memeCle, prenomDe } from "@prompts/lib/noms";
import { nomLu } from "@/lib/participants";
import { ErreurPublique } from "./erreurs";
import type { CodeErreur } from "@/types/erreurs-api";
import { norm } from "./video";

/*
 * Une conv en plusieurs morceaux : un export, puis des captures (ou une vidéo), puis un autre export avec la même
 * personne. Chaque morceau garde son texte tel qu’importé, dans son format (la conv brute, chiffrée) ; ils se
 * réunissent à chaque lecture : chacun lu dans son format, rangés par date, et un message vu dans deux morceaux gardé
 * une fois (celui d’un export d’abord : son heure est exacte). Les messages venus de captures gardent leur heure
 * approximative, que la lecture sait déjà dire (« ~21:05 », « --:-- ») et qu’elle ne compte pas dans les délais.
 * « Moi », sur des captures, est toujours celui qui importe : « Qui es-tu ? » le relie au bon nom de l’export (meta.moi).
 * Avant, sa place est devinée (le nom de l’autre, les messages en commun), seulement pour ce que montrent les écrans.
 * Ici, rien ne touche la base : histoires.ts garde les morceaux (ajouterMorceau) et la chaîne les relit (analyse.ts).
 */

/** Le nom de celui qui importe des captures (versTexteCaptures, prompts/lib/captures.ts) : « Moi », à droite de l’écran. */
export const MOI = "Moi";
/** Au plus 5 morceaux par conv : l’écran ne propose plus d’en ajouter, le serveur refuse (« trop »). */
export const MORCEAUX_MAX = 5;
/** Les messages en commun qui prouvent que deux morceaux sont la même conv, quels que soient les noms. */
const COMMUNS_MIN = 3;

/** Un morceau de la conv, tel que la conv brute le garde : son texte importé, dans son format, et qui y parle. */
export type Morceau = {
  format: Format;
  texte: string;
  /**
   * Les noms de ses deux participants dans son texte, rangés comme ceux de la conv (meta.participants) : le premier est
   * le participant 0. Des captures : « Moi » et l’autre ; avant « Qui es-tu ? », la place de « Moi » est devinée (relier).
   */
  noms: [string, string];
  /** L’empreinte de son texte : le même fichier ajouté deux fois ne fait pas un morceau de plus. */
  empreinte: string;
  /** La clé de son envoi (des captures) : un nouvel essai après une coupure retrouve le morceau déjà ajouté. */
  cle?: string;
};

/** La conv brute d’une conv en plusieurs morceaux (stories.conv), ses morceaux dans l’ordre de leur import. */
export type ConvEnMorceaux = { morceaux: Morceau[] };

/** Un morceau reçu, pas encore relié à la conv : ses noms dans son texte (le plus bavard d’abord ; des captures, « Moi » d’abord). */
export type MorceauRecu = Omit<Morceau, "noms"> & {
  noms: [string, string];
  /** Le nom qui désigne l’autre dans ce morceau, quand un nom le dit : le haut des captures, le nom du fichier WhatsApp. */
  contact?: string;
};

/** Un ajout refusé : un morceau avec quelqu’un d’autre, ou qui n’apporte aucun message nouveau. */
export class ErreurMorceau extends ErreurPublique<Extract<CodeErreur, "autre_conv" | "rien_de_neuf" | "trop">> {}

/* ———— Les noms ———— */

/** Un vrai nom, lu : ni « Moi », ni « Elle » (pas lu), ni un numéro, ni un compte supprimé. */
const vraiNom = (nom: string) => nom !== MOI && nomLu(nom);
/**
 * Un nom qui dit un prénom : un vrai nom, et pas un surnom (« Bébé ❤️ », « Mon amour »). Deux prénoms différents disent
 * deux personnes différentes ; un surnom face à un prénom, non : le même contact peut être « Bébé » dans un téléphone et
 * « Léa » sur Instagram.
 */
const prenomSur = (nom: string) => vraiNom(nom) && !estUnSurnom(nom);
/** Deux noms du même prénom (deux vrais noms, memeCle) : « Léa 🌸 » sur WhatsApp, « Léa Dupont » sur Instagram, « Anne Sophie » et « Anne-Sophie ». */
export const memePrenom = (a: string, b: string) => vraiNom(a) && vraiNom(b) && memeCle(a, b);
/** Le prénom de deux vrais noms, accordé : `2` les mêmes mots, `1` le même début (« Marie » et « Marie-Lou »), `0` non. */
const accordDuPrenom = (a: string, b: string) => (vraiNom(a) && vraiNom(b) ? accordDesNoms(a, b) : 0);
/**
 * La place du nom (parmi deux) qui a ce prénom : celle qui a ses mots, sinon son début (« Marie-Lou » face à « Marie » et
 * « Marie-Lou 🌸 » : la seconde) ; aucune si les deux l’ont autant (deux Léa), ou aucun.
 */
const placeDuPrenom = (noms: readonly [string, string], nom: string) => {
  const [a, b] = [accordDuPrenom(noms[0], nom), accordDuPrenom(noms[1], nom)];
  return a === b ? undefined : a > b ? 0 : 1;
};

/**
 * Le nom que le fichier d’un export WhatsApp désigne : « Discussion WhatsApp avec Léa.txt », « WhatsApp Chat - Léa
 * 🌸.zip » nomment le contact, l’autre personne. Un seul des deux noms, parmi les mots du fichier ; sinon, rien.
 */
export function contactDuFichier(fichier: string, noms: readonly string[]): string | undefined {
  const mots = new Set(aplatir(fichier).split(/[^\p{L}\p{N}]+/u));
  /* Tous les mots de son prénom (« Marie-Lou » : marie et lou), pour ne pas désigner Marie-Claire */
  const nommes = noms.filter(
    (n) =>
      vraiNom(n) &&
      aplatir(prenomDe(n))
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .every((m) => mots.has(m)),
  );
  return nommes.length === 1 ? nommes[0] : undefined;
}

/* ———— Lire et réunir ———— */

/** Ce qui compare deux messages : leur texte sans accents, ponctuation ni espaces (ses 300 premiers caractères), ou un média. */
const texteCompare = (m: Message) => (m.media ? "#" : norm(m.texte.slice(0, 1200)).slice(0, 300) || m.texte.replace(/\s+/g, "").slice(0, 60));
/* À la minute près : un export Android n’a pas les secondes d’un export iPhone */
const cleExacte = (m: Message) => `${m.role}|${Math.floor(m.t / 60e3)}|${texteCompare(m)}`;
/* Une capture n’a que l’heure de son repère, ou son jour : le même jour, à un jour près (une date mal lue) */
const cleDuJour = (m: Message, decalage = 0) => `${m.role}|${Math.floor(m.t / 864e5) + decalage}|${texteCompare(m)}`;

/** Un morceau lu : ses messages, dans l’ordre de son texte, et si leurs heures sont exactes (un export). */
type Lu = { messages: Message[]; exact: boolean };

/** Prend, dans l’index des morceaux déjà réunis, un message de l’une de ces clés que ce morceau n’a pas encore pris. */
function prendre(index: Map<string, number>, pris: Map<string, number>, cles: string[]): boolean {
  for (const c of cles) {
    const n = pris.get(c) ?? 0;
    if (n < (index.get(c) ?? 0)) {
      pris.set(c, n + 1);
      return true;
    }
  }
  return false;
}

/**
 * Les morceaux lus, réunis : les exports d’abord, puis les captures, chacun dans l’ordre de son import. Un message déjà
 * vu dans un morceau d’avant (même auteur, même texte ; à la même minute entre deux exports, le même jour à un près pour
 * des captures) n’est pas gardé deux fois. Autant de fois qu’il est écrit, pas plus : trois « ok » à la même minute dans
 * deux exports restent trois. Puis tout se range par date, et se renumérote ; chaque message garde le rang de son
 * morceau (`morceau`), dont le premier message ne compte pas dans les chiffres (chiffrer, prompts/lib/conv.ts). Le temps
 * croît comme le nombre de messages.
 */
export function reunir(lus: Lu[]): { messages: Message[]; doublons: number; gardes: number[] } {
  const exactes = new Map<string, number>();
  const duJour = new Map<string, number>();
  const gardes = lus.map(() => 0);
  const tous: { m: Message; k: number; i: number }[] = [];
  let doublons = 0;
  const ordre = lus.map((_, k) => k).sort((a, b) => Number(!lus[a]!.exact) - Number(!lus[b]!.exact) || a - b);
  for (const k of ordre) {
    const { messages, exact } = lus[k]!;
    const pris = new Map<string, number>();
    const nouveaux: Message[] = [];
    messages.forEach((m, i) => {
      const deja = exact && m.approx === false ? prendre(exactes, pris, [cleExacte(m)]) : prendre(duJour, pris, [cleDuJour(m), cleDuJour(m, -1), cleDuJour(m, 1)]);
      if (deja) return void doublons++;
      nouveaux.push(m);
      tous.push({ m, k, i });
      gardes[k]!++;
    });
    /* Indexés une fois le morceau lu : un morceau ne se compare pas à lui-même (deux « ok » de suite y restent deux) */
    for (const m of nouveaux) {
      exactes.set(cleExacte(m), (exactes.get(cleExacte(m)) ?? 0) + 1);
      duJour.set(cleDuJour(m), (duJour.get(cleDuJour(m)) ?? 0) + 1);
    }
  }
  tous.sort((a, b) => a.m.t - b.m.t || a.k - b.k || a.i - b.i);
  return { messages: tous.map(({ m, k }, n) => ({ ...m, id: idMessage(n + 1), ligne: n + 1, morceau: k })), doublons, gardes };
}

/** Qui est toi dans la conv réunie : le participant `k` ; `connu`, « Qui es-tu ? » l’a dit (« Moi », sur des captures, est alors lui). */
export type QuiLit = { k: 0 | 1; connu: boolean };

/**
 * Un morceau lu dans son format, ses deux participants nommés comme ceux de la conv (`h`) : « toi » est le participant
 * `qui.k`. Un nom qui n’est pas l’un des deux reste du texte (un message collé d’un autre), comme à l’import.
 */
function lireMorceau(m: Pick<Morceau, "format" | "texte" | "noms">, h: Pick<Histoire, "utilisateur" | "autre">, qui: QuiLit): Lu {
  let toi = m.noms[qui.k];
  let autre = m.noms[qui.k === 0 ? 1 : 0];
  if (qui.connu && m.format === "captures") [toi, autre] = [MOI, m.noms.find((n) => n !== MOI) ?? autre];
  const lu = lire(m.texte, { utilisateur: { ...h.utilisateur, nomExport: toi }, autre: { ...h.autre, nomExport: autre }, format: m.format }, { autresEnTexte: true });
  return {
    messages: lu.messages.map((x) => ({ ...x, nom: x.role === "toi" ? h.utilisateur.nomExport : h.autre.nomExport })),
    exact: m.format !== "captures",
  };
}

/**
 * La conv réunie, comme la lecture d’un seul texte (rendre, prompts/lib/conv.ts, la reçoit telle quelle) : ses messages
 * rangés et renumérotés, ses deux participants, et ses captures (leur nombre, lu en tête de chaque morceau de captures).
 * `doublons` : les messages vus deux fois ; `gardes` : ce que chaque morceau apporte.
 */
export function lectureReunie(
  conv: ConvEnMorceaux,
  h: Pick<Histoire, "utilisateur" | "autre">,
  qui: QuiLit,
): Lecture & { doublons: number; gardes: number[]; parMorceau: Message[][] } {
  const lus = conv.morceaux.map((m) => lireMorceau(m, h, qui));
  const { messages, doublons, gardes } = reunir(lus);
  const captures = conv.morceaux.reduce((n, m) => n + (m.format === "captures" ? +(m.texte.match(/^# captures · [^\n]* · (\d+) captures?/)?.[1] ?? 0) : 0), 0);
  return {
    messages,
    /* Ce que la lecture de chaque morceau a noté ou jeté reste à son import : la conv réunie ne le redit pas */
    problemes: [],
    inconnues: { lignes: 0, forme: null },
    participants: [...new Set(messages.map((m) => m.nom))],
    captures: captures || null,
    doublons,
    gardes,
    parMorceau: lus.map((l) => l.messages),
  };
}

/* ———— Relier un morceau à la conv ———— */

/** Ce qu’on sait de qui est qui dans la conv : les noms de ses participants, celui qui importe (des captures seules), l’autre (quand un nom l’a désigné). */
export type Identite = { noms: [string, string]; moi?: 0 | 1; contact?: 0 | 1 };

/** Deux noms rangés tels quels, ou croisés. */
const croiser = ([a, b]: [string, string], croise: boolean): [string, string] => (croise ? [b, a] : [a, b]);
/** Un morceau lu, toi et l’autre échangés : ses noms croisés. */
const inverser = (l: Lu): Lu => ({ ...l, messages: l.messages.map((m) => ({ ...m, role: m.role === "toi" ? "autre" : m.role === "autre" ? "toi" : m.role })) });
/** Des captures, « Moi » au participant `k` : elles rejoignent les noms d’un export. */
const placerMoi = (m: Morceau, k: 0 | 1): Morceau => ({ ...m, noms: croiser([MOI, m.noms.find((n) => n !== MOI) ?? m.noms[1]], k === 1) });
/* Les noms ne servent qu’à lire qui parle : pour compter ce qu’ils ont en commun, deux personnes neutres suffisent */
const NEUTRES: Pick<Histoire, "utilisateur" | "autre"> = { utilisateur: { prenom: "0", pronom: "il", nomExport: "0" }, autre: { prenom: "1", pronom: "il", nomExport: "1" } };

/**
 * Le nouveau morceau relié à la conv : la place de ses noms parmi ceux de ses participants, et ce que la conv sait
 * désormais de qui est qui. Refusé (« autre_conv ») quand c’est clairement quelqu’un d’autre et qu’aucun message n’est
 * en commun : deux noms qui désignent l’autre (le haut des captures, le nom du fichier WhatsApp) sans être le même
 * prénom, ou un export dont aucun nom ne se retrouve, ou un seul, quand l’autre côté est (peut-être) l’autre personne.
 * Un nom illisible (un numéro, « Elle »), un surnom d’un seul côté, ne bloquent pas : le doute profite à l’ajout.
 */
export function relier(conv: ConvEnMorceaux, id: Identite, recu: MorceauRecu): { morceaux: Morceau[]; identite: Identite } {
  const { contact: designe, ...morceau } = recu;
  /* Chaque morceau lu une fois, toi au participant 0 : ce qu’ils ont en commun se compte en croisant les rôles, sans relire */
  const existants = conv.morceaux.map((m) => lireMorceau(m, NEUTRES, { k: 0, connu: false }));
  const nouveau = lireMorceau(recu, NEUTRES, { k: 0, connu: false });
  const base = reunir(existants).doublons;
  const communs = (croise: boolean, avec = existants) => reunir([...avec, croise ? inverser(nouveau) : nouveau]).doublons - base;
  const autreConv = () => new ErreurMorceau("autre_conv");
  const capturesSeules = conv.morceaux.every((m) => m.format === "captures");
  const ajoute = (noms: [string, string]) => [...conv.morceaux, { ...morceau, noms }];

  if (recu.format === "captures") {
    const autre = recu.noms[1];
    /* Des captures de plus, sur des captures : « Moi » y est le participant 0. Deux noms lus de deux prénoms : quelqu’un d’autre */
    if (capturesSeules) {
      const lu = id.noms[1];
      if (prenomSur(lu) && prenomSur(autre) && !memePrenom(lu, autre) && communs(false) < COMMUNS_MIN) throw autreConv();
      return { morceaux: ajoute([MOI, autre]), identite: { noms: [MOI, vraiNom(lu) ? lu : autre], moi: 0, contact: 1 } };
    }
    /* Des captures, sur des exports : l’autre est celui qu’un nom a désigné, sinon le même prénom (s’il n’est qu’à un des deux), sinon celui des messages en commun, sinon le second */
    const parNom = placeDuPrenom(id.noms, autre);
    const k = id.contact ?? parNom ?? (communs(true) > communs(false) ? 0 : 1);
    const noms = croiser([MOI, autre], k === 0);
    if (id.contact !== undefined && prenomSur(autre) && prenomSur(id.noms[k]) && !memePrenom(autre, id.noms[k]) && communs(k === 0) < COMMUNS_MIN) throw autreConv();
    return { morceaux: ajoute(noms), identite: { ...id, ...(parNom === undefined ? {} : { contact: id.contact ?? parNom }) } };
  }

  const [a, b] = recu.noms;
  const parFichier = designe === undefined ? undefined : ([0, 1] as const).find((k) => recu.noms[k] === designe);
  /* Un premier export, sur des captures : ses noms deviennent ceux de la conv, « Moi » va à celui qui n’est pas l’autre */
  if (capturesSeules) {
    const lu = id.noms[1];
    const parNom = placeDuPrenom(recu.noms, lu);
    if (parNom !== undefined && parFichier !== undefined && parNom !== parFichier) throw autreConv();
    if (
      parNom === undefined &&
      parFichier !== undefined &&
      prenomSur(lu) &&
      prenomSur(recu.noms[parFichier]) &&
      !memePrenom(lu, recu.noms[parFichier]) &&
      communs(false, parFichier === 0 ? existants.map(inverser) : existants) < COMMUNS_MIN
    )
      throw autreConv();
    const contact = parNom ?? parFichier;
    /* Rien ne dit qui est l’autre : les messages en commun, sinon le second, comme sur les écrans */
    const moi = contact !== undefined ? (contact === 0 ? 1 : 0) : communs(false, existants.map(inverser)) > communs(false) ? 1 : 0;
    return {
      morceaux: [...conv.morceaux.map((m) => placerMoi(m, moi)), { ...morceau, noms: [a, b] }],
      identite: { noms: [a, b], ...(contact === undefined ? {} : { contact }) },
    };
  }

  /* Un export de plus : ses noms à la place des mêmes (le même nom, sinon le même prénom), puis du nom du fichier, puis des messages en commun */
  const points = (croise: boolean) => {
    const noms = croiser([a, b], croise);
    const egal = (k: 0 | 1) => (noms[k] === id.noms[k] ? 3 : accordDuPrenom(noms[k], id.noms[k]));
    const fichier = designe === undefined || id.contact === undefined ? 0 : noms[id.contact] === designe ? 2 : -2;
    return egal(0) + egal(1) + fichier;
  };
  const [tels, croises] = [false, true].map((c) => ({ points: points(c), communs: communs(c) })) as [{ points: number; communs: number }, { points: number; communs: number }];
  const croise = croises.points > tels.points || (croises.points === tels.points && croises.communs > tels.communs);
  const noms = croiser([a, b], croise);
  const k = parFichier === undefined ? undefined : croise ? (parFichier === 0 ? 1 : 0) : parFichier;
  if ((croise ? croises : tels).communs < COMMUNS_MIN) {
    const memes = ([0, 1] as const).filter((j) => noms[j] === id.noms[j] || memePrenom(noms[j], id.noms[j]));
    /* Aucun nom ne se retrouve : une autre conv */
    if (!memes.length) throw autreConv();
    /*
     * Un seul : l’autre côté a changé de nom. Si c’est l’autre personne (d’après la conv, sinon le nom du fichier), ou que
     * rien ne dit qui elle est, c’est quelqu’un d’autre ; si c’est celui qui importe, il a changé de nom
     */
    const change = ([0, 1] as const).find((j) => !memes.includes(j));
    if (change !== undefined && prenomSur(noms[change]) && prenomSur(id.noms[change]) && (id.contact ?? k ?? change) === change) throw autreConv();
    /* Les deux fichiers désignent l’autre, chacun à une place différente : l’un des deux parle avec quelqu’un d’autre */
    if (k !== undefined && id.contact !== undefined && k !== id.contact) throw autreConv();
  }
  return { morceaux: ajoute(noms), identite: { ...id, ...(id.contact === undefined && k !== undefined ? { contact: k } : {}) } };
}
