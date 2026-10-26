import { CATALOGUE, enEuros } from "@/contenu/offres";
import { TUILES_IMPORT } from "@/contenu/parcours";
import { NOMS_DES_SOURCES, type GroupeDOffres } from "@/contenu/pilotage";
import type { Pilotage } from "@/server/stats";
import { APPLIS, ETAPES_VISITE, type AppKind, type EtapeVisite, type Jalon, type SourceVisite } from "@/types";
import type { Direct, GesteDuFil } from "@/types/api";

/*
 * Les calculs du pilotage (/admin), purs : les formats des nombres, les écarts avec la période d’avant, les graduations et
 * les étiquettes des graphiques, la plus grosse fuite du tunnel et la plus grosse perte de ses jalons, le texte d’un geste du fil. Jamais de division par zéro :
 * un rapport sans dénominateur rend null, et l’écran écrit « — » (tests/unit/admin-calculs.test.ts).
 */

/* ———— Les formats ———— */

export const nombre = (v: number) => v.toLocaleString("fr-FR");
/* Un nombre à `decimales` près ; un négatif prend le vrai signe moins (−), pas le trait d’union */
const fixe = (v: number, decimales: number) =>
  `${v < 0 && Math.abs(v) >= 0.5 * 10 ** -decimales ? "−" : ""}${Math.abs(v).toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
/** Des centimes en euros : « 1 779,30 € », ou « 1 779 € » sans décimales. */
export const euros = (centimes: number, decimales = 2) => `${fixe(centimes / 100, decimales)}\u00a0€`;
/** Des dollars : sans centimes à partir de 100 (« 425 $ »), avec en dessous (« 3,24 $ »). */
export const dollars = (v: number) => `${fixe(v, Math.abs(v) >= 100 ? 0 : 2)}\u00a0$`;
/** Un pourcentage déjà multiplié par 100 : « 2,7 % ». */
export const pourcent = (v: number, decimales = 1) => `${fixe(v, decimales)}\u00a0%`;
/** `a ÷ b`, ou null quand il n’y a rien à diviser (b nul ou négatif, ou un nombre qui n’en est pas un). */
export const rapport = (a: number, b: number): number | null => (b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : null);
/** « 1 personne », « 0 personne », « 23 personnes ». */
export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${nombre(n)}\u00a0${Math.abs(n) > 1 ? motPluriel : mot}`;

/* ———— Les écarts avec la période d’avant ———— */

/** Ce que vaut un écart pour BLUSH : bon, mauvais, ou ni l’un ni l’autre (ce que coûte l’IA monte avec les ventes). */
type Ton = "bon" | "mal" | "neutre";
/** Un écart écrit : sa flèche (vide s’il n’a pas bougé), son texte signé, et ce qu’il vaut. */
export type Ecart = { fleche: "↑" | "↓" | ""; texte: string; ton: Ton };
/** Le sens où un chiffre va bien : en montant, en baissant, ou aucun (null). */
type Mieux = "hausse" | "baisse" | null;

const tonDe = (sens: number, mieux: Mieux): Ton => (sens === 0 || mieux === null ? "neutre" : sens > 0 === (mieux === "hausse") ? "bon" : "mal");
const ecart = (sens: number, texte: string, mieux: Mieux): Ecart => ({
  fleche: sens > 0 ? "↑" : sens < 0 ? "↓" : "",
  texte: sens === 0 ? "=" : `${sens > 0 ? "+" : "−"}${texte}`,
  ton: tonDe(sens, mieux),
});

/**
 * L’écart en % avec la période d’avant (« +31 % »). Sans période d’avant à diviser (rien, ou un net négatif), l’écart
 * s’écrit en valeur, par `enValeur` (« +221,40 € »). Sous un demi-point, il ne bouge pas (« = »).
 */
export function ecartRelatif(valeur: number, avant: number, enValeur: (v: number) => string, mieux: Mieux = "hausse"): Ecart {
  const r = rapport(valeur - avant, avant);
  if (r === null) return ecart(Math.sign(valeur - avant), enValeur(Math.abs(valeur - avant)), mieux);
  const pct = Math.round(Math.abs(r) * 100);
  return ecart(pct === 0 ? 0 : Math.sign(r), pourcent(pct, 0), mieux);
}

/** L’écart en points entre deux pourcentages (« +0,4 pt »), ou null si l’un des deux manque. */
export function ecartEnPoints(valeur: number | null, avant: number | null, mieux: Mieux = "hausse", decimales = 1): Ecart | null {
  if (valeur === null || avant === null) return null;
  const d = Number((valeur - avant).toFixed(decimales));
  return ecart(Math.sign(d), `${fixe(Math.abs(d), decimales)}\u00a0pt`, mieux);
}

/** L’écart en valeur (« +0,53 € »), ou null si l’un des deux manque. */
export function ecartEnValeur(valeur: number | null, avant: number | null, enValeur: (v: number) => string, mieux: Mieux = "hausse"): Ecart | null {
  if (valeur === null || avant === null) return null;
  const texte = enValeur(Math.abs(valeur - avant));
  /* Un écart qui s’écrit zéro (0,004 € → « 0,00 € ») n’a pas bougé */
  return ecart(/[1-9]/.test(texte) ? Math.sign(valeur - avant) : 0, texte, mieux);
}

/* ———— Les graphiques ———— */

/**
 * Le haut de l’axe d’un graphique en euros, et ses trois graduations (0, la moitié, le haut), en centimes : un nombre rond
 * (1, 2, 4, 5, 6, 8 ou 10 fois une puissance de dix) au moins égal au plus haut, et jamais sous 10 €, pour que la moitié
 * reste un nombre d’euros entier.
 */
export function graduations(maxCentimes: number): { haut: number; marques: [number, number, number] } {
  const max = Number.isFinite(maxCentimes) ? Math.max(10, maxCentimes / 100) : 10;
  const puissance = 10 ** Math.floor(Math.log10(max));
  const facteur = [1, 2, 4, 5, 6, 8, 10].find((f) => f * puissance >= max) ?? 10;
  const haut = Math.round(facteur * puissance * 100);
  return { haut, marques: [0, haut / 2, haut] };
}

const PARIS = "Europe/Paris";

/**
 * Les noms d’une case des graphiques, en heure de Paris : `courte` sous la colonne sur téléphone, `longue` sur un grand
 * écran, `complete` dans l’info-bulle et le tableau lu à voix haute. Une heure (« 16 h »), un jour d’une semaine (« mer. 7 »,
 * « me »), ou un jour d’un mois (« 14 sept. », « 14 »).
 */
export function nomsDeLaCase(le: string, pas: Pilotage["pas"], cases: number): { courte: string; longue: string; complete: string } {
  const d = new Date(le);
  if (pas === "heure") {
    const h = Number(d.toLocaleString("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: PARIS }).replace(/\D/g, ""));
    return { courte: `${h}\u00a0h`, longue: `${h}\u00a0h`, complete: `de ${h}\u00a0h à ${(h + 1) % 24}\u00a0h` };
  }
  const complete = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: PARIS });
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", timeZone: PARIS });
  if (cases <= 7) {
    const semaine = d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: PARIS });
    return { courte: semaine.slice(0, 2), longue: `${semaine} ${jour}`, complete };
  }
  return { courte: jour, longue: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: PARIS }), complete };
}

/**
 * Si la case `k` (sur `n`) porte son nom sous le graphique : toutes sur une semaine, une sur quatre sur 24 h, une sur cinq
 * sur 30 jours. On compte depuis la dernière, qui a toujours le sien (c’est celle en cours).
 */
export function caseNommee(k: number, n: number): boolean {
  const tous = n <= 7 ? 1 : n <= 24 ? 4 : 5;
  return (n - 1 - k) % tous === 0;
}

/**
 * Les points d’une courbe (`polyline`) dans une boîte de 100 × 36 : chaque valeur à sa place, le plus bas en bas, le plus
 * haut en haut. Une valeur null (rien à diviser dans sa case) laisse un trou que la courbe enjambe. Moins de deux points :
 * rien à tracer.
 */
export function pointsDeLaCourbe(valeurs: (number | null)[]): string {
  const presents = valeurs.flatMap((v, k) => (v === null || !Number.isFinite(v) ? [] : [{ v, k }]));
  if (presents.length < 2) return "";
  const bas = Math.min(...presents.map((p) => p.v));
  const haut = Math.max(...presents.map((p) => p.v));
  const pas = Math.max(1, valeurs.length - 1);
  /* Une courbe plate se trace au milieu */
  const y = (v: number) => (haut === bas ? 18 : 33 - ((v - bas) / (haut - bas)) * 30);
  return presents.map(({ v, k }) => `${((k / pas) * 100).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

/* ———— Le tunnel ———— */

/** Les étapes du tunnel, dans l’ordre, et leurs noms. */
export const ETAPES_DU_TUNNEL = [
  ["visiteurs", "Visiteurs"],
  ["imports", "Ont importé une conv"],
  ["paywall", "Ont vu le paywall"],
  ["acheteurs", "Ont acheté"],
  ["racheteurs", "Ont racheté"],
] as const satisfies readonly (readonly [keyof Pilotage["tunnel"], string])[];

/** La plus grosse fuite : l’étape (1 à 3, celle d’arrivée), la part qui passe de l’étape d’avant, et les deux nombres. */
export type Fuite = { etape: 1 | 2 | 3; taux: number; depuis: number; vers: number };

/**
 * La plus grosse fuite du tunnel, entre l’arrivée et l’achat (visiteurs → imports, imports → paywall, paywall →
 * acheteurs) : le passage au plus petit taux, parmi ceux dont l’étape d’avant n’est pas vide. Le rachat n’en est pas une.
 * null : rien à comparer, ou rien ne fuit.
 */
export function fuiteDuTunnel(t: Pilotage["tunnel"]): Fuite | null {
  const n = [t.visiteurs, t.imports, t.paywall, t.acheteurs];
  let pire: Fuite | null = null;
  for (const etape of [1, 2, 3] as const) {
    const depuis = n[etape - 1] ?? 0;
    const vers = n[etape] ?? 0;
    const taux = rapport(vers, depuis);
    if (taux !== null && taux < 1 && (!pire || taux < pire.taux)) pire = { etape, taux, depuis, vers };
  }
  return pire;
}

/** Ce que dit la plus grosse fuite, dans « À regarder » et sous le tunnel. */
export function texteDeLaFuite(f: Fuite): { titre: string; texte: string } {
  const perte = pourcent((1 - f.taux) * 100, 0);
  if (f.etape === 1)
    return {
      titre: `${perte} des visiteurs repartent sans importer`,
      texte: `C’est la plus grosse fuite du tunnel (${pluriel(f.vers, "import")} pour ${pluriel(f.depuis, "visiteur")}). Une meilleure accroche sur l’accueil rapporte plus que tout le reste.`,
    };
  if (f.etape === 2)
    return {
      titre: `${perte} des convs importées n’arrivent pas au paywall`,
      texte: `C’est la plus grosse fuite du tunnel (${pluriel(f.vers, "conv")} au paywall pour ${pluriel(f.depuis, "conv")} importée${f.depuis > 1 ? "s" : ""}). Regarde l’import écran par écran\u00a0: «\u00a0Qui es-tu\u00a0?\u00a0», l’email et son code.`,
    };
  return {
    titre: `${perte} de ceux qui voient le paywall n’achètent pas`,
    texte: `C’est la plus grosse fuite du tunnel (${pluriel(f.vers, "acheteur")} pour ${pluriel(f.depuis, "conv")} au paywall). Le verdict vient après le paiement\u00a0: regarde le paywall jusqu’au paiement, le formulaire de Whop et les paiements refusés.`,
  };
}

/* ———— Les jalons du tunnel ———— */

/** L’import, écran par écran : les jalons après les visiteurs, dans l’ordre du parcours, et leurs noms. */
export const JALONS_DE_L_IMPORT = [
  ["commencer", "Ouvrent le choix de l’appli"],
  ["appli", "Choisissent leur appli"],
  ["fichier", "Choisissent leur fichier"],
  ["importee", "Conv bien reçue"],
  ["qui", "Disent qui ils sont"],
  ["email", "Demandent leur code"],
  ["code", "Valident leur code"],
  ["lecture", "Lancent la lecture"],
] as const satisfies readonly (readonly [Jalon, string])[];

/** Le paywall, de l’arrivée au paiement : les jalons dans l’ordre, et leurs noms. */
export const JALONS_DU_PAYWALL = [
  ["paywall", "Arrivent au paywall"],
  ["offres", "Voient les formules"],
  ["payer", "Touchent le bouton qui paie"],
  ["whop", "Voient le formulaire de Whop"],
  ["envoye", "Envoient le paiement"],
  ["paye", "Ont payé"],
] as const satisfies readonly (readonly [Jalon, string])[];

/**
 * Un taux ne se lit qu’à partir de ce nombre de personnes à l’étape d’avant, comme la meilleure source et la plus grosse
 * fuite (a-regarder.ts) : en dessous, il ne veut rien dire.
 */
export const PERSONNES_D_UN_TAUX = 30;

/** Le passage d’une étape à la suivante (`vers` sur `depuis`), ou null avec moins de PERSONNES_D_UN_TAUX à l’étape d’avant. */
export const tauxLisible = (vers: number, depuis: number): number | null => (depuis >= PERSONNES_D_UN_TAUX ? rapport(vers, depuis) : null);

/** Le nom d’une appli dans le pilotage : celui de sa tuile au choix de l’appli (« Captures ou vidéo »), sinon le sien (« Hinge »). */
export const nomDeLAppli = (appli: AppKind): string => TUILES_IMPORT.find((t) => t.app === appli)?.title ?? APPLIS[appli];

/**
 * La plus grosse perte d’une suite d’étapes (leurs nombres, dans l’ordre) : l’étape d’arrivée (son indice, 1 ou plus)
 * au plus petit taux de passage depuis celle d’avant, parmi celles dont l’étape d’avant n’est pas vide. null : rien à
 * comparer, ou rien ne se perd (une étape qui compte plus que celle d’avant n’est pas une perte).
 */
export function plusGrossePerte(n: readonly number[]): { etape: number; taux: number } | null {
  let pire: { etape: number; taux: number } | null = null;
  for (let etape = 1; etape < n.length; etape++) {
    const taux = rapport(n[etape] ?? 0, n[etape - 1] ?? 0);
    if (taux !== null && taux < 1 && (!pire || taux < pire.taux)) pire = { etape, taux };
  }
  return pire;
}

/* ———— Ce qui se vend ———— */

/** La couleur de chaque groupe d’offres (la palette validée pour les daltoniens). L’orange est sous 3:1 : sa valeur s’écrit toujours à côté. */
export const COULEURS_DES_GROUPES: Record<GroupeDOffres, string> = {
  premium: "#e8358a",
  rapport: "var(--toi)",
  suite: "#e08600",
  second: "var(--color-flou-ink)",
  bulles: "#0fa877",
};

/* ———— En direct ———— */

/** « il y a 12 s », « il y a 3 min », « il y a 2 h » (une seconde au moins). */
export function ilYa(secondes: number): string {
  const s = Math.max(1, Math.round(Number.isFinite(secondes) ? secondes : 0));
  if (s < 60) return `il y a ${s}\u00a0s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)}\u00a0min`;
  return `il y a ${Math.floor(s / 3600)}\u00a0h`;
}

/** D’où arrive une personne, dans le fil (« arrive de TikTok », « arrive d’Instagram », « arrive en direct »). */
function arrivee(source: SourceVisite): string {
  if (source === "direct") return "arrive en direct";
  if (source === "partage") return "arrive d’un verdict partagé";
  if (source === "autre") return "arrive d’un autre site";
  const nom = NOMS_DES_SOURCES[source];
  return `arrive ${/^[aeiouyhéè]/i.test(nom) ? "d’" : "de "}${nom}`;
}

/** Ce qu’a fait la personne d’un geste du fil, et le prix payé d’un achat (à part, en pastille ; sans lui, celui du catalogue). */
export function texteDuGeste(g: GesteDuFil): { ville: string; quoi: string; prix: string | null } {
  const ville = g.ville ?? "Ville inconnue";
  switch (g.genre) {
    case "arrivee":
      return { ville, quoi: arrivee(g.source), prix: null };
    case "import":
      return { ville, quoi: "a importé une conv", prix: null };
    case "paiement":
      return { ville, quoi: `ouvre le paiement · ${CATALOGUE[g.offre].titre}`, prix: null };
    case "achat":
      return { ville, quoi: `a pris ${CATALOGUE[g.offre].titre}`, prix: enEuros(g.centimes ?? CATALOGUE[g.offre].centimes) };
    case "partage":
      return { ville, quoi: "a partagé son verdict", prix: null };
  }
}

/** Les écrans où sont les personnes en ligne : ceux qui ont du monde, au plus `max` (les plus peuplés), dans l’ordre du parcours. */
export function etapesPeuplees(etapes: Direct["etapes"], max = 9): { etape: EtapeVisite; n: number }[] {
  const gardees = new Set(
    etapes
      .filter((e) => e.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, max)
      .map((e) => e.etape),
  );
  return ETAPES_VISITE.flatMap((etape) => (gardees.has(etape) ? [{ etape, n: etapes.find((e) => e.etape === etape)?.n ?? 0 }] : []));
}
