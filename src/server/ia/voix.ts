import "server-only";
import { createHash } from "node:crypto";
import type { Alignement } from "@/lib/vocal";
import { db, schema } from "../db";
import { env } from "../env";
import { delaiAppel, tempsRestant } from "../echeance";

/*
 * La voix de BLUSH (ElevenLabs) : le seul endroit qui lui parle. Elle reçoit le script du vocal (des prénoms et des
 * morceaux de leur conv : on n’envoie rien d’autre), et rend l’audio avec le temps de chaque caractère.
 */
const MODELE_VOIX = "eleven_v4";
const API = "https://api.elevenlabs.io";
/* Le prix d’un caractère au tarif de l’abonnement Creator (22 $ pour 121 000 caractères), pour le suivi des coûts */
const PRIX_CARACTERE = 22 / 121_000;
/* Le MP3 à 96 kb/s : la voix reste nette, et un vocal de 30 s pèse environ 360 Ko */
const FORMAT = "mp3_44100_96";

/** Les deux voix de l’A/B test : A (E2, créée pour BLUSH) et B (L2, Harmonie, de la bibliothèque ElevenLabs). */
export type Voix = "A" | "B";

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

export class ErreurVoix extends Error {}

/**
 * Fait dire le texte par la voix. Le mode sobre est joué plus posé (stabilité plus haute, moins de style).
 * Une erreur passagère (trop de requêtes en même temps, une panne) est réessayée deux fois.
 */
export async function dire(texte: string, voix: Voix, { sobre, storyId }: { sobre: boolean; storyId?: string }): Promise<{ audio: Buffer; alignement: Alignement }> {
  const e = env();
  if (!e.ELEVENLABS_API_KEY) return muette(texte);
  const id = voix === "B" && e.BLUSH_VOIX_B ? e.BLUSH_VOIX_B : e.BLUSH_VOIX_A;
  if (!id) throw new ErreurVoix("voix_absente");
  const debut = Date.now();
  for (let essai = 0; ; essai++) {
    /* Plus le temps avant l’échéance de la fonction : la voix ne part pas (le rapport, lui, est gardé ; la réponse du chat reste écrite) */
    if (tempsRestant() < 15_000) throw new ErreurVoix("voix_delai");
    const r = await fetch(`${API}/v1/text-to-speech/${id}/with-timestamps?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": e.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        text: texte,
        model_id: MODELE_VOIX,
        voice_settings: sobre ? { stability: 0.5, similarity_boost: 0.75, style: 0.2 } : { stability: 0, similarity_boost: 0.75, style: 0.6 },
      }),
      signal: AbortSignal.timeout(delaiAppel(120_000, 3_000)),
    }).catch(() => null);
    if (r?.ok) {
      const corps = (await r.json()) as { audio_base64: string; alignment?: Alignement; normalized_alignment?: Alignement };
      const alignement = corps.alignment ?? corps.normalized_alignment;
      if (!alignement) throw new ErreurVoix("voix_sans_alignement");
      await db()
        .insert(schema.aiUsage)
        .values({ storyId: storyId ?? null, task: "vocal_voix", model: MODELE_VOIX, outputTokens: texte.length, costMicros: Math.round(texte.length * PRIX_CARACTERE * 1e6), ms: Date.now() - debut })
        .catch(() => {});
      return { audio: Buffer.from(corps.audio_base64, "base64"), alignement };
    }
    /* Jamais le corps de l’erreur dans les logs : il peut reprendre le texte */
    const statut = r?.status ?? 0;
    if (essai >= 2 || (statut >= 400 && statut < 500 && statut !== 429)) throw new ErreurVoix(`voix_${statut || "reseau"}`);
    await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
  }
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
