/*
 * Un enregistrement d’écran devient des images de la conv, dans le navigateur : on regarde la vidéo pas à pas, on
 * mesure de combien la conv a défilé, et on garde un écran dès qu’elle a défilé d’un peu plus d’un demi-écran
 * (deux écrans gardés se recouvrent : aucun message ne tombe entre les deux). La vidéo ne quitte jamais l’appareil :
 * seules ces images partent, réduites comme des captures.
 */

export class VideoIllisible extends Error {
  constructor(readonly code: "video" | "longue") {
    super(code);
  }
}

/** Au-delà, l’enregistrement est trop long pour une lecture (et pour son coût). */
export const IMAGES_MAX = 80;
const COTE_MAX = 1568;
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
    for (let x = 0; x < MESURE_L; x++) somme += Math.abs(a[ia + x] - b[ib + x]);
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

/** Les images de la conv tirées de l’enregistrement, dans l’ordre du temps de la conv (du plus ancien au plus récent). */
export async function imagesDeLaVideo(fichier: File, onAvance?: (p: number) => void): Promise<Blob[]> {
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
      for (let i = 0; i < m.length; i++) m[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      return m;
    };
    const echelle = Math.min(1, COTE_MAX / Math.max(L, H));
    const toile = document.createElement("canvas");
    toile.width = Math.round(L * echelle);
    toile.height = Math.round(H * echelle);
    const ct = toile.getContext("2d")!;
    const photo = () => {
      ct.drawImage(v, 0, 0, toile.width, toile.height);
      return new Promise<Blob>((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new VideoIllisible("video"))), "image/jpeg", 0.72));
    };
    /* Un pas de 0,2 s (pas plus de 500 instants regardés) ; on saute la première demi-seconde (le Centre de contrôle qui se ferme) */
    const pas = Math.max(0.2, duree / 500);
    const debut = duree > 3 ? 0.5 : 0;
    const images: Blob[] = [];
    let avant: Mesure | null = null;
    let tAvant = debut;
    let parcouru = 0;
    let sens = 0;
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
          parcouru += Math.abs(d);
          if (parcouru >= MESURE_H * PAS_GARDE) {
            images.push(await photo());
            parcouru = 0;
          }
        }
      }
      if (images.length > IMAGES_MAX) throw new VideoIllisible("longue");
      avant = m;
      tAvant = t;
      onAvance?.(Math.min(1, (t - debut) / Math.max(0.01, duree - debut)));
    }
    /* La fin de la conv, si elle a encore défilé depuis le dernier écran gardé */
    if (parcouru > MESURE_H * 0.12) images.push(await photo());
    if (images.length > IMAGES_MAX) throw new VideoIllisible("longue");
    /* On a remonté la conv (le contenu descend) : les écrans vont du plus récent au plus ancien, on les remet dans l’ordre */
    return sens > 0 ? images.reverse() : images;
  } finally {
    v.removeAttribute("src");
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Les lots à lire : une douzaine d’images, chaque lot reprenant la dernière image du précédent (pour recoller les
 * messages). `poids` et `max` : un lot ne dépasse pas non plus ce poids (Vercel refuse un envoi de plus de 4,5 Mo).
 */
export function lotsDe<T>(images: T[], taille = 12, poids: (x: T) => number = () => 0, max = Infinity): T[][] {
  const lots: T[][] = [];
  let i = 0;
  while (i < images.length) {
    let j = i;
    let total = 0;
    while (j < images.length && j - i < taille && (j === i || total + poids(images[j]) <= max)) total += poids(images[j++]);
    lots.push(images.slice(i, j));
    if (j >= images.length) break;
    /* Le lot suivant reprend la dernière image de celui-ci (sauf un lot d’une seule image : on avance) */
    i = j - 1 > i ? j - 1 : j;
  }
  return lots;
}
