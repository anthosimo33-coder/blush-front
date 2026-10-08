import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { REGLAGES, systeme, type Requete, type Tache } from "@prompts/lib/contextes";
import { db, schema } from "../db";
import { env } from "../env";
import { fournisseurFactice } from "./factice";
import { TEXTES } from "./textes.generated";

/*
 * Le seul endroit qui parle au modèle. Les prompts (TEXTES) ne sortent pas d’ici : on renvoie la sortie
 * structurée, vérifiée par son schéma, jamais le texte envoyé.
 */
export const MODELE = "claude-opus-5-5";
/* Prix au million de tokens : entrée, sortie, écriture et lecture du cache. */
const PRIX = { entree: 4, sortie: 20, ecritureCache: 5, lectureCache: 0.2 };

/** Ce que le modèle a déjà écrit, en caractères : sa réflexion, puis sa réponse. */
export type Avance = { reflexion: number; texte: number };

/** La sortie (vérifiée par son schéma), et ce que l’appel a coûté en dollars. */
export type Appel<T> = { sortie: T | null; refus: boolean; stop: string | null; cout: number };
type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

/** En mode factice (tests, dev sans coût) : une fonction qui rend une sortie pour une requête. */
type Factice = (req: Requete) => unknown;
let factice: Factice = fournisseurFactice;
export function definirFactice(f: Factice | null) {
  factice = f ?? fournisseurFactice;
}

let client: Anthropic | null = null;
function anthropic() {
  const e = env();
  return (client ??= new Anthropic({
    apiKey: e.ANTHROPIC_API_KEY,
    ...(e.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": e.ANTHROPIC_WORKSPACE_ID } } : {}),
  }));
}

const SYSTEMES: Record<Tache, string> = {
  /* Lire des captures : on transcrit, on ne parle pas. Pas besoin de la voix de BLUSH (le socle) */
  "01-captures": TEXTES["01-captures"].trim(),
  "04-verdict": systeme(TEXTES.socle, TEXTES["04-verdict"]),
  "05-rapport": systeme(TEXTES.socle, TEXTES["05-rapport"]),
  "07-memoire": systeme(TEXTES.socle, TEXTES["07-memoire"]),
  "10-chat": systeme(TEXTES.socle, TEXTES["10-chat"]),
};

/** Les textes système, pour le garde-fou anti-fuite (src/server/ia/garde.ts). */
export const textesSysteme = () => Object.values(SYSTEMES);

function lireSortie<S extends z.ZodType>(message: Anthropic.Message, schema: S): z.infer<S> | null {
  const texte = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const ok = schema.safeParse(JSON.parse(texte));
    return ok.success ? ok.data : null;
  } catch {
    return null;
  }
}

const cout = (u: Usage) =>
  ((u.input_tokens ?? 0) * PRIX.entree + (u.output_tokens ?? 0) * PRIX.sortie + (u.cache_creation_input_tokens ?? 0) * PRIX.ecritureCache + (u.cache_read_input_tokens ?? 0) * PRIX.lectureCache) /
  1e6;

/**
 * Appelle le modèle pour une tâche, avec son format de sortie. `storyId` sert seulement au suivi des coûts.
 * `surAvance` : la réponse passe en flux, et on suit ce qui s’écrit (pour une jauge qui avance vraiment).
 */
export async function appeler<S extends z.ZodType>(
  req: Requete,
  schema: S,
  { storyId, etiquette, surAvance }: { storyId?: string; etiquette?: string; surAvance?: (a: Avance) => void } = {},
): Promise<Appel<z.infer<S>>> {
  if (env().BLUSH_IA_FACTICE) {
    const ok = schema.safeParse(factice(req));
    return { sortie: ok.success ? ok.data : null, refus: false, stop: "end_turn", cout: 0 };
  }
  const reglage = REGLAGES[req.tache];
  const params = {
    model: MODELE,
    max_tokens: reglage.maxTokens,
    thinking: { type: "adaptive" as const },
    output_config: { effort: req.effort ?? reglage.effort, format: zodOutputFormat(schema) },
    system: [{ type: "text" as const, text: SYSTEMES[req.tache], cache_control: { type: "ephemeral" as const } }],
    messages: [
      {
        role: "user" as const,
        content: req.blocs.map((b) =>
          "image" in b
            ? { type: "image" as const, source: { type: "base64" as const, media_type: b.image.media, data: b.image.base64 } }
            : { type: "text" as const, text: b.texte, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) },
        ),
      },
    ],
  };
  const debut = Date.now();
  /* Les longues sorties (rapport, mémoire) passent en flux : pas de délai d’attente HTTP. Une sortie suivie aussi */
  let message: Anthropic.Message;
  if (reglage.flux || surAvance) {
    const flux = anthropic().messages.stream(params);
    if (surAvance) {
      const a: Avance = { reflexion: 0, texte: 0 };
      flux.on("thinking", (d) => surAvance({ ...a, reflexion: (a.reflexion += d.length) }));
      flux.on("text", (d) => surAvance({ ...a, texte: (a.texte += d.length) }));
    }
    message = await flux.finalMessage();
  } else message = await anthropic().messages.create(params);
  await noterUsage(message.usage, { storyId, tache: etiquette ?? req.tache, ms: Date.now() - debut });
  if (message.stop_reason === "refusal") return { sortie: null, refus: true, stop: message.stop_reason, cout: cout(message.usage) };
  return { sortie: lireSortie(message, schema), refus: false, stop: message.stop_reason, cout: cout(message.usage) };
}

async function noterUsage(u: Usage, { storyId, tache, ms }: { storyId?: string; tache: string; ms: number }) {
  try {
    await db()
      .insert(schema.aiUsage)
      .values({
        storyId: storyId ?? null,
        task: tache,
        model: MODELE,
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        costMicros: Math.round(cout(u) * 1e6),
        ms,
      });
  } catch (e) {
    /* Le suivi des coûts ne doit jamais faire échouer une réponse */
    console.error("usage non noté", (e as Error).message);
  }
}
