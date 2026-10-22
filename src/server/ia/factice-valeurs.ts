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
   * `alerte` : dans la conv, le verdict lève une alerte qui met en mode sobre (détresse), et le rapport passe en mode
   * sobre (src/server/analyse.ts).
   * `danger` : dans la conv, le verdict lève une alerte « danger », qui ne met plus en mode sobre (21 octobre 2026) : le
   * verdict et le rapport sont complets, et se vendent.
   * `refus` : dans la conv, le modèle refuse de la lire (le verdict) ; dans un message au chat, il refuse d’y répondre.
   */
  alerte: "#factice-alerte",
  danger: "#factice-danger",
  /**
   * Dans un message au chat : il demande à acheter (`achat`), il demande le rapport d’une autre conv (`autreRapport`, avec
   * Léa), ou il parle d’une autre personne (`autrePersonne`, Léa).
   */
  achat: "#factice-achat",
  autreRapport: "#factice-rapport",
  autrePersonne: "#factice-autre",
  refus: "#factice-refus",
  /** Les messages qu’il lit dans des captures, quelles qu’elles soient : deux soirées de 12. */
  messagesCaptures: 24,
  /** La ligne de son profil qu’il lit dans des captures (elle devient une info de sa fiche). */
  profil: "Étudiante en droit à Lyon",
  /** Les chapitres de son rapport (deux moitiés égales), et leur titre court. */
  chapitres: CHAPITRES,
  titreCourt: (numero: number) => `Ch. ${numero}`,
  /**
   * Les titres que son verdict écrit pour les sept chapitres payants (prompts/lib/titres.ts), dans l’ordre du rapport :
   * inventés, sans rien citer de la conv (ils passent sa vérification, quelle que soit la conv). Celui du chapitre de
   * l’autre commence par son prénom, lu dans la demande, comme le demande le prompt.
   */
  titres: (autre: string) => ({
    bascule: "La perche du resto, et ce que tu aurais dû répondre",
    histoire: "Ce que son silence du dimanche voulait dire",
    coince: "Pourquoi tu réponds par une vanne quand elle t’ouvre une porte",
    autre: `${autre}, la reine des perches`,
    toi: "Toi, le roi du peut-être",
    duo: "Vous deux, champions du ping-pong de vannes",
    prochain_pas: "Le resto, et comment enfin le proposer",
  }),
} as const;
