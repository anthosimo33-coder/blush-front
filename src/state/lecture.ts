/*
 * La lecture que « Qui es-tu ? » ou le code reçu vient de lancer (POST /api/analyse, avec les réponses) : l’écran de
 * lecture la reprend au lieu de refaire un POST avant de suivre la lecture. Le lancement est attendu avant d’ouvrir
 * /lecture : la page serveur lit la conv que ce POST rattache au compte, avec « Qui es-tu ? » rempli.
 * En mémoire seulement, et prise une fois : un onglet rouvert (ou rechargé) relance comme avant.
 */
let lancee = false;

/** Retient que la lecture vient de partir, pour l’écran de lecture. */
export function retenirLecture() {
  lancee = true;
}

/** Vrai si la lecture a été lancée juste avant d’arriver (une seule fois). */
export function lectureLancee(): boolean {
  const l = lancee;
  lancee = false;
  return l;
}
