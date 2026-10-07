import "server-only";
import { env } from "../env";
import { ErreurTache } from "../erreurs";

/*
 * Ses vocaux à BLUSH, transcrits par Mistral (Voxtral) : une entreprise française, des serveurs en Europe.
 * Le son n’est gardé nulle part : seule la transcription rejoint le chat (chiffrée).
 */
const URL_MISTRAL = "https://api.mistral.ai/v1/audio/transcriptions";
const MODELE = "voxtral-mini-latest";

/** Un vocal de 2 minutes pèse moins d’un mégaoctet : au-delà, ce n’est pas un vocal du chat. */
export const TAILLE_VOCAL_MAX = 4 * 1024 * 1024;

/** L’extension que Mistral attend, d’après le type que le navigateur a enregistré (webm sur Chrome, mp4 sur Safari). */
const extension = (type: string) => (type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "m4a");

/** La transcription du vocal, ou null si les vocaux ne sont pas encore branchés (pas de clé Mistral). */
export async function transcrire(vocal: File): Promise<string | null> {
  const e = env();
  if (e.BLUSH_IA_FACTICE) return "bon elle m’a répondu ok pour samedi, mais elle a mis trois heures, je lui dis quoi";
  if (!e.MISTRAL_API_KEY) return null;
  const fd = new FormData();
  fd.append("model", MODELE);
  fd.append("language", "fr");
  fd.append("file", new File([await vocal.arrayBuffer()], `vocal.${extension(vocal.type)}`, { type: vocal.type || "audio/mp4" }));
  const r = await fetch(URL_MISTRAL, { method: "POST", headers: { authorization: `Bearer ${e.MISTRAL_API_KEY}` }, body: fd, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  /* Jamais de contenu dans les logs : le statut seulement */
  if (!r?.ok) {
    console.error(`transcription : échec ${r?.status ?? "réseau"}`);
    throw new ErreurTache("transcription");
  }
  const { text } = (await r.json()) as { text?: string };
  return text?.trim() ?? "";
}
