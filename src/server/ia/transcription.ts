import "server-only";
import { extensionAudio } from "@/lib/limites";
import { delaiAppel } from "../echeance";
import { env } from "../env";
import { ErreurTache } from "../erreurs";
import { dureeAudio } from "./duree-audio";
import { noterCout } from "./usage";
import { effacerChezLePrestataire, ELEVENLABS, sansConservation } from "./voix";

/*
 * Ses vocaux à BLUSH, transcrits : par ElevenLabs (Scribe), avec la clé de la voix de BLUSH, ou par Mistral (Voxtral,
 * serveurs en Europe) si sa clé est là. BLUSH ne garde pas le son : seule la transcription rejoint le chat (chiffrée).
 * Chez ElevenLabs, la transcription n’est pas gardée non plus : non-conservation demandée quand le compte y a droit,
 * effacée juste après sinon (src/server/ia/voix.ts). Mistral n’offre pas ce réglage par appel.
 * TODO(produit): vérifier la conservation des transcriptions dans les réglages du compte Mistral (et demander la
 * non-conservation), puis le dire sur la page Confidentialité.
 *
 * Un vocal est borné par sa durée (S-15), mesurée ici trame par trame (src/server/ia/duree-audio.ts) : la transcription
 * se paie à la durée, et un fichier très compressé tiendrait des heures dans peu d’octets.
 */
const URL_MISTRAL = "https://api.mistral.ai/v1/audio/transcriptions";
const MODELE_MISTRAL = "voxtral-mini-latest";
const MODELE_ELEVENLABS = "scribe_v1";
/* Le plus long qu’on attend une transcription, si l’échéance de la route le permet (src/server/echeance.ts) */
const DELAI_TRANSCRIPTION_MS = 60_000;
/**
 * Le prix d’une minute de son transcrite, pour le suivi des coûts : Voxtral Mini (0,001 $ la minute), Scribe au-delà
 * des heures de l’abonnement (environ 0,40 $ l’heure). TODO(produit): à vérifier sur les offres prises.
 */
const PRIX_MINUTE = { mistral: 0.001, elevenlabs: 0.4 / 60 } as const;

/**
 * Le plus long vocal que le chat accepte, en secondes : le navigateur l’envoie tout seul à 120 s (src/app/app/voice.tsx),
 * 10 s de marge pour l’enveloppe et l’arrondi. TODO(produit): 130 s.
 */
export const DUREE_VOCAL_MAX_S = 130;
/**
 * Le débit d’un enregistreur qui ne suit pas les 32 kb/s demandés (le WebKit de Playwright ne les suit pas, 3c l’a
 * mesuré) : celui qu’il prend par défaut, au plus 192 kb/s.
 */
const DEBIT_PAR_DEFAUT = 192_000;
/**
 * La taille maximale d’un vocal : DUREE_VOCAL_MAX_S au débit par défaut (environ 3,1 Mo), plus 64 Ko pour l’enveloppe du
 * fichier. La vraie borne est la durée ; celle-ci refuse vite un envoi démesuré, avant de le lire.
 * TODO(produit): ne pas descendre plus bas avant d’avoir mesuré le débit d’un vocal de 2 minutes sur un vrai iPhone
 * (Safari et l’appli installée) ; tests/e2e/chat-vocal.spec.ts mesure le débit des deux navigateurs de test.
 */
export const TAILLE_VOCAL_MAX = (DUREE_VOCAL_MAX_S * DEBIT_PAR_DEFAUT) / 8 + 64 * 1024;

/**
 * Lit un vocal reçu par le chat, avant de le transcrire : sa durée en secondes ; « vocal » s’il est trop lourd ou trop
 * long, « vocal_vide » s’il est vide ou illisible (un format qui n’est pas celui d’un enregistreur, un fichier piégé).
 */
export async function lireVocal(vocal: File): Promise<{ duree: number } | "vocal" | "vocal_vide"> {
  if (!vocal.size) return "vocal_vide";
  if (vocal.size > TAILLE_VOCAL_MAX) return "vocal";
  const duree = dureeAudio(new Uint8Array(await vocal.arrayBuffer()));
  if (duree === null || duree <= 0) return "vocal_vide";
  return duree > DUREE_VOCAL_MAX_S ? "vocal" : { duree };
}

/**
 * La transcription du vocal, ou null si les vocaux ne sont pas encore branchés (ni clé Mistral, ni clé ElevenLabs).
 * `storyId` et `duree` (lireVocal) : la conv du chat et la durée du son, pour le suivi des coûts.
 */
export async function transcrire(vocal: File, { storyId, duree = 0 }: { storyId?: string; duree?: number } = {}): Promise<string | null> {
  const e = env();
  if (e.BLUSH_IA_FACTICE) return "bon elle m’a répondu ok pour samedi, mais elle a mis trois heures, je lui dis quoi";
  if (!e.MISTRAL_API_KEY && !e.ELEVENLABS_API_KEY) return null;
  const fichier = new File([await vocal.arrayBuffer()], `vocal.${extensionAudio(vocal.type)}`, { type: vocal.type || "audio/mp4" });
  const fd = new FormData();
  const debut = Date.now();
  let r: Response | null;
  if (e.MISTRAL_API_KEY) {
    fd.append("model", MODELE_MISTRAL);
    fd.append("language", "fr");
    fd.append("file", fichier);
    r = await fetch(URL_MISTRAL, { method: "POST", headers: { authorization: `Bearer ${e.MISTRAL_API_KEY}` }, body: fd, signal: AbortSignal.timeout(delaiAppel(DELAI_TRANSCRIPTION_MS)) }).catch(() => null);
  } else {
    fd.append("model_id", MODELE_ELEVENLABS);
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
    }).catch(() => null);
  }
  /* Jamais de contenu dans les logs : le statut seulement */
  if (!r?.ok) {
    console.error(`transcription : échec ${r?.status ?? "réseau"}`);
    throw new ErreurTache("transcription");
  }
  const { text, transcription_id } = (await r.json()) as { text?: string; transcription_id?: string };
  /* Ce que Scribe a gardé de la transcription (S-17) : absent quand rien n’est gardé */
  if (!e.MISTRAL_API_KEY && transcription_id) effacerChezLePrestataire(`/v1/speech-to-text/transcripts/${transcription_id}`);
  const minutes = duree / 60;
  await noterCout({
    storyId,
    tache: "vocal_transcription",
    modele: e.MISTRAL_API_KEY ? MODELE_MISTRAL : MODELE_ELEVENLABS,
    entree: duree,
    micros: minutes * (e.MISTRAL_API_KEY ? PRIX_MINUTE.mistral : PRIX_MINUTE.elevenlabs) * 1e6,
    ms: Date.now() - debut,
  });
  return text?.trim() ?? "";
}
