/*
 * Les chapitres du rapport, et ce qui en est offert. Le rapport a huit chapitres, toujours dans le même ordre. En
 * production, seul le chapitre 1, « Le verdict », est offert : il s’écrit avec le verdict, pour tout le monde. Les sept
 * autres se débloquent (BLUSH+ ou le rapport seul) ; avant, ils restent fermés et vides, et rien de leur contenu n’est
 * montré (seule exception : le mode sobre, qui s’ouvre sans paiement, voir rapportDe). La règle s’écrit ici une seule
 * fois : les chapitres fermés et l’écriture (src/server/donnees.ts), la reprise après le paiement (/rapport/debloque),
 * le mail « ton rapport est prêt » la lisent ici.
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

/** Le chapitre de l’autre personne : son prénom en attente, « Elle » ou « Lui » dans le mail (qui ne dit aucun prénom). */
const DE_L_AUTRE = 5;

/*
 * Les titres de chaque chapitre, sauf celui de l’autre. `attente` : dans le rapport, tant que le plan n’a pas donné
 * les vrais (les chapitres fermés, la liste de l’écriture). `mail` : le sommaire du mail « ton rapport est prêt ».
 */
const TITRES: Record<number, { attente: string; mail: string }> = {
  1: { attente: "Le verdict", mail: "Le verdict" },
  2: { attente: "Le moment où tout a basculé", mail: "La bascule" },
  3: { attente: "Votre histoire, en actes", mail: "Votre histoire" },
  4: { attente: "Ce qui coince", mail: "Ce qui coince" },
  6: { attente: "Toi", mail: "Toi" },
  7: { attente: "Votre duo", mail: "Votre duo" },
  8: { attente: "Ton prochain pas", mail: "Ton prochain pas" },
};

/** Le titre d’un chapitre avant que le plan donne le sien. `autre` : le prénom de l’autre personne. */
export const titreDAttente = (numero: number, autre: string) => (numero === DE_L_AUTRE ? autre : TITRES[numero].attente);

/** Le titre d’un chapitre dans le sommaire du mail. `autre` : le pronom de l’autre personne. */
export const titreDuMail = (numero: number, autre: "il" | "elle") => (numero === DE_L_AUTRE ? (autre === "elle" ? "Elle" : "Lui") : TITRES[numero].mail);
