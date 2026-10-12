/*
 * Les valeurs fermées des colonnes `text` de la base (schema.ts) : la seule liste de chacune, d’où viennent leurs types.
 * Une colonne `text(…, { enum })` ne change rien en base (ni contrainte, ni migration) : seul le code est vérifié. Sans
 * server-only, et importé en chemin relatif par schema.ts : drizzle-kit le lit hors de Next. Ici, celles que seul le
 * serveur lit ; celles que le navigateur lit aussi (OFFRES, OFFRES_UNIQUES, STATUTS_ACHAT, VOIX, EVENEMENTS_ECOUTE) sont dans src/types. Ce module
 * n’importe rien : schema.ts ne dépend ainsi d’aucun module métier.
 */

/** Les étapes (tasks.kind) : le verdict (prompt 04), le rapport en deux temps (05), le vocal (06), la mémoire (07) et ses mises à jour. */
export const GENRES = ["verdict", "rapport_plan", "rapport_chapitres", "vocal", "memoire", "memoire_maj"] as const;
export type Genre = (typeof GENRES)[number];
/**
 * Les étapes de la chaîne : chacune n’existe qu’une fois en attente ou en cours par histoire (l’index unique
 * tasks_une_par_etape). Les mises à jour de la mémoire, elles, s’empilent. Changer cette liste change l’index :
 * `npm run db:generer` écrit sa migration (scripts/verifier-migrations.mjs refuse le build sans elle).
 */
export const GENRES_CHAINE = ["verdict", "rapport_plan", "rapport_chapitres", "vocal", "memoire"] as const satisfies readonly Genre[];

/** Une moitié du rapport (chapitres 1 à 4, ou 5 à 8) : où elle en est (0 à 1), ses chapitres écrits, celui en cours. */
export type AvanceMoitie = { progres: number; ecrits: number[]; enCours: number | null };
/** Le détail de l’avancée d’une tâche (tasks.detail) : les deux moitiés du rapport, chapitre par chapitre. */
export type DetailEcriture = { a: AvanceMoitie; b: AvanceMoitie };

/** tasks.status : attente → en_cours → fini, ou echec (BACKEND.md, « Les tâches »). */
export const STATUTS_TACHE = ["attente", "en_cours", "fini", "echec"] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];

/** chat_messages.role : son message, ou la réponse de BLUSH. */
export const ROLES_CHAT = ["toi", "blush"] as const;

/** waitlist.source : d’où vient l’inscription (« accueil » : la page de la liste ; « connexion » : refusé à l’écran email). */
export const SOURCES_ATTENTE = ["accueil", "connexion"] as const;
export type SourceAttente = (typeof SOURCES_ATTENTE)[number];

/** achats.fournisseur : Whop, ou le faux Whop des tests et du dev (BLUSH_PAIEMENT_FACTICE). */
export const FOURNISSEURS_PAIEMENT = ["whop", "factice"] as const;
export type FournisseurPaiement = (typeof FOURNISSEURS_PAIEMENT)[number];

/**
 * mouvements_bulles.raison : un achat livré, une réponse de BLUSH payée, une réponse rendue (une erreur, une alerte
 * danger), un achat remboursé ou contesté (ses bulles reprises), le cadeau des testeurs de la bêta, un don de l’équipe.
 */
export const RAISONS_BULLES = ["achat", "reponse", "rendu", "remboursement", "beta", "equipe"] as const;
export type RaisonBulles = (typeof RAISONS_BULLES)[number];
