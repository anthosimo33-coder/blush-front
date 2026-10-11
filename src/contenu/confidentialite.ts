import { CODE_MINUTES } from "@/lib/limites";

/*
 * Les promesses de BLUSH sur ta conv et ton email, écrites une fois : les notes au cadenas des écrans (NotePrivee) et
 * « Mon compte » les reprennent telles quelles. Elles résument la page Confidentialité (ConfidentialiteScreen), qui fait
 * foi : une promesse courte ne dit rien que la page ne dise.
 * TODO(produit): formulation unique à faire valider par un juriste, en même temps que la page Confidentialité.
 */

/** Le sort de la conv brute, partout le même (la page : « La conv brute, effacée après ton rapport »). */
export const PROMESSE_CONV = "Ta conv est chiffrée, lue par une IA, et effacée après ton rapport.";

/** Ce que deviennent les convs gardées (« Mon compte ») : pas d’entraînement, et tout chiffré. */
export const PROMESSE_DONNEES = "Tes convs ne servent jamais à entraîner une IA, et tout ce qui en vient est chiffré.";

/**
 * Où elles vivent : la base à Francfort, l’IA et la voix chez des prestataires aux États-Unis (la page, « Où ça vit »).
 * Remplace « Hébergement en Europe », qui taisait les États-Unis.
 * TODO(produit): phrase de remplacement proposée, à valider (juriste).
 */
export const PROMESSE_LIEU = "Elles sont gardées à Francfort, et l’IA qui les lit est aux États-Unis.";

/** Effacer est toujours possible, depuis « Mon compte ». */
export const PROMESSE_EFFACEMENT = "Tu peux tout effacer à tout moment.";

/** L’email ne sert qu’à BLUSH. */
const PROMESSE_EMAIL = "Ton email n’est jamais partagé.";

/** Sous le champ de l’email du parcours : ni mot de passe, ni pub. */
export const NOTE_EMAIL = `Pas de mot de passe, pas de spam. ${PROMESSE_EMAIL}`;

/** Sous le champ de l’email de la connexion. */
export const NOTE_CONNEXION = "Pas de mot de passe\u00a0: un code suffit, sur chaque nouvel appareil. Tes convs restent chiffrées.";

/** Sous les cases du code, avec sa vraie durée (CODE_MINUTES, la même que le serveur et le mail). */
export const NOTE_CODE = `Pas de mot de passe\u00a0: ce code suffit. Il expire au bout de ${CODE_MINUTES} minutes.`;

/** Sous le champ de la liste d’attente. */
export const NOTE_ATTENTE = `Un mail pour confirmer, puis un autre le jour où ta place est prête. ${PROMESSE_EMAIL}`;

/** L’enregistrement de l’écran (iMessage) : la vidéo ne part pas, seuls ses écrans. */
export const NOTE_ENREGISTREMENT = "La vidéo reste sur ton téléphone\u00a0: seuls les écrans de la conv partent, lus une fois puis oubliés.";
