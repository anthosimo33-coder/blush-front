/*
 * Ce que le modèle factice (src/server/ia/factice.ts) écrit, et ce qui le fait changer de chemin : écrit une fois ici,
 * sans « server-only », pour que les tests (vitest comme Playwright) le lisent au lieu de recopier ses valeurs. Une
 * valeur changée ici change le modèle factice et ce que les tests en attendent, ensemble.
 */

/** Les chapitres du plan factice, et leur titre court (« Ch. 3 »). */
const CHAPITRES = 8;

export const FACTICE = {
  /**
   * Les déclencheurs : des marqueurs inventés, que personne n’écrit dans une vraie conv, écrits dans une conv (ou un
   * message au chat) par les tests pour faire prendre au modèle factice un chemin qu’il ne prend jamais sinon. Le modèle
   * factice n’existe pas sur Vercel (src/server/env.ts) : la production ne les lit jamais.
   * `alerte` : dans la conv, le verdict lève une alerte (danger), et le rapport passe en mode sobre (src/server/analyse.ts).
   * `refus` : dans la conv, le modèle refuse de la lire (le verdict) ; dans un message au chat, il refuse d’y répondre.
   */
  alerte: "#factice-alerte",
  refus: "#factice-refus",
  /** Les messages qu’il lit dans des captures, quelles qu’elles soient : deux soirées de 12. */
  messagesCaptures: 24,
  /** La ligne de son profil qu’il lit dans des captures (elle devient une info de sa fiche). */
  profil: "Étudiante en droit à Lyon",
  /** Les chapitres de son rapport (deux moitiés égales), et leur titre court. */
  chapitres: CHAPITRES,
  titreCourt: (numero: number) => `Ch. ${numero}`,
} as const;
