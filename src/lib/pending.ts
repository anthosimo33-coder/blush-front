/* Fichier choisi sur un écran et lu sur le suivant (gardé en mémoire, jamais envoyé). */
let pending: File | null = null;

export function setPendingFile(f: File | null) {
  pending = f;
}

export function takePendingFile() {
  return pending;
}
