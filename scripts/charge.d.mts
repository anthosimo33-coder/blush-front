/*
 * Les types de scripts/charge.mjs, pour tests/unit/charge.test.ts : sans allowJs, tsc ne lit plus un .mjs.
 * Le script reste en JavaScript (tsx le lance par `npm run charge`) ; ces déclarations changent avec lui.
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms.
 */

/** Les réglages d’un lancement. */
export type Options = {
  parcours: number;
  montee: number;
  duree: number;
  messages: number;
  delai: number;
  sondage: number;
  lente: number;
  releve: number;
  /** Un aller-retour de plus (ms) entre l’appli et la base, par un relais TCP (0 : en direct). */
  latence: number;
  /** Le webhook du paiement posté deux fois en même temps. */
  rejeu: boolean;
  garder: boolean;
  sortie: string;
};

/** Lit les options de la ligne de commande : les réglages, `{ aide: true }`, ou une erreur lisible. */
export function lireOptions(argv: readonly string[]): Options | { aide: true };

/** Le centile `p` (0 à 100) de ces valeurs, au rang le plus proche ; null pour une liste vide. */
export function centile(valeurs: readonly number[], p: number): number | null;

/** Le résumé d’une série de durées (ms) : combien, p50, p95, max ; null pour une série vide. */
export function resume(valeurs: readonly number[]): { n: number; p50: number; p95: number; max: number } | null;

/** Le chemin d’une requête rangé comme sa route (« GET /api/paiement/[achat] »). */
export function routeDe(methode: string, chemin: string): string;

/** Un bocal à cookies : ce que le serveur pose repart avec les requêtes suivantes. */
export function nouveauBocal(): { recevoir(entetes: Headers): void; entete(): string; taille(): number };

/**
 * Un relais TCP vers `hote`:`port` qui retarde chaque morceau de `ms / 2` dans chaque sens (un aller-retour de `ms` de
 * plus) : son port sur 127.0.0.1, les connexions prises (une requête envoyée, pas encore rendue libre par ReadyForQuery
 * hors transaction) et ouvertes, et de quoi le fermer.
 */
export function relaisLent(hote: string, port: number, ms: number): Promise<{ port: number; prises(): number; ouvertes(): number; fermer(): Promise<void> }>;

/** Le _chat.txt d’un export WhatsApp iPhone inventé, propre au parcours `k`. */
export function convInventee(k: number): string;

/** Ce que main() relève, et que le rapport lit. */
export type Mesures = {
  options: Options;
  debut: number;
  fin: number;
  interrompu: boolean;
  machine: { systeme: string; coeurs: number; node: string; chargeAvant: string; chargeApres: string };
  build: string | null;
  commit: string | null;
  base: string;
  pool: number | null;
  postgres: { version: string | null; maxConnexions: string | null };
  parcours: { ok: boolean; anomalie: boolean }[];
  requetes: { route: string; ms: number; statut: number; erreur: string | null }[];
  etapes: Map<string, number[]>;
  /** Clé : l’étape et le code, séparés par U+0000. */
  erreurs: Map<string, number>;
  /** `prisesAppli` : les connexions prises vues du relais (--latence), réseau compris. */
  base_releves: { t: number; total: number; actifs: number; idleTx: number; verrous: number; plusLongue: number; prisesAppli?: number }[];
  lentes: Map<string, { vues: number; max: number }>;
  stats: Record<string, number> | null;
  /** Les convs dont deux étapes ont tourné en même temps (0 attendu), ou null s’il n’a pas pu être lu. */
  chevauchements: number | null;
  serveur_releves: { t: number; rssMo: number; cpu: number }[];
  /** Clé : l’événement et le niveau, séparés par U+0000. */
  journal: Map<string, number>;
};

/** Le rapport markdown d’un lancement. */
export function rapportMarkdown(m: Mesures): string;
