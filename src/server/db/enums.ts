/*
 * Les valeurs fermées des colonnes `text` de la base (schema.ts) : la seule liste de chacune, d’où viennent leurs types.
 * Une colonne `text(…, { enum })` ne change rien en base (ni contrainte, ni migration) : seul le code est vérifié. Sans
 * server-only, et importé en chemin relatif par schema.ts : drizzle-kit le lit hors de Next. Le plan d’un compte
 * (PLANS) est dans src/types : le navigateur le lit aussi.
 */

/** Les étapes (tasks.kind) : le verdict (prompt 04), le rapport en deux temps (05), le vocal (06), la mémoire (07) et ses mises à jour. */
export const GENRES = ["verdict", "rapport_plan", "rapport_chapitres", "vocal", "memoire", "memoire_maj"] as const;
export type Genre = (typeof GENRES)[number];
/**
 * Les étapes de la chaîne : chacune n’existe qu’une fois en attente ou en cours par histoire (l’index unique
 * tasks_une_par_etape). Les mises à jour de la mémoire, elles, s’empilent.
 */
export const GENRES_CHAINE = ["verdict", "rapport_plan", "rapport_chapitres", "vocal", "memoire"] as const satisfies readonly Genre[];

/** tasks.status : attente → en_cours → fini, ou echec (BACKEND.md, « Les tâches »). */
export const STATUTS_TACHE = ["attente", "en_cours", "fini", "echec"] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];

/** chat_messages.role : son message, ou la réponse de BLUSH. */
export const ROLES_CHAT = ["toi", "blush"] as const;

/** Les deux voix de l’A/B test (vocals, chat_vocals, vocal_ecoutes) : A (E2, créée pour BLUSH) et B (L2, Harmonie, de la bibliothèque ElevenLabs). */
export const VOIX = ["A", "B"] as const;
export type Voix = (typeof VOIX)[number];

/** vocal_ecoutes.evenement : un moment de l’écoute du vocal (le début, la fin, une réécoute, fermé avant la fin). */
export const EVENEMENTS_ECOUTE = ["debut", "fin", "reecoute", "ferme"] as const;
export type EvenementEcoute = (typeof EVENEMENTS_ECOUTE)[number];

/** waitlist.source : d’où vient l’inscription (« accueil » : la page de la liste ; « connexion » : refusé à l’écran email). */
export const SOURCES_ATTENTE = ["accueil", "connexion"] as const;
export type SourceAttente = (typeof SOURCES_ATTENTE)[number];
