import { CODE_MINUTES } from "@/lib/limites";

/*
 * Les promesses de BLUSH sur ta conv et ton email, écrites une fois : les notes des écrans (NotePrivee), « Mon compte »
 * et la note du rapport avec sa feuille (« En savoir plus ») les reprennent telles quelles. Elles résument la page
 * Confidentialité (ConfidentialiteScreen), qui fait foi : une promesse courte ne dit rien que la page ne dise.
 * TODO(produit): formulation unique à faire valider par un juriste, en même temps que la page Confidentialité.
 */

/** Le sort de la conv brute, partout le même (la page : « La conv brute, effacée après ton rapport »). */
export const PROMESSE_CONV = "Ta conv est chiffrée, lue par une IA, et effacée après ton rapport.";

/** Ce que deviennent les convs gardées (« Mon compte ») : pas d’entraînement, et tout chiffré. */
export const PROMESSE_DONNEES = "Tes convs ne servent jamais à entraîner une IA, et tout ce qui en vient est chiffré.";

/**
 * Où vit ce que BLUSH garde, et par où passent l’IA et la voix (la page, « Où ça vit » : la base à Francfort, les
 * prestataires de l’IA et de la voix aux États-Unis). Tient seule, où qu’elle soit posée. Remplace « Hébergement en
 * Europe », qui taisait les États-Unis.
 * TODO(produit): phrase de remplacement proposée, à valider (juriste).
 */
export const PROMESSE_LIEU = "Ce que BLUSH garde est à Francfort\u00a0; l’IA et la voix de BLUSH passent par des prestataires aux États-Unis.";

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

/**
 * Sous l’en-tête du rapport, avant « En savoir plus » : la conv est à toi, rien n’en sort sans toi (le détail est dans
 * FEUILLE_CONFIDENTIALITE, dont elle reprend le titre). Remplace « Ta conv reste privée », un « 100 % privé » qui ne
 * disait pas que l’IA la lit.
 */
export const PROMESSE_PARTAGE = "Ta conv reste à toi, et c’est toi qui décides.";

/**
 * La feuille « En savoir plus » du rapport : trois lignes, chacune résumant une ligne de la page, nommée par son titre
 * (`page` : « Chiffrée », « La conv brute, effacée après ton rapport », « Rien ne sort sans toi » ; tests/unit/promesses.test.ts
 * vérifie qu’elle y est). La ligne « effacée » dit PROMESSE_CONV, avec le détail de la page (l’ancien « Jamais lue, au bout
 * de 24 h » ne disait pas ce qui arrivait). La ligne du partage dit les deux façons de partager : le lien, qui ne montre
 * que le verdict, et l’image (« Partager en image », src/server/partages.ts), une réponse de BLUSH avec ta question ou la
 * chute d’un chapitre. Dans les deux, son prénom devient une initiale et le tien reste.
 * TODO(produit): le détail de la ligne du partage, réécrit le 12 octobre (il disait « seul ton verdict part »), à valider avec le juriste.
 */
export const FEUILLE_CONFIDENTIALITE = {
  titre: "Ta conv reste à toi.",
  chiffree: {
    titre: "Chiffrée, lue seulement par l’IA",
    page: "Chiffrée",
    detail: "Ta conv, ton rapport et le chat sont chiffrés. Personne chez BLUSH ne les lit.",
  },
  effacee: {
    titre: "Effacée après ton rapport",
    page: "La conv brute, effacée après ton rapport",
    detail:
      "La conv brute part dès que ton rapport est prêt. D’ici là, elle reste chiffrée, et tu la supprimes quand tu veux. Une conv jamais lue est effacée au bout de 24\u00a0h.",
  },
  partage: {
    titre: "Rien ne sort sans toi",
    page: "Rien ne sort sans toi",
    detail:
      "La personne avec qui tu parles n’est jamais contactée. Quand tu partages, seul ce que tu choisis part\u00a0: ton verdict, ou en image une réponse de BLUSH (avec ta question) ou un passage de ton rapport. Son prénom y devient une initiale.",
  },
} as const;
