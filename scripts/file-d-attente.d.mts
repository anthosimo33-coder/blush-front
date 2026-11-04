/*
 * Les types de scripts/file-d-attente.mjs, pour le TypeScript qui l’importe (tests/unit/file-d-attente.test.ts) : sans
 * allowJs, tsc ne lit pas un .mjs. Ces déclarations se tiennent à la main, à côté de lui, et changent avec lui ;
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms.
 */

/**
 * Ce que la file garde d’une place ou d’un ticket (son jeton, son processus, sa commande, sa copie de travail, son
 * heure d’arrivée), et ce qu’on en voit : son fichier, la date de son dernier battement et son état. Un fichier
 * illisible n’a que les trois premiers.
 */
type Entree = {
  nom: string;
  chemin: string;
  battu: number;
  etat: "vivante" | "orpheline" | "silencieuse" | "morte" | "illisible";
  jeton?: string;
  pid?: number;
  quoi?: string;
  ou?: string;
  depuis?: number;
};

/** Une place : en plus, le numéro de la suite lancée, sa tenue (la somme de ses battements, sans veille ni Ctrl-Z) et son plafond, en ms, et si elle compte parmi les prises. */
type Place = Entree & { enfant?: number | null; tenue?: number; plafond?: number; compte: boolean };

/** Un ticket : en plus, son rang d’arrivée. */
type Ticket = Entree & { rang?: number };

/** Le dossier versionné de la file, sous sa racine (BLUSH_FILE_DOSSIER, ou /tmp/blush-suites-lourdes). */
export function dossierDeLaFile(racine?: string): string;

/**
 * Qui tourne et qui attend, sans rien changer (ni dossier créé, ni mort effacé) : les places et les tickets de la file
 * de `dossier` (sa racine), chacun avec son état (juger), la date de son dernier battement et, pour une place, si elle
 * compte parmi les prises. Les places dans l’ordre où elles ont été prises, les tickets dans l’ordre d’arrivée.
 */
export function etatDeLaFile(options?: { dossier?: string }): { places: Place[]; tickets: Ticket[] };
