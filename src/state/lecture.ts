/*
 * La lecture que « Qui es-tu ? » ou le code reçu vient de lancer (POST /api/analyse, avec les réponses) : l’écran de
 * lecture la reprend au lieu de refaire un POST avant de suivre la lecture. Le lancement est attendu avant d’ouvrir
 * /lecture : la page serveur lit la conv que ce POST rattache au compte, avec « Qui es-tu ? » rempli.
 * En mémoire seulement, et prise une fois : un onglet rouvert (ou rechargé) relance comme avant. Pas le jobId du
 * parcours, qui reste d’une conv à l’autre.
 */
let lancee: { jobId: string } | null = null;

/** Retient la lecture qui vient de partir, pour l’écran de lecture. */
export function retenirLecture(lecture: { jobId: string }) {
  lancee = lecture;
}

/** La lecture lancée juste avant d’arriver (une seule fois), ou null. */
export function lectureLancee(): { jobId: string } | null {
  const l = lancee;
  lancee = null;
  return l;
}
