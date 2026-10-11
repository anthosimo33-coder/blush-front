import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { texteDit, type Alignement, type LigneScript } from "@/lib/vocal";
import { db, schema } from "../db";
import type { Voix } from "@/types";
import { cleDeLimiteDuCompte } from "../email-canonique";
import { env } from "../env";
import { delaiAppel, tempsRestant } from "../echeance";
import { journal } from "../journal";
import { compteDe, compter, LIMITES } from "../limites";
import { pause } from "../temps";
import { noterCout } from "./usage";

/*
 * La voix de BLUSH (ElevenLabs) : le seul endroit qui lui parle. Elle reçoit le script du vocal (des prénoms et des
 * morceaux de leur conv : on n’envoie rien d’autre), et rend l’audio avec le temps de chaque caractère.
 *
 * Ce qu’elle peut dire est borné (S-13) : un vocal est coupé à la fin d’une phrase (COUPE_VOIX), un compte a ses
 * caractères du jour (LIMITES.voixParCompte) et tous ensemble ceux du mois (VOIX_PAR_MOIS). Au-delà, la voix ne part
 * pas (ErreurVoix « voix_budget_… ») : la réponse du chat reste écrite, le rapport reste sans vocal.
 *
 * Ce qu’elle garde (S-17) : sans la non-conservation (NON_CONSERVATION), chaque vocal dit laisse un élément dans
 * l’historique du compte du prestataire, effacé juste après (effacerChezLePrestataire). La transcription des vocaux
 * reçus (src/server/ia/transcription.ts) passe par les mêmes réglages.
 */

/* ———— Le prestataire ———— */

/** L’adresse de l’API du prestataire de voix (la voix, et la transcription sans clé Mistral). */
export const ELEVENLABS = "https://api.elevenlabs.io";
const MODELE_VOIX = "eleven_v4";
/** L’étiquette des vocaux dits dans le suivi des coûts (ai_usage.task). */
const ETIQUETTE_VOIX = "vocal_voix";
/* Le prix d’un caractère au tarif de l’abonnement Creator (22 $ pour 121 000 caractères), pour le suivi des coûts */
const PRIX_CARACTERE = 22 / 121_000;
/* Le MP3 à 96 kb/s : la voix reste nette, et un vocal de 30 s pèse environ 360 Ko */
const FORMAT = "mp3_44100_96";
/* Le plus long qu’on attend la voix pour un vocal, et ce qu’il doit rester avant l’échéance pour la lancer */
const DELAI_VOIX_MS = 120_000;
const TEMPS_MIN_VOIX_MS = 15_000;

/**
 * La non-conservation chez le prestataire (`enable_logging=false`, pour la voix comme pour la transcription) : rien
 * n’est gardé de l’appel, pas même dans son historique. Elle est réservée aux comptes Enterprise : sur un autre compte,
 * on efface après coup ce qu’il a gardé (effacerChezLePrestataire).
 * TODO(produit): false tant que le compte du prestataire n’est pas Enterprise ; à passer à true s’il le devient.
 */
const NON_CONSERVATION = false;

/** Ce qu’ajoute la non-conservation aux paramètres d’un appel (`?…&enable_logging=false`), ou rien. */
export const sansConservation = (): string => (NON_CONSERVATION ? "enable_logging=false" : "");

/**
 * Les réglages de la voix (voice_settings) : posée pour le mode sobre ou doux (stabilité plus haute, moins de style),
 * joueuse sinon.
 */
const REGLAGES = {
  posee: { stability: 0.5, similarity_boost: 0.75, style: 0.2 },
  joueuse: { stability: 0, similarity_boost: 0.75, style: 0.6 },
} as const;

/** L’identifiant chez le prestataire d’une des deux voix de l’A/B test (BLUSH_VOIX_A, BLUSH_VOIX_B) ; sans voix B, la A. */
function idDeLaVoix(voix: Voix): string | undefined {
  const e = env();
  return voix === "B" && e.BLUSH_VOIX_B ? e.BLUSH_VOIX_B : e.BLUSH_VOIX_A;
}

/** La voix d’un compte : toujours la même pour un même compte. Sans voix B configurée, tout le monde a la A. */
export function voixPour(cle: string): Voix {
  if (!env().BLUSH_VOIX_B) return "A";
  return createHash("sha256").update(`blush:voix:${cle}`).digest()[0] % 2 === 0 ? "A" : "B";
}

/** Le vocal est-il possible ? Il faut la clé et la voix A ; en mode factice (tests, dev), une voix muette suffit. */
export function voixDisponible(): boolean {
  const e = env();
  return !!(e.ELEVENLABS_API_KEY && e.BLUSH_VOIX_A) || e.BLUSH_IA_FACTICE;
}

/**
 * La voix n’a pas dit le texte : son code (« voix_delai », « voix_429 », « voix_budget_compte »…) part dans les logs,
 * jamais le texte ni la réponse du prestataire. Une erreur interne, comme ErreurTache : le navigateur n’en voit rien (le
 * vocal manque, c’est tout).
 */
export class ErreurVoix extends Error {
  constructor(readonly code: `voix_${string}`) {
    /* Le message est le code : les logs du chat et du rapport le lisent (e.message), jamais rien d’autre */
    super(code);
    this.name = "ErreurVoix";
  }
}

/* ———— Ce que la voix peut dire (S-13) ———— */

/**
 * La coupe d’un vocal, en caractères envoyés à la voix : une réponse du chat (la coupe par défaut de dire), le vocal du
 * rapport (src/server/vocal.ts). TODO(produit): 400 et 700, environ 25 et 45 secondes de voix.
 */
export const COUPE_VOIX = { chat: 400, rapport: 700 } as const;

/**
 * Les caractères que la voix dit pour tous, par mois (de Paris) : la somme des vocaux du mois dans le suivi des coûts.
 * TODO(produit): 100 000, sous les 121 000 de l’abonnement Creator du prestataire, à caler sur l’offre prise.
 */
export const VOIX_PAR_MOIS = 100_000;

/** Le premier jour du mois à Paris, à minuit, en SQL : le début du plafond du mois. */
const DEBUT_DU_MOIS = sql`(date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;

/* La fin d’une phrase : sa ponctuation (avec le guillemet ou la parenthèse qui la ferme), suivie d’un blanc ou de la fin */
const FIN_DE_PHRASE = /[.!?…]+(?:\u00a0?[»”)])*(?=\s|$)/g;
/* Un jeu ([rires], [soupire]) laissé en fin de texte, entier ou coupé */
const JEU_FINAL = /\s*\[[^\]]*\]?\s*$/;

/**
 * Le texte coupé à `max` caractères au plus : à la fin de sa dernière phrase entière, si elle en garde au moins la
 * moitié ; sinon au dernier mot, suivi de « … ». Un jeu laissé en fin de texte part (la voix le jouerait sur rien).
 */
export function couper(texte: string, max: number): string {
  const t = texte.trim();
  if (t.length <= max) return t;
  let fin = 0;
  for (const m of t.matchAll(FIN_DE_PHRASE)) {
    const bout = m.index + m[0].length;
    if (bout > max) break;
    fin = bout;
  }
  if (fin >= max / 2) return t.slice(0, fin).replace(JEU_FINAL, "");
  const avant = t.slice(0, max - 1);
  const mot = avant.search(/\s\S*$/);
  return `${(mot > 0 ? avant.slice(0, mot) : avant).replace(JEU_FINAL, "").trimEnd()}…`;
}

/**
 * Les lignes d’un script qui tiennent dans `max` caractères dits (texteDit) : les suivantes partent, pour que les
 * sous-titres suivent l’audio ligne pour ligne. Une première ligne trop longue à elle seule est coupée (couper).
 */
export function scriptQuiTient<L extends LigneScript>(lignes: L[], max: number): L[] {
  for (let n = lignes.length; n > 0; n--) if (texteDit(lignes.slice(0, n)).texte.length <= max) return lignes.slice(0, n);
  if (!lignes.length) return [];
  const [premiere] = lignes;
  const jeu = texteDit([{ ...premiere, texte: "" }]).texte.length;
  return [{ ...premiere, texte: couper(premiere.texte.replace(/\[[^\]]*\]/g, ""), Math.max(1, max - jeu)) }];
}

/** Le compte d’une conv (son email), pour ses caractères du jour ; null sans conv ou sans compte. */
async function compteDeLaConv(storyId: string | undefined): Promise<string | null> {
  if (!storyId) return null;
  const [l] = await db().select({ email: schema.users.email }).from(schema.stories).innerJoin(schema.users, eq(schema.users.id, schema.stories.userId)).where(eq(schema.stories.id, storyId));
  return l?.email ?? null;
}

/** Les caractères dits ce mois-ci, pour tous (les vocaux notés dans le suivi des coûts, ceux des convs effacées compris). */
async function ditCeMois(): Promise<number> {
  const [l] = await db()
    .select({ n: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}), 0)`.mapWith(Number) })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.task, ETIQUETTE_VOIX), gte(schema.aiUsage.createdAt, DEBUT_DU_MOIS)));
  return l?.n ?? 0;
}

/** La voix peut-elle dire `longueur` caractères de plus, pour ce compte aujourd’hui et pour tous ce mois-ci ? Sinon, ErreurVoix. */
async function controlerVoix(longueur: number, email: string | null): Promise<void> {
  if (email && (await compteDe(cleDeLimiteDuCompte("voix", email), LIMITES.voixParCompte)) + longueur > LIMITES.voixParCompte.max) throw new ErreurVoix("voix_budget_compte");
  if ((await ditCeMois()) + longueur > VOIX_PAR_MOIS) {
    journal("plafond du mois de la voix atteint", { plafond: VOIX_PAR_MOIS }, "alerte");
    throw new ErreurVoix("voix_budget_mois");
  }
}

/* ———— Dire ———— */

/**
 * Fait dire le texte par la voix, coupé à `max` caractères (couper ; par défaut, la coupe du chat). Le mode sobre est
 * joué plus posé. Au-delà du budget de la voix, rien ne part (ErreurVoix « voix_budget_… »). Une erreur passagère (trop
 * de requêtes en même temps, une panne) est réessayée deux fois. Ce que le prestataire en garde est effacé ensuite.
 */
export async function dire(
  texte: string,
  voix: Voix,
  { sobre, storyId, max = COUPE_VOIX.chat }: { sobre: boolean; storyId?: string; max?: number },
): Promise<{ audio: Buffer; alignement: Alignement }> {
  const e = env();
  const dit = couper(texte, max);
  if (!dit) throw new ErreurVoix("voix_vide");
  const email = await compteDeLaConv(storyId);
  await controlerVoix(dit.length, email);
  const rendu = e.ELEVENLABS_API_KEY ? await direChezLePrestataire(dit, voix, sobre, storyId) : muette(dit);
  if (email) await compter(cleDeLimiteDuCompte("voix", email), LIMITES.voixParCompte, dit.length);
  return rendu;
}

async function direChezLePrestataire(texte: string, voix: Voix, sobre: boolean, storyId: string | undefined): Promise<{ audio: Buffer; alignement: Alignement }> {
  const cle = env().ELEVENLABS_API_KEY!;
  const id = idDeLaVoix(voix);
  if (!id) throw new ErreurVoix("voix_absente");
  const parametres = [`output_format=${FORMAT}`, sansConservation()].filter(Boolean).join("&");
  const debut = Date.now();
  for (let essai = 0; ; essai++) {
    /* Plus le temps avant l’échéance de la fonction : la voix ne part pas (le rapport, lui, est gardé ; la réponse du chat reste écrite) */
    if (tempsRestant() < TEMPS_MIN_VOIX_MS) throw new ErreurVoix("voix_delai");
    const r = await fetch(`${ELEVENLABS}/v1/text-to-speech/${encodeURIComponent(id)}/with-timestamps?${parametres}`, {
      method: "POST",
      headers: { "xi-api-key": cle, "content-type": "application/json" },
      body: JSON.stringify({ text: texte, model_id: MODELE_VOIX, voice_settings: sobre ? REGLAGES.posee : REGLAGES.joueuse }),
      signal: AbortSignal.timeout(delaiAppel(DELAI_VOIX_MS, 3_000)),
    }).catch(() => null);
    if (r?.ok) {
      /* L’élément d’historique de ce vocal (S-17) : absent quand rien n’est gardé */
      const element = r.headers.get("history-item-id");
      if (element) effacerChezLePrestataire(`/v1/history/${element}`);
      const corps = (await r.json()) as { audio_base64: string; alignment?: Alignement; normalized_alignment?: Alignement };
      const alignement = corps.alignment ?? corps.normalized_alignment;
      if (!alignement) throw new ErreurVoix("voix_sans_alignement");
      await noterCout({ storyId, tache: ETIQUETTE_VOIX, modele: MODELE_VOIX, sortie: texte.length, micros: texte.length * PRIX_CARACTERE * 1e6, ms: Date.now() - debut });
      return { audio: Buffer.from(corps.audio_base64, "base64"), alignement };
    }
    /* Jamais le corps de l’erreur dans les logs : il peut reprendre le texte */
    const statut = r?.status ?? 0;
    if (essai >= 2 || (statut >= 400 && statut < 500 && statut !== 429)) throw new ErreurVoix(`voix_${statut || "reseau"}`);
    await pause(2000 * (essai + 1));
  }
}

/* ———— Ce que le prestataire garde (S-17) ———— */

/* Un identifiant rendu par le prestataire : il entre dans une adresse, rien d’autre n’y passe */
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * Les attentes avant chaque essai d’effacement : un élément d’historique peut mettre un instant à apparaître (404), un
 * prestataire débordé répond 429 ou 5xx.
 */
const ESSAIS_EFFACEMENT_MS = [0, 2_000, 6_000];
const DELAI_EFFACEMENT_MS = 10_000;

/**
 * Efface chez le prestataire ce qu’il a gardé d’un appel : `chemin` (« /v1/history/<id> » pour un vocal dit,
 * « /v1/speech-to-text/transcripts/<id> » pour une transcription). Ne retient pas la réponse : l’effacement court après
 * elle (after), et un échec laisse une ligne au journal (son statut, jamais l’identifiant).
 */
export function effacerChezLePrestataire(chemin: string): void {
  const cle = env().ELEVENLABS_API_KEY;
  const id = chemin.slice(chemin.lastIndexOf("/") + 1);
  if (!cle || !IDENTIFIANT.test(id)) return;
  const travail = effacer(chemin, cle);
  try {
    after(() => travail);
  } catch {
    /* Hors d’une requête (un script) : l’effacement court seul */
  }
}

async function effacer(chemin: string, cle: string): Promise<void> {
  let statut = 0;
  for (const attente of ESSAIS_EFFACEMENT_MS) {
    if (attente) await pause(attente);
    const r = await fetch(`${ELEVENLABS}${chemin}`, { method: "DELETE", headers: { "xi-api-key": cle }, signal: AbortSignal.timeout(DELAI_EFFACEMENT_MS) }).catch(() => null);
    if (r?.ok) return;
    statut = r?.status ?? 0;
    if (statut && statut !== 404 && statut !== 429 && statut < 500) break;
  }
  journal("prestataire de voix : rien d’effacé", { quoi: chemin.split("/")[2] ?? "", statut }, "alerte");
}

/* ———— La voix muette (mode factice) : un vrai MP3 de silence, à la durée du texte ———— */

/* Une trame MP3 de silence (MPEG-1 couche III, 48 kHz, 32 kb/s, mono) : 24 ms, 96 octets, sans en-tête */
const TRAME_SILENCE = Buffer.from(
  "//sUxNoDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  "base64",
);
const CARACTERE_S = 0.055;

function muette(texte: string): { audio: Buffer; alignement: Alignement } {
  const chars = [...texte];
  const duree = chars.length * CARACTERE_S + 0.3;
  const audio = Buffer.concat(Array.from({ length: Math.ceil(duree / 0.024) }, () => TRAME_SILENCE));
  return {
    audio,
    alignement: {
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => Math.round(i * CARACTERE_S * 1000) / 1000),
      character_end_times_seconds: chars.map((_, i) => Math.round((i + 1) * CARACTERE_S * 1000) / 1000),
    },
  };
}
