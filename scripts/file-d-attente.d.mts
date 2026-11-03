/*
 * Les types de scripts/file-d-attente.mjs, pour le TypeScript qui l’importe (tests/unit/file-d-attente.test.ts) : sans
 * allowJs, tsc ne lit pas un .mjs. Ces déclarations se tiennent à la main, à côté de lui, et changent avec lui ;
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms.
 */

/** Ce que la file garde d’une place ou d’un ticket : le processus, son heure, sa commande, sa copie de travail. */
type Entree = { pid: number; depuis: number; quoi: string; ou: string; nom: string };

/** Le dossier commun de la file, le même pour toutes les copies de travail et toutes les sessions du poste. */
export const DOSSIER_PAR_DEFAUT: string;

/** Au-delà, une place ou un ticket est repris même si son processus semble vivant (un numéro réutilisé après un redémarrage). */
export const PLACE_MAX_MS: number;

/** Qui tourne et qui attend, dans l’ordre des tickets. */
export function etatDeLaFile(options?: { dossier?: string }): { places: Entree[]; tickets: Entree[] };

/**
 * Attend une place dans la file, puis la rend par la fonction retournée (à appeler une fois, à la fin). `dire` reçoit
 * les messages pour la personne qui attend (qui tourne, depuis quand), au premier regard puis une fois par minute.
 */
export function prendrePlace(options?: { dossier?: string; places?: number; quoi?: string; ou?: string; pid?: number; dire?: (message: string) => void }): Promise<() => void>;
