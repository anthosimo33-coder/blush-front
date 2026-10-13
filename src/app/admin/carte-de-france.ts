import type { Direct } from "@/types/api";

/*
 * La carte d’/admin en direct : la France en points (la Corse comprise), la Belgique et la Suisse plus claires, et une
 * bulle par ville où quelqu’un est en ligne. Une projection simple (la longitude resserrée par le cosinus de la latitude
 * moyenne, la latitude telle quelle) dans une boîte de 10,5 × 10,4, et une grille de points gardés s’ils tombent dans un
 * pays (le polygone, par le tracé d’un rayon). Les contours sont grossiers, à la taille d’un point : ils reprennent la
 * maquette du 13 octobre. Pure : tests/unit/admin-carte.test.ts.
 */

/** La boîte de la carte (le viewBox de son SVG). */
export const LARGEUR = 10.5;
export const HAUTEUR = 10.4;
/* La longitude du bord gauche, la latitude du bord haut, et le resserrement des longitudes (cos 46,3°) */
const LON0 = -5.2;
const LAT1 = 51.6;
const K = 0.691;

/** Un point en degrés : [longitude, latitude]. */
type Degres = readonly [number, number];

/** Une longitude et une latitude, à leur place dans la boîte : [x, y], de 0 à LARGEUR et de 0 à HAUTEUR. */
export const projeter = (lon: number, lat: number): [number, number] => [(lon - LON0) * K, LAT1 - lat];

/** Si le point (x, y) est dans le polygone : le rayon parti vers la droite en croise les côtés un nombre impair de fois. */
export function dedans(poly: readonly Degres[], x: number, y: number): boolean {
  let croise = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) croise = !croise;
  }
  return croise;
}

/** Un contour, écrit à plat (longitude, latitude, longitude, latitude…), en points. */
const contour = (plat: readonly number[]): Degres[] => Array.from({ length: plat.length / 2 }, (_, k) => [plat[2 * k]!, plat[2 * k + 1]!] as const);

export const FRANCE = contour([
  2.55, 51.09, 2.95, 50.75, 3.6, 50.5, 4.2, 50.1, 4.85, 50.15, 5.45, 49.55, 6.4, 49.45, 7.0, 49.1, 8.2, 48.97, 7.8, 48.5, 7.55, 47.6, 7.0, 47.45, 6.1, 46.6, 6.0, 46.15, 6.8, 46.0,
  7.1, 45.3, 6.65, 45.05, 7.0, 44.2, 7.5, 43.78, 7.0, 43.55, 6.6, 43.15, 5.9, 43.08, 5.35, 43.3, 4.8, 43.42, 4.0, 43.5, 3.2, 43.25, 3.0, 42.8, 3.15, 42.45, 2.5, 42.35, 1.7, 42.5,
  0.7, 42.8, 0.0, 42.7, -0.75, 42.95, -1.4, 43.25, -1.78, 43.37, -1.5, 43.6, -1.25, 44.6, -1.15, 45.5, -1.25, 46.15, -2.15, 46.85, -2.5, 47.3, -3.0, 47.55, -3.5, 47.7, -4.35, 47.8,
  -4.7, 48.05, -4.78, 48.4, -4.6, 48.6, -3.9, 48.72, -3.0, 48.8, -2.3, 48.65, -1.6, 48.7, -1.6, 49.2, -1.85, 49.7, -1.25, 49.7, -1.1, 49.4, -0.2, 49.3, 0.1, 49.45, 0.6, 49.85, 1.4,
  50.05, 1.6, 50.4, 1.6, 50.85, 1.85, 50.95,
]);
export const CORSE = contour([9.35, 43.0, 9.55, 42.6, 9.5, 42.1, 9.25, 41.4, 8.8, 41.6, 8.6, 41.95, 8.6, 42.35, 8.8, 42.6, 9.2, 42.7]);
export const BELGIQUE = contour([
  2.55, 51.09, 3.37, 51.37, 4.25, 51.37, 5.0, 51.48, 5.85, 51.15, 5.65, 50.75, 6.4, 50.32, 5.8, 49.55, 5.45, 49.55, 4.85, 50.15, 4.2, 50.1, 3.6, 50.5, 2.95, 50.75,
]);
export const SUISSE = contour([
  6.0, 46.15, 6.1, 46.6, 7.0, 47.45, 7.55, 47.6, 8.6, 47.8, 9.5, 47.55, 9.55, 47.0, 10.45, 46.9, 10.1, 46.25, 9.0, 45.85, 8.4, 46.45, 7.85, 45.95, 7.0, 45.9, 6.8, 46.0,
]);

/* Le pas de la grille : 0,2° de latitude, et autant de place en longitude une fois resserrée */
const PAS_LAT = 0.2;
const PAS_LON = PAS_LAT / K;

let dessin: { france: string; voisins: string; points: { france: number; voisins: number } } | null = null;

/**
 * Les points de la carte, en deux tracés de SVG (chaque point : un trait de longueur nulle, arrondi par le stroke-linecap) :
 * la France et la Corse, puis la Belgique et la Suisse. Calculés une fois.
 */
export function pointsDeLaCarte(): { france: string; voisins: string; points: { france: number; voisins: number } } {
  if (dessin) return dessin;
  let france = "";
  let voisins = "";
  const points = { france: 0, voisins: 0 };
  for (let i = 0; 41.3 + i * PAS_LAT <= 51.55; i++) {
    const lat = 41.3 + i * PAS_LAT;
    for (let j = 0; -5.1 + j * PAS_LON <= 9.95; j++) {
      const lon = -5.1 + j * PAS_LON;
      const [x, y] = projeter(lon, lat);
      const point = `M${x.toFixed(2)} ${y.toFixed(2)}h0`;
      if (dedans(FRANCE, lon, lat) || dedans(CORSE, lon, lat)) {
        france += point;
        points.france++;
      } else if (dedans(BELGIQUE, lon, lat) || dedans(SUISSE, lon, lat)) {
        voisins += point;
        points.voisins++;
      }
    }
  }
  dessin = { france, voisins, points };
  return dessin;
}

/** Où va l’étiquette d’une ville, autour de sa bulle : à droite, à gauche, en haut ou en bas. */
export type Cote = "d" | "g" | "h" | "b";
/**
 * Une ville sur la carte : sa place (en % de la boîte), le diamètre de sa bulle (px), et son étiquette (à partir de deux
 * personnes, si elle trouve une place) et son côté.
 */
export type VillePlacee = { nom: string; n: number; x: number; y: number; diametre: number; etiquette: boolean; cote: Cote };

/** Le diamètre d’une bulle, en px : elle grossit comme la racine du nombre de personnes (sa surface suit le nombre). */
export const diametreDe = (n: number) => Math.round(8 + Math.sqrt(Math.max(1, n)) * 5);
/** L’écart entre une bulle et son étiquette, en px. */
export const ECART_DE_L_ETIQUETTE = 6;
/** La hauteur d’une étiquette, en px. */
const HAUTEUR_D_ETIQUETTE = 24;
/** Ce qu’une étiquette peut dépasser de la carte sans gêne, en px : la marge de la carte qui l’entoure. */
const DEBORD = 16;

type Boite = { g: number; h: number; d: number; b: number };
const chevauchement = (a: Boite, b: Boite) => Math.max(0, Math.min(a.d, b.d) - Math.max(a.g, b.g)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.h, b.h));

/**
 * Les villes des personnes en ligne, placées sur la carte, et celles qui n’y vont pas (« Hors carte ») : sans coordonnées,
 * ou hors de la boîte. Une ville inconnue (null) s’appelle « Ville inconnue ». Les étiquettes se posent les plus grosses
 * villes d’abord, du côté où elles chevauchent le moins les bulles et les étiquettes déjà posées et sortent le moins de la
 * carte (d’abord à droite, ou à gauche dans l’est de la carte, puis l’autre côté, en haut, en bas). Une étiquette qui
 * cacherait encore à moitié une autre étiquette se tait : la bulle reste, et le nom reste dans la description de la carte.
 * `largeur` : la largeur de la carte à l’écran, en px (les étiquettes, elles, ont une taille fixe).
 */
export function placerLesVilles(villes: Direct["villes"], largeur = 620): { placees: VillePlacee[]; horsCarte: { nom: string; n: number }[] } {
  const hauteur = (largeur * HAUTEUR) / LARGEUR;
  const placees: VillePlacee[] = [];
  const horsCarte: { nom: string; n: number }[] = [];
  for (const v of villes) {
    const nom = v.ville ?? "Ville inconnue";
    if (v.lat === null || v.lon === null) {
      horsCarte.push({ nom, n: v.n });
      continue;
    }
    const [x, y] = projeter(v.lon, v.lat);
    if (x < 0 || x > LARGEUR || y < 0 || y > HAUTEUR) {
      horsCarte.push({ nom, n: v.n });
      continue;
    }
    placees.push({ nom, n: v.n, x: (x / LARGEUR) * 100, y: (y / HAUTEUR) * 100, diametre: diametreDe(v.n), etiquette: v.n >= 2, cote: x / LARGEUR > 0.7 ? "g" : "d" });
  }
  /* Les bulles prennent leur place d’abord, puis les étiquettes */
  const px = (v: VillePlacee) => ({ cx: (v.x / 100) * largeur, cy: (v.y / 100) * hauteur });
  const bulles: Boite[] = placees.map((v) => {
    const { cx, cy } = px(v);
    return { g: cx - v.diametre / 2, h: cy - v.diametre / 2, d: cx + v.diametre / 2, b: cy + v.diametre / 2 };
  });
  const etiquettes: Boite[] = [];
  const carte: Boite = { g: -DEBORD, h: -DEBORD, d: largeur + DEBORD, b: hauteur + DEBORD };
  for (const v of [...placees].filter((v) => v.etiquette).sort((a, b) => b.n - a.n)) {
    const { cx, cy } = px(v);
    /* ~7,6 px par signe en 13 px gras, et ses marges */
    const w = (v.nom.length + String(v.n).length + 1) * 7.6 + 18;
    const e = v.diametre / 2 + ECART_DE_L_ETIQUETTE;
    const m = HAUTEUR_D_ETIQUETTE / 2;
    const boite = (cote: Cote): Boite =>
      cote === "d"
        ? { g: cx + e, h: cy - m, d: cx + e + w, b: cy + m }
        : cote === "g"
          ? { g: cx - e - w, h: cy - m, d: cx - e, b: cy + m }
          : cote === "h"
            ? { g: cx - w / 2, h: cy - e - 2 * m, d: cx + w / 2, b: cy - e }
            : { g: cx - w / 2, h: cy + e, d: cx + w / 2, b: cy + e + 2 * m };
    const surLesEtiquettes = (b: Boite) => etiquettes.reduce((t, o) => t + chevauchement(b, o), 0);
    /* Une étiquette sur une autre gêne plus qu’une étiquette sur une bulle, ou qui sort de la carte ; en px² entiers, pour qu’un arrondi ne départage pas deux côtés libres */
    const cout = (b: Boite) => Math.round(surLesEtiquettes(b) * 3 + bulles.reduce((t, o) => t + chevauchement(b, o), 0) + (w * HAUTEUR_D_ETIQUETTE - chevauchement(b, carte)));
    const cotes: Cote[] = [v.cote, v.cote === "d" ? "g" : "d", "h", "b"];
    const meilleur = cotes.reduce((a, c) => (cout(boite(c)) < cout(boite(a)) ? c : a));
    v.cote = meilleur;
    if (surLesEtiquettes(boite(meilleur)) > (w * HAUTEUR_D_ETIQUETTE) / 2) v.etiquette = false;
    else etiquettes.push(boite(meilleur));
  }
  return { placees, horsCarte };
}
