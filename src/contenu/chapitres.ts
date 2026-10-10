/*
 * Les chapitres du rapport, et ce qui en est offert. Le rapport a huit chapitres, toujours dans le même ordre. En
 * production, seul le chapitre 1, « Le verdict », est offert : il s’écrit avec le verdict, pour tout le monde. Les sept
 * autres se débloquent (BLUSH+ ou le rapport seul) ; avant, ils restent fermés et vides, et rien de leur contenu n’est
 * montré (seule exception : le mode sobre, qui s’ouvre sans paiement, voir rapportDe). La règle s’écrit ici : les
 * chapitres fermés et l’écriture (src/server/donnees.ts), la révélation du verdict (src/app/rapport/verdict/cartes.ts),
 * la reprise après le paiement (/rapport/debloque) et le mail « ton rapport est prêt » (src/server/mail-rapport.ts) la
 * lisent ici.
 * Le `free` des chapitres écrits par le modèle (le sous-module des prompts) n’est pas lu : même le temps de lecture
 * « offert » d’un rapport écrit (readingTime.free, src/server/analyse.ts) suit estOffert.
 */

export const NB_CHAPITRES = 8;

/** Les chapitres offerts, les premiers du rapport : seul le verdict. */
export const CHAPITRES_OFFERTS = 1;

/** Le chapitre se lit-il sans payer ? */
export const estOffert = (numero: number) => numero <= CHAPITRES_OFFERTS;

/** Le premier chapitre payant : celui où la lecture reprend après le déblocage. */
export const PREMIER_PAYANT = CHAPITRES_OFFERTS + 1;

/** Les chapitres payants, dans l’ordre (2 à 8) : fermés sans accès, écrits par le rapport une fois débloqué. */
export const CHAPITRES_PAYANTS = Array.from({ length: NB_CHAPITRES - CHAPITRES_OFFERTS }, (_, k) => PREMIER_PAYANT + k);

/** Le chapitre du verdict, offert : la révélation du verdict y prend la confiance et le duel. */
export const CHAPITRE_DU_VERDICT = 1;

/** « Le moment où tout a basculé », payant : la révélation du verdict y prend « le moment » et « à toi de jouer », une fois débloqué. */
export const CHAPITRE_DE_LA_BASCULE = 2;

/** Le chapitre de l’autre personne : son titre est son prénom. */
const DE_L_AUTRE = 5;

/*
 * Les titres de chaque chapitre, sauf celui de l’autre. Le rapport les montre tant que le plan n’a pas donné les vrais
 * (les chapitres fermés, la liste de l’écriture) ; le sommaire du mail « ton rapport est prêt » les reprend tels quels.
 */
const TITRES: Record<number, string> = {
  1: "Le verdict",
  2: "Le moment où tout a basculé",
  3: "Votre histoire, en actes",
  4: "Ce qui coince",
  6: "Toi",
  7: "Votre duo",
  8: "Ton prochain pas",
};

/** Le titre d’un chapitre avant que le plan donne le sien (et dans le mail). `autre` : le prénom de l’autre personne. */
export const titreDAttente = (numero: number, autre: string) => (numero === DE_L_AUTRE ? autre : TITRES[numero]);
