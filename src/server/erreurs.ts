import "server-only";

/** Une erreur attendue d’une étape (son code part dans les logs et la tâche, jamais de contenu). */
export class ErreurTache extends Error {}
