import "server-only";
import type { Payeur } from "../budget";
import { cleDeLimiteDuCompte } from "../email-canonique";
import { delaiAppel } from "../echeance";
import { env, iaFactice } from "../env";
import { ErreurTache } from "../erreurs";
import { auMieux, journal, journalErreur } from "../journal";
import { compter, LIMITES, rendre } from "../limites";
import { DUREE_VOCAL_MAX_S, lireAudio, TAILLE_VOCAL_MAX } from "./duree-audio";
import { noterCout } from "./usage";
import { effacerChezLePrestataire, ELEVENLABS, sansConservation, signalerSansIdentifiant } from "./voix";

/*
 * Ses vocaux à BLUSH, transcrits : par ElevenLabs (Scribe), avec la clé de la voix de BLUSH, ou par Mistral (Voxtral,
 * serveurs en Europe) si sa clé est là. BLUSH ne garde pas le son : seule la transcription rejoint le chat (chiffrée).
 * Chez ElevenLabs, la transcription n’est pas gardée non plus : non-conservation demandée quand le compte y a droit,
 * effacée juste après sinon (src/server/ia/voix.ts). Mistral n’offre pas ce réglage par appel.
 * TODO(produit): vérifier la conservation des transcriptions dans les réglages du compte Mistral (et demander la
 * non-conservation), puis le dire sur la page Confidentialité.
 *
 * Un vocal est borné par sa durée (S-15), mesurée ici trame par trame (src/server/ia/duree-audio.ts) : la transcription
 * se paie à la durée, et un fichier très compressé tiendrait des heures dans peu d’octets. Ce qui part est ce qui a été
 * mesuré (un Opus réécrit), et la durée facturée que rend le prestataire est notée et comptée pour le compte.
 */
/**
 * Les deux prestataires, écrits une fois : le modèle, et le prix d’une minute de son transcrite pour le suivi des coûts
 * (Voxtral Mini, 0,001 $ la minute ; Scribe au-delà des heures de l’abonnement, environ 0,40 $ l’heure).
 * TODO(produit): les prix, à vérifier sur les offres prises.
 */
const PRESTATAIRES = {
  mistral: { modele: "voxtral-mini-latest", prixMinute: 0.001 },
  elevenlabs: { modele: "scribe_v1", prixMinute: 0.4 / 60 },
} as const;
const URL_MISTRAL = "https://api.mistral.ai/v1/audio/transcriptions";
/* Le plus long qu’on attend une transcription, si l’échéance de la route le permet (src/server/echeance.ts) */
const DELAI_TRANSCRIPTION_MS = 60_000;

/** Un vocal lu par lireVocal : sa durée mesurée, en secondes, et le fichier qui part à la transcription (réécrit en Opus, ou le MP4 reçu). */
export type VocalLu = { duree: number; fichier: File };

/**
 * Lit un vocal reçu par le chat, avant de le transcrire (src/server/ia/duree-audio.ts) : sa durée et ce qui part chez le
 * prestataire ; « vocal » s’il est trop lourd ou trop long, « vocal_vide » s’il est vide ou illisible (un format qui
 * n’est pas celui d’un enregistreur, un fichier piégé).
 */
export async function lireVocal(vocal: File): Promise<VocalLu | "vocal" | "vocal_vide"> {
  if (!vocal.size) return "vocal_vide";
  if (vocal.size > TAILLE_VOCAL_MAX) return "vocal";
  const lu = lireAudio(new Uint8Array(await vocal.arrayBuffer()));
  if (!lu || lu.secondes <= 0) return "vocal_vide";
  if (lu.secondes > DUREE_VOCAL_MAX_S) return "vocal";
  return { duree: lu.secondes, fichier: new File([lu.octets as Uint8Array<ArrayBuffer>], `vocal.${lu.extension}`, { type: lu.type }) };
}

/**
 * Les secondes de son transcrites pour un compte, par jour (LIMITES.secondesVocalParCompte) : réservées à la durée
 * mesurée avant l’appel, complétées par la durée que le prestataire dit avoir facturée si elle est plus longue (un MP4
 * qui tasserait des trames, voir duree-audio.ts), rendues si l’appel échoue.
 */
const cleDesSecondes = (compte: { email: string }) => cleDeLimiteDuCompte("vocal:secondes", compte.email);

/**
 * La transcription du vocal (lireVocal), ou null si les vocaux ne sont pas encore branchés (ni clé Mistral, ni clé
 * ElevenLabs) ; « trop » si le compte a déjà fait transcrire ses secondes du jour. `storyId`, `payeur` (le budget de
 * l’IA, controlerBudget) et `compte` : pour le suivi des coûts, la dépense du compte et ses secondes du jour.
 */
export async function transcrire(
  { duree, fichier }: VocalLu,
  { storyId, payeur, compte }: { storyId?: string; payeur?: Payeur; compte?: { email: string } } = {},
): Promise<string | null | "trop"> {
  const e = env();
  const prestataire = e.MISTRAL_API_KEY ? "mistral" : e.ELEVENLABS_API_KEY ? "elevenlabs" : null;
  if (!prestataire && !iaFactice()) return null;
  /* Les secondes du jour, comptées aussi par le modèle factice (les tests, le développement) : elles bornent pareil */
  const reservees = Math.ceil(duree);
  if (compte && (await compter(cleDesSecondes(compte), LIMITES.secondesVocalParCompte, reservees)) > LIMITES.secondesVocalParCompte.max) {
    await rendre(cleDesSecondes(compte), reservees);
    return "trop";
  }
  if (iaFactice() || !prestataire) return "bon elle m’a répondu ok pour samedi, mais elle a mis trois heures, je lui dis quoi";
  const { modele, prixMinute } = PRESTATAIRES[prestataire];
  const fd = new FormData();
  const debut = Date.now();
  let r: Response | null;
  /* L’appel qui n’a pas abouti (le réseau, le délai) : son nom et son code iront au journal */
  let panne: unknown;
  const enPanne = (err: unknown) => {
    panne = err;
    return null;
  };
  if (prestataire === "mistral") {
    fd.append("model", modele);
    fd.append("language", "fr");
    fd.append("file", fichier);
    r = await fetch(URL_MISTRAL, {
      method: "POST",
      headers: { authorization: `Bearer ${e.MISTRAL_API_KEY}` },
      body: fd,
      signal: AbortSignal.timeout(delaiAppel(DELAI_TRANSCRIPTION_MS)),
    }).catch(enPanne);
  } else {
    fd.append("model_id", modele);
    fd.append("language_code", "fr");
    /* Le texte seul : pas de « (rires) » ni de qui parle, c’est lui qui parle */
    fd.append("tag_audio_events", "false");
    fd.append("file", fichier);
    const parametres = sansConservation();
    r = await fetch(`${ELEVENLABS}/v1/speech-to-text${parametres ? `?${parametres}` : ""}`, {
      method: "POST",
      headers: { "xi-api-key": e.ELEVENLABS_API_KEY! },
      body: fd,
      signal: AbortSignal.timeout(delaiAppel(DELAI_TRANSCRIPTION_MS)),
    }).catch(enPanne);
  }
  /* Jamais de contenu dans les logs : le statut, ou le nom et le code de la panne */
  if (!r?.ok) {
    if (compte) await auMieux(rendre(cleDesSecondes(compte), reservees), "secondes du vocal non rendues");
    if (r) journal("transcription en échec", { prestataire, statut: r.status }, "erreur");
    else journalErreur("transcription en échec", panne, { prestataire, statut: 0, panne: "reseau" });
    throw new ErreurTache("transcription");
  }
  const corps = (await r.json()) as { text?: string; transcription_id?: string; usage?: { prompt_audio_seconds?: number }; words?: { end?: number }[] };
  if (prestataire === "elevenlabs") {
    /* Ce que Scribe a gardé de la transcription (S-17) : sans son identifiant, rien à effacer, et le journal le dit */
    if (corps.transcription_id) effacerChezLePrestataire(`/v1/speech-to-text/transcripts/${corps.transcription_id}`);
    else signalerSansIdentifiant("transcription");
  }
  /* La durée facturée : celle que dit le prestataire (Mistral : usage ; Scribe : la fin du dernier mot), si elle dépasse la mesure */
  const dite = prestataire === "mistral" ? corps.usage?.prompt_audio_seconds : corps.words?.at(-1)?.end;
  const facturee = Math.max(duree, typeof dite === "number" && Number.isFinite(dite) ? dite : 0);
  if (facturee > duree * 1.1 + 1) journal("transcription plus longue que le vocal mesuré", { prestataire, mesuree: Math.round(duree), facturee: Math.round(facturee) }, "alerte");
  if (compte && Math.ceil(facturee) > reservees)
    await auMieux(compter(cleDesSecondes(compte), LIMITES.secondesVocalParCompte, Math.ceil(facturee) - reservees), "secondes du vocal non comptées");
  await noterCout({ storyId, tache: "vocal_transcription", modele, entree: facturee, micros: (facturee / 60) * prixMinute * 1e6, ms: Date.now() - debut, payeur });
  return corps.text?.trim() ?? "";
}
