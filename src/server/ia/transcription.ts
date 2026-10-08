import "server-only";
import { env } from "../env";
import { ErreurTache } from "../erreurs";

/*
 * Ses vocaux à BLUSH, transcrits : par ElevenLabs (Scribe), avec la clé de la voix de BLUSH, ou par Mistral (Voxtral,
 * serveurs en Europe) si sa clé est là. BLUSH ne garde pas le son : seule la transcription rejoint le chat (chiffrée).
 */
const URL_MISTRAL = "https://api.mistral.ai/v1/audio/transcriptions";
const MODELE_MISTRAL = "voxtral-mini-latest";
const URL_ELEVENLABS = "https://api.elevenlabs.io/v1/speech-to-text";
const MODELE_ELEVENLABS = "scribe_v1";

/** Un vocal de 2 minutes pèse moins d’un mégaoctet : au-delà, ce n’est pas un vocal du chat. */
export const TAILLE_VOCAL_MAX = 4 * 1024 * 1024;

/** L’extension du fichier, d’après le type que le navigateur a enregistré (webm sur Chrome, mp4 sur Safari). */
const extension = (type: string) => (type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "m4a");

/** La transcription du vocal, ou null si les vocaux ne sont pas encore branchés (ni clé Mistral, ni clé ElevenLabs). */
export async function transcrire(vocal: File): Promise<string | null> {
  const e = env();
  if (e.BLUSH_IA_FACTICE) return "bon elle m’a répondu ok pour samedi, mais elle a mis trois heures, je lui dis quoi";
  if (!e.MISTRAL_API_KEY && !e.ELEVENLABS_API_KEY) return null;
  const fichier = new File([await vocal.arrayBuffer()], `vocal.${extension(vocal.type)}`, { type: vocal.type || "audio/mp4" });
  const fd = new FormData();
  let r: Response | null;
  if (e.MISTRAL_API_KEY) {
    fd.append("model", MODELE_MISTRAL);
    fd.append("language", "fr");
    fd.append("file", fichier);
    r = await fetch(URL_MISTRAL, { method: "POST", headers: { authorization: `Bearer ${e.MISTRAL_API_KEY}` }, body: fd, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  } else {
    fd.append("model_id", MODELE_ELEVENLABS);
    fd.append("language_code", "fr");
    /* Le texte seul : pas de « (rires) » ni de qui parle, c’est lui qui parle */
    fd.append("tag_audio_events", "false");
    fd.append("file", fichier);
    r = await fetch(URL_ELEVENLABS, { method: "POST", headers: { "xi-api-key": e.ELEVENLABS_API_KEY! }, body: fd, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  }
  /* Jamais de contenu dans les logs : le statut seulement */
  if (!r?.ok) {
    console.error(`transcription : échec ${r?.status ?? "réseau"}`);
    throw new ErreurTache("transcription");
  }
  const { text } = (await r.json()) as { text?: string };
  return text?.trim() ?? "";
}
