import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { texteDit, type Alignement, type LigneScript } from "@/lib/vocal";
import type { Voix } from "@/types";
import { alerter } from "../alertes";
import { payeurDe, type Payeur } from "../budget";
import { cleDeLimiteDeLaCle } from "../email-canonique";
import { env, iaFactice } from "../env";
import { delaiAppel, tempsRestant } from "../echeance";
import { auMieux, journal } from "../journal";
import { compteDe, compter, LIMITES, rendre, sousLaLimite } from "../limites";
import { aujourdhuiParis, pause } from "../temps";
import { noterCout } from "./usage";

/*
 * La voix de BLUSH (ElevenLabs) : le seul endroit qui lui parle. Elle reçoit le script du vocal (des prénoms et des
 * morceaux de leur conv : on n’envoie rien d’autre), et rend l’audio avec le temps de chaque caractère.
 *
 * Ce qu’elle peut dire est borné (S-13) : un vocal est coupé à la fin d’une phrase (COUPE_VOIX), un compte a ses
 * caractères du jour (LIMITES.voixParCompte, dont le chat laisse au rapport de quoi dire son vocal) et tous ensemble
 * ceux du mois (VOIX_PAR_MOIS, prévenu à 80 % puis atteint). Ils sont réservés avant l’appel, d’un coup (compter), et
 * rendus si rien n’a été facturé. Au-delà, la voix ne part pas (ErreurVoix « voix_budget_… ») : la réponse du chat reste
 * écrite ; le vocal du rapport attend, sans écrire son script (voixBloquee), et repart après minuit. Ce qu’elle coûte
 * compte dans le budget de l’IA du compte (src/server/budget.ts).
 *
 * Ce qu’elle garde (S-17) : sans la non-conservation (NON_CONSERVATION), chaque vocal dit laisse un élément dans
 * l’historique du compte du prestataire, effacé juste après (effacerChezLePrestataire) ; un vocal rendu sans son
 * identifiant le dit au journal (signalerSansIdentifiant). La transcription des vocaux reçus
 * (src/server/ia/transcription.ts) passe par les mêmes réglages.
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

/** Le nom de chaque voix de l’A/B test dans la bibliothèque du prestataire, pour l’équipe (le résumé de la nuit, src/server/veille.ts). */
export const NOMS_VOIX: Record<Voix, string> = { A: "E2", B: "L2, Harmonie" };

/** L’identifiant chez le prestataire d’une des deux voix de l’A/B test (BLUSH_VOIX_A, BLUSH_VOIX_B) ; sans voix B, la A. */
function idDeLaVoix(voix: Voix): string | undefined {
  const e = env();
  return voix === "B" && e.BLUSH_VOIX_B ? e.BLUSH_VOIX_B : e.BLUSH_VOIX_A;
}

/** La voix d’un compte : toujours la même pour un même compte. Sans voix B configurée, tout le monde a la A. */
export function voixPour(cle: string): Voix {
  if (!env().BLUSH_VOIX_B) return "A";
  return createHash("sha256").update(`blush:voix:${cle}`).digest().readUInt8(0) % 2 === 0 ? "A" : "B";
}

/** Le vocal est-il possible ? Il faut la clé et la voix A ; en mode factice (tests, dev), une voix muette suffit. */
export function voixDisponible(): boolean {
  const e = env();
  return iaFactice() || !!(e.ELEVENLABS_API_KEY && e.BLUSH_VOIX_A);
}

/**
 * La voix n’a pas dit le texte : son code (« voix_delai », « voix_429 », « voix_budget_compte »…) part dans les logs,
 * jamais le texte ni la réponse du prestataire. Une erreur interne, comme ErreurTache : le navigateur n’en voit rien (le
 * vocal manque, c’est tout).
 */
export class ErreurVoix extends Error {
  constructor(readonly code: `voix_${string}`) {
    /* Le message est le code ; le journal du chat et du rapport n’en lit que `code` (journalErreur), jamais le message */
    super(code);
    this.name = "ErreurVoix";
  }
}

/* ———— Ce que la voix peut dire (S-13) ———— */

/**
 * La coupe d’un vocal, en caractères envoyés à la voix : une réponse du chat (la coupe par défaut de dire), le vocal du
 * rapport (src/server/vocal.ts) : environ 25 et 45 secondes de voix.
 */
export const COUPE_VOIX = { chat: 400, rapport: 700 } as const;

/** Ce que la voix dit : une réponse du chat, ou le vocal du rapport. */
type UsageVoix = keyof typeof COUPE_VOIX;

/**
 * Les caractères que la voix dit pour tous, par mois (de Paris), comptés dans rate_limits (« voix:mois:AAAA-MM ») : sous
 * les 121 000 de l’abonnement Creator du prestataire, à caler sur l’offre prise.
 */
export const VOIX_PAR_MOIS = 100_000;
/** L’équipe est prévenue quand le mois passe 80 % de VOIX_PAR_MOIS, puis quand il est atteint : une fois chacun. */
const SEUIL_DU_MOIS = 0.8;
/**
 * La fenêtre du compteur du mois. Sa clé porte le nom du mois : un nouveau mois, une nouvelle clé. La fenêtre, plus
 * longue que le plus long des mois, la garde d’ici là : la purge n’efface une clé qu’après la fin de sa fenêtre
 * (rate_limits.expires_at), puis fait place nette.
 */
export const FENETRE_DU_MOIS = { fenetreS: 40 * 86400 };

/** La clé du compteur du mois en cours (de Paris), dans rate_limits. */
export const cleDuMoisDeLaVoix = (mois = aujourdhuiParis().iso.slice(0, 7)) => `voix:mois:${mois}`;

/**
 * Les caractères du jour d’un compte pour cet usage : le chat s’arrête avant, en laissant au vocal du rapport sa coupe
 * entière (COUPE_VOIX.rapport : 700 caractères pris sur les 6 000 du jour).
 */
const plafondDuCompte = (pour: UsageVoix) => LIMITES.voixParCompte.max - (pour === "chat" ? COUPE_VOIX.rapport : 0);

/**
 * La voix pourrait-elle dire, pour cette conv, un vocal entier de cet usage (sa coupe) ? Sans rien compter : le vocal
 * du rapport le demande avant d’écrire son script (src/server/analyse.ts), qui ne serait pas dit. Rend le code qui le
 * bloque, ou null.
 */
export async function voixBloquee(storyId: string, pour: UsageVoix): Promise<"voix_budget_compte" | "voix_budget_mois" | null> {
  const payeur = await payeurDe(storyId);
  const longueur = COUPE_VOIX[pour];
  if (payeur && (await compteDe(cleDeLimiteDeLaCle("voix", payeur), LIMITES.voixParCompte)) + longueur > plafondDuCompte(pour)) return "voix_budget_compte";
  if ((await compteDe(cleDuMoisDeLaVoix(), FENETRE_DU_MOIS)) + longueur > VOIX_PAR_MOIS) return "voix_budget_mois";
  return null;
}

/**
 * Réserve `longueur` caractères pour ce payeur aujourd’hui et pour tous ce mois-ci, d’un coup (deux appels en même
 * temps ne dépassent pas ensemble), ou lève ErreurVoix sans rien garder. Rend de quoi les rendre : `tout`, si rien n’a
 * été facturé ; `mois`, pour la voix muette (le compte du jour compte ce qu’elle dit, le mois ne compte que le facturé).
 */
async function reserver(longueur: number, payeur: Payeur, pour: UsageVoix): Promise<{ tout: () => Promise<void>; mois: () => Promise<void> }> {
  const cleMois = cleDuMoisDeLaVoix();
  const cleCompte = payeur ? cleDeLimiteDeLaCle("voix", payeur) : null;
  if (cleCompte && (await compter(cleCompte, LIMITES.voixParCompte, longueur)) > plafondDuCompte(pour)) {
    await rendre(cleCompte, longueur);
    throw new ErreurVoix("voix_budget_compte");
  }
  const mois = () => rendre(cleMois, longueur);
  const tout = async () => {
    await mois();
    if (cleCompte) await rendre(cleCompte, longueur);
  };
  const dansLeMois = await compter(cleMois, FENETRE_DU_MOIS, longueur);
  if (dansLeMois > VOIX_PAR_MOIS) {
    await tout();
    await prevenirDuMois(cleMois, 1);
    throw new ErreurVoix("voix_budget_mois");
  }
  if (dansLeMois >= SEUIL_DU_MOIS * VOIX_PAR_MOIS && dansLeMois - longueur < SEUIL_DU_MOIS * VOIX_PAR_MOIS) await prevenirDuMois(cleMois, SEUIL_DU_MOIS);
  return { tout, mois };
}

/** Prévient l’équipe que la voix du mois a passé ce seuil : une fois par seuil et par mois, pour toutes les instances. */
async function prevenirDuMois(cleMois: string, seuil: number): Promise<void> {
  await auMieux(async () => {
    if (!(await sousLaLimite(`${cleMois}:alerte:${seuil}`, { max: 1, fenetreS: FENETRE_DU_MOIS.fenetreS }))) return;
    await alerter(
      seuil >= 1 ? "voix du mois atteinte" : `voix : ${Math.round(seuil * 100)} % du mois`,
      [
        `Caractères dits ce mois-ci : au moins ${Math.round(seuil * VOIX_PAR_MOIS)} sur ${VOIX_PAR_MOIS}.`,
        seuil >= 1 ? "Le chat répond par écrit et les rapports attendent leur vocal jusqu’au mois prochain." : "Au-delà, plus aucun vocal jusqu’au mois prochain.",
      ],
      { importante: seuil >= 1 },
    );
  }, "alerte de la voix du mois");
}

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
  const [premiere] = lignes;
  if (!premiere) return [];
  const jeu = texteDit([{ ...premiere, texte: "" }]).texte.length;
  return [{ ...premiere, texte: couper(premiere.texte.replace(/\[[^\]]*\]/g, ""), Math.max(1, max - jeu)) }];
}

/* ———— Dire ———— */

/**
 * Fait dire le texte par la voix, coupé pour son usage (couper ; par défaut, une réponse du chat). Le mode sobre est
 * joué plus posé. Au-delà du budget de la voix, rien ne part (ErreurVoix « voix_budget_… »). Une erreur passagère (trop
 * de requêtes en même temps, une panne) est réessayée deux fois. Ce que le prestataire en garde est effacé ensuite.
 * En mode factice (iaFactice), une voix muette ; sans lui et sans clé, rien ne part (ErreurVoix « voix_absente » :
 * voixDisponible le dit avant).
 */
export async function dire(
  texte: string,
  voix: Voix,
  { sobre, storyId, pour = "chat" }: { sobre: boolean; storyId?: string; pour?: UsageVoix },
): Promise<{ audio: Buffer; alignement: Alignement }> {
  const dit = couper(texte, COUPE_VOIX[pour]);
  if (!dit) throw new ErreurVoix("voix_vide");
  if (!iaFactice() && !env().ELEVENLABS_API_KEY) throw new ErreurVoix("voix_absente");
  const payeur = await payeurDe(storyId);
  const reserve = await reserver(dit.length, payeur, pour);
  if (iaFactice()) {
    await reserve.mois();
    return muette(dit);
  }
  let facture = false;
  try {
    return await direChezLePrestataire(dit, voix, sobre, { storyId, payeur, facture: () => void (facture = true) });
  } catch (err) {
    /* Rien de facturé (un refus, une panne, le délai) : les caractères sont rendus */
    if (!facture) await auMieux(reserve.tout(), "caractères de la voix non rendus");
    throw err;
  }
}

async function direChezLePrestataire(
  texte: string,
  voix: Voix,
  sobre: boolean,
  { storyId, payeur, facture }: { storyId?: string; payeur: Payeur; facture: () => void },
): Promise<{ audio: Buffer; alignement: Alignement }> {
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
      /* Facturé dès la réponse : noté avant de la lire, une réponse illisible coûte aussi */
      facture();
      await noterCout({
        storyId,
        tache: ETIQUETTE_VOIX,
        modele: MODELE_VOIX,
        sortie: texte.length,
        micros: texte.length * PRIX_CARACTERE * 1e6,
        ms: Date.now() - debut,
        payeur: payeur ?? undefined,
      });
      /* L’élément d’historique de ce vocal (S-17) : sans lui, rien à effacer, et le journal le dit */
      const element = r.headers.get("history-item-id");
      if (element) effacerChezLePrestataire(`/v1/history/${element}`);
      else signalerSansIdentifiant("voix");
      const corps = (await r.json()) as { audio_base64: string; alignment?: Alignement; normalized_alignment?: Alignement };
      const alignement = corps.alignment ?? corps.normalized_alignment;
      if (!alignement) throw new ErreurVoix("voix_sans_alignement");
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

/* Le dernier jour où chaque appel sans identifiant a été dit au journal (par instance) */
const SANS_IDENTIFIANT = new Map<string, string>();

/**
 * Un appel réussi sans l’identifiant de ce que le prestataire en garde (l’en-tête « history-item-id » de la voix, le
 * `transcription_id` de la transcription) : rien ne sera effacé. Sans la non-conservation, c’est une fuite à voir :
 * une ligne d’alerte au journal, une fois par jour et par instance. `quoi` : « voix » ou « transcription ».
 * TODO(produit): vérifier sur un vrai appel que l’identifiant arrive (curl -i sur le compte du prestataire) ; sinon,
 * balayer l’historique (GET puis DELETE /v1/history), voir restant.json.
 */
export function signalerSansIdentifiant(quoi: "voix" | "transcription"): void {
  if (NON_CONSERVATION) return;
  const jour = aujourdhuiParis().iso;
  if (SANS_IDENTIFIANT.get(quoi) === jour) return;
  SANS_IDENTIFIANT.set(quoi, jour);
  journal("prestataire de voix : rien à effacer, sans identifiant", { quoi }, "alerte");
}

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

/**
 * Les essais d’effacement. Au bout : 404 (jamais gardé, ou déjà effacé) n’est pas une fuite, une ligne d’information ;
 * 401 ou 403, la clé n’a pas le droit d’effacer (une alerte à part, à régler sur le compte) ; le reste (429, 5xx, le
 * réseau) après les trois essais, une alerte. Le statut seulement, jamais l’identifiant.
 */
async function effacer(chemin: string, cle: string): Promise<void> {
  let statut = 0;
  for (const attente of ESSAIS_EFFACEMENT_MS) {
    if (attente) await pause(attente);
    const r = await fetch(`${ELEVENLABS}${chemin}`, { method: "DELETE", headers: { "xi-api-key": cle }, signal: AbortSignal.timeout(DELAI_EFFACEMENT_MS) }).catch(() => null);
    if (r?.ok) return;
    statut = r?.status ?? 0;
    if (statut && statut !== 404 && statut !== 429 && statut < 500) break;
  }
  const quoi = chemin.split("/")[2] ?? "";
  if (statut === 404) journal("prestataire de voix : rien de gardé à effacer", { quoi }, "info");
  else if (statut === 401 || statut === 403) journal("prestataire de voix : clé sans droit d’effacement", { quoi, statut }, "alerte");
  else journal("prestataire de voix : rien d’effacé", { quoi, statut }, "alerte");
}

/* ———— La voix muette (mode factice) : un vrai MP3 de silence, à la durée du texte ———— */

/* Une trame MP3 de silence (MPEG-1 couche III, 48 kHz, 32 kb/s, mono) : 24 ms, 96 octets, sans en-tête */
const TRAME_SILENCE = Buffer.from("//sUxNoDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV", "base64");
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
