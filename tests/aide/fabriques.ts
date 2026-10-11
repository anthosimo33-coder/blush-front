import { estFaite, type MemoireFaite } from "@prompts/lib/memoire";
import { Maj07, Sortie01, Sortie07, type Captures, type Chapitre, type Maj, type Memoire } from "@prompts/lib/schemas";

/*
 * Des sorties des prompts fabriquées pour les tests, sans base ni modèle : le test ne donne que ce qu’il regarde, le
 * reste est neutre. Chacune passe par le schéma de sa sortie (prompts/lib/schemas.ts) : une fabrique rend toujours ce
 * que le modèle aurait pu rendre, jamais un objet incomplet maquillé par un cast. Les textes sont inventés.
 */

type Msg = Captures["blocs"][number]["messages"][number];

/** Un message lu sur des captures : du texte, sans média, entier, sans réaction (sauf ce que `autres` change). */
export const msg = (de: Msg["de"], texte: string, autres: Partial<Omit<Msg, "de" | "texte">> = {}): Msg => ({ de, texte, media: null, coupe: false, reaction: null, ...autres });

/** Des captures lues (prompt 01) : une capture, dans le sujet, sans profil ni doute (sauf ce que `c` change). */
export const captures = (c: Partial<Captures> = {}): Captures =>
  Sortie01.parse({ appli: "instagram", autre: "Léa", captures: [{ numero: 1, place: 1, hors_sujet: false }], blocs: [], profil: [], doutes: [], ...c });

/** Un lot d’enregistrement d’écran, tel que /api/captures/lot le renvoie : quinze messages alternés, « message k0 » et la suite. */
export const lotVideo = (autre = "Léa", k0 = 0) =>
  captures({ autre, blocs: [{ repere: { date: "2026-09-08", heure: "21:40" }, messages: Array.from({ length: 15 }, (_, k) => msg(k % 2 ? "moi" : "autre", `message ${k0 + k}`)) }] });

const MEMOIRE: NonNullable<Memoire["memoire"]> = { ou_on_en_est: "Vus deux fois.", moments: [], son_mode: [], ton_mode: [], conseils: [], a_venir: [] };
const FICHE: NonNullable<Memoire["fiche"]> = { portrait: "la Taquine", phrase: "Son exam est jeudi", phrase_courte: "Son exam jeudi", faits: [] };

/** Une mémoire faite (prompt 07) : `memoire` et `fiche` complètent une mémoire et une fiche vides, le reste la remplace. */
export const memoire = ({
  memoire: m,
  fiche: f,
  ...reste
}: Partial<Omit<Memoire, "memoire" | "fiche">> & { memoire?: Partial<NonNullable<Memoire["memoire"]>>; fiche?: Partial<NonNullable<Memoire["fiche"]>> } = {}): MemoireFaite => {
  const e = Sortie07.parse({ alerte: null, rien_de_neuf: false, niveau: null, questions: null, ...reste, memoire: { ...MEMOIRE, ...m }, fiche: { ...FICHE, ...f } });
  if (!estFaite(e)) throw new Error("fabrique : une mémoire sans mémoire ni fiche");
  return e;
};

/** Une mise à jour de la mémoire (prompt 07, Maj07) : rien ne change, sauf ce que `m` donne. */
export const maj = (m: Partial<Maj> = {}): Maj =>
  Maj07.parse({
    alerte: null,
    rien_de_neuf: false,
    ou_on_en_est: null,
    moments_ajoutes: [],
    son_mode: null,
    ton_mode: null,
    conseils: null,
    a_venir: null,
    faits_ajoutes: [],
    faits_retires: [],
    portrait: null,
    phrase: null,
    phrase_courte: null,
    niveau: null,
    questions: null,
    ...m,
  });

/** Un chapitre du rapport (prompt 05), sans bloc (sauf ce que `autres` change). */
export const chapitre = (numero: number, autres: Partial<Chapitre> = {}): Chapitre => ({ numero, titre: `Chapitre ${numero}`, titre_court: `Ch. ${numero}`, surtitre: null, blocs: [], ...autres });
