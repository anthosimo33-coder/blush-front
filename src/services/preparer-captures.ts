import "client-only";
/*
 * Dans le navigateur, avant l’envoi : chaque capture est réduite (1 568 px au plus sur le grand côté, ce que le modèle
 * lit de toute façon) et compressée en JPEG. L’envoi reste sous la limite de Vercel (4,5 Mo), même avec 20 captures.
 */
import { COTE_IMAGE_MAX, ENVOI_IMAGES_MAX } from "@/lib/limites";

/* Les crans de réduction : le premier pour toutes, les suivants pour les plus lourdes si l’ensemble dépasse la limite */
const CRANS = [
  [0.82, COTE_IMAGE_MAX],
  [0.7, 1400],
  [0.6, 1200],
] as const;
/* Les vignettes de l’écran des captures : 240 px sur le petit côté, assez net pour une tuile de 108 px */
const VIGNETTE = 240;

/*
 * Le travail du Worker : décoder, réduire, encoder en JPEG, hors du fil principal (Safari encode le JPEG d’une toile
 * dans l’appel même : 35 à 65 ms par capture, l’écran accrochait). En texte, chargé depuis un blob : rien à empaqueter,
 * le même code partout. OffscreenCanvas : Safari 16.4 et plus ; ailleurs, ou s’il échoue, le fil principal prend le relais.
 * typo: du code, pas un texte (scripts/verifier-typo.mjs n’y cherche pas d’insécables).
 */
const CODE_WORKER = `
onmessage = async (e) => {
  const { id, fichier, qualite, cote, petit } = e.data;
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, cote / (petit ? Math.min(image.width, image.height) : Math.max(image.width, image.height)));
    const toile = new OffscreenCanvas(Math.max(1, Math.round(image.width * echelle)), Math.max(1, Math.round(image.height * echelle)));
    toile.getContext("2d").drawImage(image, 0, 0, toile.width, toile.height);
    image.close();
    const blob = await toile.convertToBlob({ type: "image/jpeg", quality: qualite });
    toile.width = toile.height = 0;
    postMessage({ id, blob });
  } catch {
    postMessage({ id, blob: null });
  }
};`;

type Travail = { fichier: Blob; qualite: number; cote: number; petit?: boolean };

/* undefined : pas encore créé ; null : pas de Worker dans ce navigateur (ou il a échoué) */
let worker: Worker | null | undefined;
let numero = 0;
const attentes = new Map<number, (b: Blob | null) => void>();

function leWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") throw new Error("sans worker");
    const w = new Worker(URL.createObjectURL(new Blob([CODE_WORKER], { type: "text/javascript" })));
    w.onmessage = (e: MessageEvent<{ id: number; blob: Blob | null }>) => {
      attentes.get(e.data.id)?.(e.data.blob);
      attentes.delete(e.data.id);
    };
    /* Un Worker qui ne tourne pas : ce qui attend, et tout ce qui suit, repasse par le fil principal */
    w.onerror = () => {
      w.terminate();
      worker = null;
      attentes.forEach((r) => r(null));
      attentes.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/*
 * Une image à la fois, Worker compris (vingt images décodées en même temps débordent la mémoire d’un iPhone) : les
 * vignettes, les captures réduites d’avance et celles de l’envoi passent l’une après l’autre.
 */
let file: Promise<unknown> = Promise.resolve();
function auWorker(t: Travail): Promise<Blob | null> {
  const suite = file.then(
    () =>
      new Promise<Blob | null>((ok) => {
        const w = leWorker();
        if (!w) return ok(null);
        const id = numero++;
        /* Pas de réponse (Worker bloqué) : le fil principal fera ce travail */
        const garde = setTimeout(() => {
          attentes.delete(id);
          ok(null);
        }, 20_000);
        attentes.set(id, (b) => {
          clearTimeout(garde);
          ok(b && b.size ? b : null);
        });
        w.postMessage({ id, ...t });
      }),
  );
  file = suite;
  return suite;
}

/** Le contenu d’une toile en JPEG (sur le fil principal), ou `erreur()` si le navigateur n’y arrive pas. Les images d’une vidéo aussi (preparer-video.ts). */
export const toileEnJpeg = (toile: HTMLCanvasElement, qualite: number, erreur: () => Error) =>
  new Promise<Blob>((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(erreur())), "image/jpeg", qualite));

/** Le repli, sur le fil principal (le chemin d’avant) : une pause d’abord, pour que l’écran respire entre deux captures. */
async function reduireIci(fichier: File, qualite: number, cote: number): Promise<Blob> {
  await new Promise((r) => setTimeout(r, 0));
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, cote / Math.max(image.width, image.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext("2d")!.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  const blob = await toileEnJpeg(toile, qualite, () => new Error("capture"));
  /* La toile rendue tout de suite : Safari sur iPhone plafonne la mémoire des toiles */
  toile.width = toile.height = 0;
  return blob;
}

async function reduire(fichier: File, cran: number): Promise<Blob> {
  const [qualite, cote] = CRANS[cran];
  return (await auWorker({ fichier, qualite, cote })) ?? reduireIci(fichier, qualite, cote);
}

/* Les captures déjà réduites au premier cran, dès leur choix (voir prereduire) */
const dejaReduites = new WeakMap<File, Promise<Blob | null>>();

/**
 * Dès qu’on choisit ses captures, le Worker les réduit d’avance (au premier cran) : au toucher « Continuer », l’envoi
 * part plus tôt. Sans Worker, rien d’avance : ce travail sur le fil principal ferait accrocher le glisser des captures.
 */
export function prereduire(fichiers: File[]) {
  if (!leWorker()) return;
  for (const f of fichiers) if (!dejaReduites.has(f)) dejaReduites.set(f, auWorker({ fichier: f, qualite: CRANS[0][0], cote: CRANS[0][1] }));
}

/** La vignette d’une capture pour l’écran (une petite image au lieu de l’originale décodée en entier) ; null sans Worker. */
export function vignette(fichier: File): Promise<Blob | null> {
  if (!leWorker()) return Promise.resolve(null);
  return auWorker({ fichier, qualite: 0.7, cote: VIGNETTE, petit: true });
}

/**
 * Les captures, réduites. Si l’ensemble dépasse la limite d’envoi, on resserre d’un cran les plus lourdes d’abord,
 * jusqu’à ce que ça tienne (avant, toutes étaient redécodées et réencodées, jusqu’à trois fois).
 */
export async function preparerCaptures(fichiers: File[]): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const f of fichiers) blobs.push((await dejaReduites.get(f)) ?? (await reduire(f, 0)));
  const crans = fichiers.map(() => 0);
  const total = () => blobs.reduce((s, b) => s + b.size, 0);
  while (total() > ENVOI_IMAGES_MAX) {
    /* Le cran le moins serré d’abord, et la plus lourde à ce cran */
    let k = -1;
    for (let i = 0; i < blobs.length; i++) {
      if (crans[i] >= CRANS.length - 1) continue;
      if (k < 0 || crans[i] < crans[k] || (crans[i] === crans[k] && blobs[i].size > blobs[k].size)) k = i;
    }
    if (k < 0) throw new Error("capture");
    blobs[k] = await reduire(fichiers[k], ++crans[k]);
  }
  return blobs;
}
