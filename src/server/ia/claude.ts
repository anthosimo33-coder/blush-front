import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { REGLAGES, systeme, type Requete, type Tache } from "@prompts/lib/contextes";
import { db, schema } from "../db";
import { env } from "../env";
import { alerter } from "../alertes";
import { delaiAppel, tempsRestant } from "../echeance";
import { ErreurTache } from "../erreurs";
import { fournisseurFactice, REFUS_FACTICE } from "./factice";
import { TEXTES } from "./textes.generated";

/*
 * Le seul endroit qui parle au modèle. Les prompts (TEXTES) ne sortent pas d’ici : on renvoie la sortie
 * structurée, vérifiée par son schéma, jamais le texte envoyé.
 */
const MODELE = "claude-opus-5-5";
/* Prix au million de tokens : entrée, sortie, écriture et lecture du cache. */
const PRIX = { entree: 4, sortie: 20, ecritureCache: 5, lectureCache: 0.2 };

/** Ce que le modèle a déjà écrit : sa réflexion (en caractères), sa réponse (en caractères, et le texte lui-même). */
export type Avance = { reflexion: number; texte: number; ecrit: string };

/** La sortie (vérifiée par son schéma), et ce que l’appel a coûté en dollars. `categorie` : celle d’un refus. */
export type Appel<T> = { sortie: T | null; refus: boolean; stop: string | null; cout: number; categorie?: string | null };
type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

/** Moins de temps que ça avant l’échéance (src/server/echeance.ts) : l’appel ne part pas, il serait coupé avant de répondre. */
const TEMPS_MIN_APPEL = 20_000;

/** En mode factice : ce qu’une fonction rend pour simuler un refus du modèle. */
export { REFUS_FACTICE };

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
  "06-vocal": systeme(TEXTES.socle, TEXTES["06-vocal"]),
  "07-memoire": systeme(TEXTES.socle, TEXTES["07-memoire"]),
  "10-chat": systeme(TEXTES.socle, TEXTES["10-chat"]),
};

/** Les textes système, pour le garde-fou anti-fuite (src/server/ia/garde.ts). */
export const textesSysteme = () => Object.values(SYSTEMES);

/** Le texte de la réponse. Après un repli sur un autre modèle (bloc « fallback »), seul ce que ce modèle a écrit compte. */
function lireSortie<S extends z.ZodType>(content: { type: string; text?: string }[], schema: S): z.infer<S> | null {
  const repli = content.map((b) => b.type).lastIndexOf("fallback");
  const texte = content
    .slice(repli + 1)
    .flatMap((b) => (b.type === "text" && b.text ? [b.text] : []))
    .join("");
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

/*
 * Le repli d’Anthropic (bêta) : quand un filtre de sécurité refuse une requête, souvent à tort, l’API la rejoue
 * d’elle-même sur le modèle qu’Anthropic recommande pour ce cas, dans le même appel. Si l’API refusait l’option,
 * on s’en passe et tout marche comme avant.
 */
const BETA_REPLI = "server-side-fallback-2026-07-01";
let repliDisponible = true;

/**
 * En mode factice, le chat suivi passe par le même chemin qu’en vrai : son texte arrive par morceaux, à chaque fois en
 * entier depuis le début, à un rythme qu’on voit (ses bulles arrivent une à une en dev). Les autres tâches suivies (la
 * jauge de la lecture) restent d’un bloc, comme avant.
 */
async function ecrireFactice(texte: string, surAvance: (a: Avance) => void) {
  for (let n = 16; ; n += 16) {
    await new Promise((ok) => setTimeout(ok, 8));
    const ecrit = texte.slice(0, n);
    try {
      surAvance({ reflexion: 0, texte: ecrit.length, ecrit });
    } catch {
      /* comme en vrai : le suivi ne fait jamais échouer la réponse */
    }
    if (n >= texte.length) return;
  }
}

/**
 * Appelle le modèle pour une tâche, avec son format de sortie. `storyId` sert seulement au suivi des coûts.
 * `surAvance` : la réponse passe en flux, et on suit ce qui s’écrit (pour une jauge qui avance vraiment, les bulles du chat).
 * `signal` : l’appel s’arrête quand il n’a plus de raison d’être (l’autre moitié du rapport a échoué).
 * `differer` : le suivi des coûts et l’alerte d’un repli passent après la réponse (le chat en flux), au lieu de la retarder.
 * Avec une échéance (src/server/echeance.ts), l’appel s’arrête avant elle, et ne part pas s’il n’a plus le temps.
 */
export async function appeler<S extends z.ZodType>(
  req: Requete,
  schema: S,
  {
    storyId,
    etiquette,
    surAvance,
    signal,
    differer,
  }: { storyId?: string; etiquette?: string; surAvance?: (a: Avance) => void; signal?: AbortSignal; differer?: (tache: () => Promise<unknown>) => void } = {},
): Promise<Appel<z.infer<S>>> {
  if (env().BLUSH_IA_FACTICE) {
    if (signal?.aborted) throw new ErreurTache("annule");
    const brut = factice(req);
    if (brut === REFUS_FACTICE) return { sortie: null, refus: true, stop: "refusal", cout: 0, categorie: null };
    if (surAvance && req.tache === "10-chat") await ecrireFactice(JSON.stringify(brut), surAvance);
    const ok = schema.safeParse(brut);
    return { sortie: ok.success ? ok.data : null, refus: false, stop: "end_turn", cout: 0 };
  }
  /* Tout de suite, ou après la réponse */
  const ensuite = async (tache: () => Promise<unknown>) => {
    if (differer) differer(tache);
    else await tache();
  };
  if (tempsRestant() < TEMPS_MIN_APPEL) throw new ErreurTache("delai");
  const reglage = REGLAGES[req.tache];
  const base = {
    model: MODELE,
    max_tokens: reglage.maxTokens,
    thinking: { type: "adaptive" as const },
    output_config: { effort: req.effort ?? reglage.effort, format: betaZodOutputFormat(schema) },
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
  /* Le délai et les nouvelles tentatives du SDK tiennent dans le temps qui reste (600 s et 2 tentatives sans échéance) */
  const options = () => {
    const reste = tempsRestant();
    return { timeout: delaiAppel(600_000), maxRetries: reste === Infinity ? 2 : reste > 150_000 ? 1 : 0, ...(signal ? { signal } : {}) };
  };
  const envoyer = async (avecRepli: boolean) => {
    const params = avecRepli ? { ...base, fallbacks: "default" as const, betas: [BETA_REPLI] } : base;
    /* Les longues sorties (rapport, mémoire) passent en flux. Une sortie suivie aussi */
    if (!reglage.flux && !surAvance) return anthropic().beta.messages.create(params, options());
    const flux = anthropic().beta.messages.stream(params, options());
    if (surAvance) {
      let a: Avance = { reflexion: 0, texte: 0, ecrit: "" };
      /* Le suivi ne doit jamais faire échouer la réponse : une erreur ici est ignorée */
      const suivre = () => {
        try {
          surAvance({ ...a });
        } catch {
          /* rien */
        }
      };
      /* Un repli sur un autre modèle : il repart de zéro, la jauge aussi */
      flux.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start" && ev.content_block.type === "fallback") a = { reflexion: 0, texte: 0, ecrit: "" };
      });
      flux.on("thinking", (d) => {
        a.reflexion += d.length;
        suivre();
      });
      flux.on("text", (d) => {
        a.texte += d.length;
        a.ecrit += d;
        suivre();
      });
    }
    return flux.finalMessage();
  };
  let message: Awaited<ReturnType<typeof envoyer>>;
  try {
    message = await envoyer(repliDisponible);
  } catch (e) {
    if (!(repliDisponible && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message))) throw e;
    console.error("repli d’Anthropic refusé par l’API : on s’en passe");
    repliDisponible = false;
    message = await envoyer(false);
  }
  const { usage, model } = message;
  const ms = Date.now() - debut;
  await ensuite(() => noterUsage(usage, { storyId, tache: etiquette ?? req.tache, ms, modele: model }));
  /* Un repli a eu lieu : le premier modèle a refusé, un autre a pris le relais. On note pourquoi (la catégorie, jamais le contenu) */
  const repli = message.content.find((b) => b.type === "fallback");
  if (repli?.type === "fallback") {
    const lignes = [`Tâche ${req.tache}`, `Catégorie du refus : ${repli.trigger.category ?? "aucune (refus sans catégorie)"}`, `De ${repli.from.model} vers ${repli.to.model}`, ...(storyId ? [`Histoire ${storyId}`] : [])];
    console.warn(`repli : ${lignes.join(" · ")}`);
    await ensuite(() => alerter("repli sur un autre modèle", lignes));
  }
  if (message.stop_reason === "refusal") {
    /* La catégorie du refus (cyber, bio, general_harms…) et l’identifiant de la requête : jamais de contenu */
    const categorie = message.stop_details?.category ?? null;
    console.warn(`refus du modèle (${req.tache}) : ${categorie ?? "sans catégorie"} · ${(message as { _request_id?: string | null })._request_id ?? ""}`);
    return { sortie: null, refus: true, stop: message.stop_reason, cout: cout(message.usage), categorie };
  }
  return { sortie: lireSortie(message.content as { type: string; text?: string }[], schema), refus: false, stop: message.stop_reason, cout: cout(message.usage) };
}

async function noterUsage(u: Usage, { storyId, tache, ms, modele }: { storyId?: string; tache: string; ms: number; modele: string }) {
  try {
    await db()
      .insert(schema.aiUsage)
      .values({
        storyId: storyId ?? null,
        task: tache,
        model: modele,
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
