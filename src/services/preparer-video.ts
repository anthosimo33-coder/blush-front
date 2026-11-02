import "client-only";
/*
 * Un enregistrement d’écran devient des images de la conv, dans le navigateur : on regarde la vidéo pas à pas, on
 * mesure de combien la conv a défilé, et on garde un écran dès qu’elle a défilé d’un peu plus d’un demi-écran
 * (deux écrans gardés se recouvrent : aucun message ne tombe entre les deux). La vidéo ne quitte jamais l’appareil :
 * seules ces images partent, réduites comme des captures.
 */
import { COTE_IMAGE_MAX, ECRANS_PAR_LOT } from "@/lib/limites";
import { toileEnJpeg } from "./preparer-captures";

export class VideoIllisible extends Error {
  constructor(readonly code: "video") {
    super(code);
  }
}

/** Au-delà, l’enregistrement est trop long pour une lecture (et pour son coût) : BLUSH en lit la partie la plus récente. */
export const IMAGES_MAX = 160;
/* La mesure du défilement : la zone de la conv (sans la barre du haut ni le champ du bas), en tout petit */
const MESURE_L = 24;
const MESURE_H = 240;
const HAUT = 0.14;
const BAS = 0.86;
/* On garde un écran quand la conv a défilé de 55 % de la zone depuis le dernier gardé */
const PAS_GARDE = 0.55;
/* Au-delà de cet écart moyen (sur 255), deux instants ne se ressemblent plus : la conv a sauté (défilement trop rapide, autre écran) */
const ECART_SAUT = 26;

type Mesure = Float32Array;

/** L’écart moyen entre deux mesures, la seconde décalée de `d` lignes (seulement sur leur partie commune). */
function ecart(a: Mesure, b: Mesure, d: number): number {
  const debut = Math.max(0, -d);
  const fin = Math.min(MESURE_H, MESURE_H - d);
  let somme = 0;
  for (let y = debut; y < fin; y++) {
    const ia = y * MESURE_L;
    const ib = (y + d) * MESURE_L;
    /* Les deux indices restent dans les mesures (de 0 à MESURE_L × MESURE_H) */
    for (let x = 0; x < MESURE_L; x++) somme += Math.abs(a[ia + x]! - b[ib + x]!);
  }
  return somme / ((fin - debut) * MESURE_L);
}

/**
 * De combien la conv a défilé entre deux instants : le décalage `d` (en lignes de mesure) tel que la ligne y d’avant
 * se retrouve en y + d. Positif : le contenu descend (on remonte vers les vieux messages). `saut` : rien ne colle.
 */
export function decalage(a: Mesure, b: Mesure): { d: number; saut: boolean } {
  const max = Math.round(MESURE_H * 0.45);
  let mieux = { d: 0, e: ecart(a, b, 0) };
  for (let d = -max; d <= max; d++) {
    if (d === 0) continue;
    const e = ecart(a, b, d);
    if (e < mieux.e) mieux = { d, e };
  }
  return { d: mieux.d, saut: mieux.e > ECART_SAUT };
}

/**
 * Plus de IMAGES_MAX écrans : on garde ceux de la partie la plus récente de la conv, comme pour un export trop long.
 * Quand on la remonte (`remonte`), les premiers écrans sont les plus récents : on garde ceux-là, et on s’arrête (rend
 * true), la suite ne montrerait que du plus ancien. Quand on la descend, on oublie les plus anciens, et on continue.
 */
export function garderLesPlusRecents<T>(images: T[], remonte: boolean): boolean {
  if (images.length <= IMAGES_MAX) return false;
  if (remonte) {
    images.length = IMAGES_MAX;
    return true;
  }
  images.splice(0, images.length - IMAGES_MAX);
  return false;
}

const attendre = (cible: EventTarget, ok: string, ms: number) =>
  new Promise<void>((resolve, reject) => {
    const fin = (e: Event) => {
      cible.removeEventListener(ok, fin);
      cible.removeEventListener("error", fin);
      clearTimeout(t);
      if (e.type === "error") reject(new VideoIllisible("video"));
      else resolve();
    };
    const t = setTimeout(() => fin(new Event("error")), ms);
    cible.addEventListener(ok, fin);
    cible.addEventListener("error", fin);
  });

/** La part du défilement qui doit aller dans le même sens pour que l’ordre des écrans soit sûr (le reste : des allers-retours). */
const SENS_SUR = 0.8;

/**
 * Ce qu’un enregistrement donne : les images de la conv, dans l’ordre du temps de la conv (du plus ancien au plus
 * récent), et si cet ordre est sûr (`sensSur`) : la conv a défilé presque tout le temps dans le même sens (SENS_SUR).
 * Un aller-retour, ou un sens net trop faible, peut avoir mis des écrans dans le désordre : une longue vidéo se lit
 * alors en entier avant l’achat (src/server/lecture-partielle.ts), aucun écran récent n’est laissé pour après.
 */
export type VideoLue = { images: Blob[]; sensSur: boolean };

/** Les images de la conv tirées de l’enregistrement, dans l’ordre du temps de la conv (du plus ancien au plus récent), et si cet ordre est sûr. */
export async function imagesDeLaVideo(fichier: File, onAvance?: (p: number) => void): Promise<VideoLue> {
  const url = URL.createObjectURL(fichier);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  /* Dans la page (invisible) : Safari ne décode pas toujours une vidéo détachée */
  v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(v);
  const aller = async (t: number) => {
    const fait = attendre(v, "seeked", 8_000);
    v.currentTime = t;
    await fait;
  };
  try {
    const pret = attendre(v, "loadeddata", 20_000);
    v.src = url;
    v.load();
    await pret;
    /* Safari (iPhone) ne se laisse parfois déplacer dans la vidéo qu’après l’avoir lancée une fois */
    await v.play().catch(() => {});
    v.pause();
    /* Certaines vidéos (.webm) n’écrivent pas leur durée : on va tout au bout pour la connaître */
    if (!Number.isFinite(v.duration)) {
      const connue = attendre(v, "durationchange", 8_000).catch(() => {});
      v.currentTime = 1e9;
      await connue;
      await aller(0).catch(() => {});
    }
    const duree = v.duration;
    const L = v.videoWidth;
    const H = v.videoHeight;
    if (!Number.isFinite(duree) || duree <= 0 || !L || !H) throw new VideoIllisible("video");

    const mesure = document.createElement("canvas");
    mesure.width = MESURE_L;
    mesure.height = MESURE_H;
    const cm = mesure.getContext("2d", { willReadFrequently: true })!;
    const lire = (): Mesure => {
      cm.drawImage(v, 0, H * HAUT, L, H * (BAS - HAUT), 0, 0, MESURE_L, MESURE_H);
      const px = cm.getImageData(0, 0, MESURE_L, MESURE_H).data;
      const m = new Float32Array(MESURE_L * MESURE_H);
      /* px : quatre octets (RVBA) par point de la mesure */
      for (let i = 0; i < m.length; i++) m[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
      return m;
    };
    const echelle = Math.min(1, COTE_IMAGE_MAX / Math.max(L, H));
    const toile = document.createElement("canvas");
    toile.width = Math.round(L * echelle);
    toile.height = Math.round(H * echelle);
    const ct = toile.getContext("2d")!;
    const photo = () => {
      ct.drawImage(v, 0, 0, toile.width, toile.height);
      return toileEnJpeg(toile, 0.72, () => new VideoIllisible("video"));
    };
    /* Un pas de 0,2 s (pas plus de 500 instants regardés) ; on saute la première demi-seconde (le Centre de contrôle qui se ferme) */
    const pas = Math.max(0.2, duree / 500);
    const debut = duree > 3 ? 0.5 : 0;
    const images: Blob[] = [];
    let avant: Mesure | null = null;
    let tAvant = debut;
    let parcouru = 0;
    let sens = 0;
    /* Tout ce qui a défilé, dans un sens ou dans l’autre (sans les sauts) : `sens` en est la part nette */
    let defile = 0;
    for (let t = debut; t <= duree; t += pas) {
      await aller(Math.min(t, duree - 0.05));
      const m = lire();
      if (!avant) images.push(await photo());
      else {
        const { d, saut } = decalage(avant, m);
        if (saut) {
          /* La conv a sauté : on garde l’instant d’avant (s’il apporte du neuf) et celui-ci */
          if (parcouru > MESURE_H * 0.15) {
            await aller(tAvant);
            images.push(await photo());
            await aller(Math.min(t, duree - 0.05));
          }
          images.push(await photo());
          parcouru = 0;
        } else {
          sens += d;
          defile += Math.abs(d);
          parcouru += Math.abs(d);
          if (parcouru >= MESURE_H * PAS_GARDE) {
            images.push(await photo());
            parcouru = 0;
          }
        }
      }
      /* Une conv trop longue pour une lecture : sa partie la plus récente (on la remonte : c’est fini, la suite est plus ancienne) */
      if (garderLesPlusRecents(images, sens > 0)) break;
      avant = m;
      tAvant = t;
      onAvance?.(Math.min(1, (t - debut) / Math.max(0.01, duree - debut)));
    }
    /* La fin de la conv, si elle a encore défilé depuis le dernier écran gardé */
    if (parcouru > MESURE_H * 0.12) images.push(await photo());
    garderLesPlusRecents(images, sens > 0);
    /* On a remonté la conv (le contenu descend) : les écrans vont du plus récent au plus ancien, on les remet dans l’ordre */
    return { images: sens > 0 ? images.reverse() : images, sensSur: defile > 0 && Math.abs(sens) >= SENS_SUR * defile };
  } finally {
    v.removeAttribute("src");
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Combien d’écrans par lot : douze (ECRANS_PAR_LOT) dès que la vidéo en a douze, toutes les vidéos ; en dessous, tous ses
 * écrans, en un seul lot. Un plus grand lot coûte moins (moins d’écrans relus aux jointures, moins de fois le prompt) : à
 * l’essai du 21 octobre (Sonnet 5.5, deux convs de test filmées comme iMessage, scripts/essai-video-modeles.mts), des lots
 * de douze ont lu autant de messages mot pour mot que des lots de six, pour 20 à 25 % de moins. Jusqu’au 27 octobre, une
 * courte vidéo (56 écrans au plus) partait en lots de six à douze, assez petits pour tenir en un seul tour de lecteurs
 * (LECTEURS_DE_LOTS) : lue plus vite (un lot de six en 15 s environ, un de douze en 25 à 30 s), mais plus cher. Elle prend
 * maintenant jusqu’à 15 s de plus (5 à 15 s sous 40 écrans), pour 10 à 15 % de moins avant l’achat (estimé le 27 octobre :
 * la ligne Vidéo de « L’IA avant l’achat », dans /admin, le dira). Le seuil d’une longue vidéo ne bouge pas : cinq lots de
 * douze couvrent toujours 56 écrans (chaque lot reprend le dernier écran du précédent : `n` lots de douze en couvrent
 * 11 n + 1).
 */
export const tailleDesLots = (ecrans: number) => Math.min(ECRANS_PAR_LOT, Math.max(1, ecrans));

/* ———— Un lot déjà lu ne repart pas ———— */

/*
 * Les lots déjà lus dans cet onglet, par empreinte (empreinteDuLot) : un nouvel essai de l’enregistrement (après un lot
 * en échec, la même vidéo choisie de nouveau) ne renvoie que ceux qui manquent. La même vidéo donne les mêmes images,
 * octet pour octet : la lire pas à pas est déterministe. En mémoire de la page seulement (ce sont des messages de leur
 * conv) : jamais dans le stockage du navigateur, oubliés au bout d’une heure ou en fermant l’onglet. Un échec n’est
 * jamais gardé. Chacun garde la clé de l’envoi qui l’a lu : la fin de l’enregistrement qui le reprend la donne au serveur,
 * qui range son coût sous le nouvel import (src/server/imports.ts). Le serveur garde aussi les siens (src/server/lots.ts).
 */
const LUS = new Map<string, LotLu & { jusqua: number }>();
const GARDE_LU_MS = 60 * 60e3;
/* Une quarantaine de lots : deux ou trois longs enregistrements */
const LUS_MAX = 40;

/**
 * L’empreinte d’un lot : ses images (octets), son appli et le jour de Paris (la lecture date « hier » d’après lui), jamais
 * son seul numéro. null si le navigateur ne sait pas la calculer (crypto.subtle vient avec https) : le lot repart.
 */
export async function empreinteDuLot(images: Blob[], appli: string, jour: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    /* L’empreinte de chaque image (32 octets), puis celle de l’appli, du jour et de leur suite : deux lots ne se confondent pas */
    const parImage = await Promise.all(images.map(async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", await b.arrayBuffer()))));
    const tete = new TextEncoder().encode(`lot:${appli}:${jour}:${images.length}`);
    const tout = new Uint8Array(tete.length + 32 * parImage.length);
    tout.set(tete);
    parImage.forEach((e, k) => tout.set(e, tete.length + 32 * k));
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", tout)), (o) => o.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** Un lot lu : sa lecture brute, et la clé de l’envoi qui l’a lu. */
export type LotLu = { lot: unknown; cle: string };

/** Le lot déjà lu dans cet onglet (encore frais), ou undefined. */
export function lotDejaLu(empreinte: string | null): LotLu | undefined {
  if (!empreinte) return undefined;
  const l = LUS.get(empreinte);
  if (l && l.jusqua > Date.now()) return { lot: l.lot, cle: l.cle };
  LUS.delete(empreinte);
  return undefined;
}

/** Garde la lecture d’un lot lu avec succès, et la clé de son envoi (les plus anciennes partent au-delà de LUS_MAX). */
export function garderLeLot(empreinte: string | null, { lot, cle }: LotLu): void {
  if (!empreinte) return;
  LUS.delete(empreinte);
  LUS.set(empreinte, { lot, cle, jusqua: Date.now() + GARDE_LU_MS });
  for (const k of LUS.keys()) {
    if (LUS.size <= LUS_MAX) break;
    LUS.delete(k);
  }
}

/**
 * Les lots à lire, dans l’ordre de la vidéo (du plus ancien au plus récent) : `taille` images au plus, chaque lot
 * reprenant la dernière image du précédent (pour recoller les messages : fusionnerLots, src/server/video.ts, n’y compte
 * l’image partagée qu’une fois). Découpés en partant de la fin : le lot le plus récent est plein, et le reste va dans le
 * plus ancien. C’est le plus récent que la lecture partielle d’une longue vidéo lit d’abord (src/services/api.ts,
 * src/server/lecture-partielle.ts) : en partant du début, il n’était que le reste, de deux à douze écrans (trois sur 80,
 * six sur 160), trop peu pour dire si la conv est dense. Autant de lots qu’en partant du début, autant d’images partagées :
 * une vidéo lue en entier ne coûte pas plus, et se recolle en la même conv. `poids` et `max` : un lot ne dépasse pas non
 * plus ce poids (Vercel refuse un envoi de plus de 4,5 Mo) ; il prend toujours au moins une image, aussi lourde soit-elle.
 */
export function lotsDe<T>(images: T[], taille = ECRANS_PAR_LOT, poids: (x: T) => number = () => 0, max = Infinity): T[][] {
  const lots: T[][] = [];
  /* Le lot en cours va de l’image i (comprise) à l’image j (exclue) : le premier finit sur la dernière image */
  let j = images.length;
  while (j > 0) {
    let i = j - 1;
    /* i et i − 1 sont dans la vidéo : 0 ≤ i < j ≤ images.length, puis i > 0 */
    let total = poids(images[i]!);
    while (i > 0 && j - i < taille && total + poids(images[i - 1]!) <= max) total += poids(images[--i]!);
    lots.push(images.slice(i, j));
    if (i === 0) break;
    /* Le lot d’avant finit sur la première image de celui-ci (sauf un lot d’une seule image : on recule sans rien partager) */
    j = j - i > 1 ? i + 1 : i;
  }
  return lots.reverse();
}
