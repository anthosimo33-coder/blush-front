/**
 * Dans le navigateur, avant l’envoi : chaque capture est réduite (1 568 px au plus sur le grand côté, ce que le modèle
 * lit de toute façon) et compressée en JPEG. L’envoi reste sous la limite de Vercel (4,5 Mo), même avec 20 captures.
 */
const COTE_MAX = 1568;
const ENVOI_MAX = 4 * 1024 * 1024;

async function reduire(fichier: File, qualite: number, cote: number): Promise<Blob> {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, cote / Math.max(image.width, image.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext("2d")!.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  const blob = await new Promise<Blob>((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error("capture"))), "image/jpeg", qualite));
  /* La toile rendue tout de suite : Safari sur iPhone plafonne la mémoire des toiles */
  toile.width = toile.height = 0;
  return blob;
}

/** Les captures, réduites ; on serre un peu plus si l’ensemble dépasse la limite d’envoi. */
export async function preparerCaptures(fichiers: File[]): Promise<Blob[]> {
  for (const [qualite, cote] of [
    [0.82, COTE_MAX],
    [0.7, 1400],
    [0.6, 1200],
  ] as const) {
    /* Une capture à la fois : vingt images décodées en même temps débordent la mémoire d’un iPhone */
    const blobs: Blob[] = [];
    for (const f of fichiers) blobs.push(await reduire(f, qualite, cote));
    if (blobs.reduce((s, b) => s + b.size, 0) <= ENVOI_MAX) return blobs;
  }
  throw new Error("capture");
}
