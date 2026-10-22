/*
 * Les chapitres du rapport, et ce qui en est offert. Le rapport a huit chapitres, toujours dans le même ordre. En
 * production, seul le chapitre 1, « Le verdict », est offert : il s’écrit avec le verdict, pour tout le monde. Les sept
 * autres se débloquent (le rapport payé, une fois, pour cette conv) ; avant, ils restent fermés et vides, et rien de
 * leur contenu n’est montré (seule exception : le mode sobre, qui s’ouvre sans paiement, voir rapportDe). La règle s’écrit ici : les
 * chapitres fermés et l’écriture (src/server/donnees.ts), la révélation du verdict (src/app/rapport/verdict/cartes.ts),
 * la reprise après le paiement (/rapport/debloque) et le mail « ton rapport est prêt » (src/server/mail-rapport.ts) la
 * lisent ici.
 * Les chapitres écrits par le modèle prennent leur `free` et le titre du verdict ici (src/server/ecrans/rapport.ts), comme
 * le temps de lecture « offert » d’un rapport écrit (readingTime.free, lectureDe dans src/server/ecrans/rapport.ts).
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

/** Son titre : le verdict lui-même est affiché juste au-dessus. */
export const TITRE_DU_VERDICT = "Le verdict";

/** « Le moment où tout a basculé », payant : la révélation du verdict y prend « le moment » et « à toi de jouer », une fois débloqué. */
export const CHAPITRE_DE_LA_BASCULE = 2;

/** Le chapitre de l’autre personne : son titre est son prénom (les aperçus du paywall le montrent). */
export const CHAPITRE_DE_L_AUTRE = 5;

/*
 * Les titres de chaque chapitre, sauf celui de l’autre : les titres d’attente. Les chapitres fermés montrent ceux que le
 * verdict a écrits pour leur histoire (prompts/lib/titres.ts, src/server/presentation/rapport.ts) ; ceux-ci les
 * remplacent quand il n’en a pas (un verdict d’avant le 13 octobre, une alerte, un titre qui n’a pas passé la
 * vérification), ou, pendant l’écriture, quand le plan n’a pas encore donné les siens. Le sommaire du mail « ton rapport
 * est prêt » les reprend tels quels : il ne dit rien de la conv.
 */
const TITRES: Record<number, string> = {
  [CHAPITRE_DU_VERDICT]: TITRE_DU_VERDICT,
  2: "Le moment où tout a basculé",
  3: "Votre histoire, en actes",
  4: "Ce qui coince",
  6: "Toi",
  7: "Votre duo",
  8: "Ton prochain pas",
};

/**
 * Le titre d’attente d’un chapitre : fermé sans titre du verdict, pendant l’écriture avant le plan, et dans le mail.
 * `autre` : le prénom de l’autre personne.
 * Chacun des NB_CHAPITRES en a un : un autre numéro est une erreur du code, levée ici plutôt qu’un titre vide à l’écran
 * ou dans le mail.
 */
export function titreDAttente(numero: number, autre: string): string {
  if (numero === CHAPITRE_DE_L_AUTRE) return autre;
  const titre = TITRES[numero];
  if (titre === undefined) throw new RangeError(`chapitre ${numero} : pas de titre d’attente`);
  return titre;
}
