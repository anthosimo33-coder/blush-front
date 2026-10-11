import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { REGLAGES, systeme, type Requete, type Tache } from "@prompts/lib/contextes";
import { env } from "../env";
import { alerter } from "../alertes";
import { controlerBudget, type Payeur } from "../budget";
import { delaiAppel, tempsRestant } from "../echeance";
import { ErreurTache } from "../erreurs";
import { journal } from "../journal";
import { fournisseurFactice, iaFactice, prestataireFactice, REFUS_FACTICE, type RequeteFactice } from "./factice";
import { noterCout } from "./usage";
import { TEXTES } from "./textes.generated";

/*
 * Le seul endroit qui parle au modèle. Les prompts (TEXTES) ne sortent pas d’ici : on renvoie la sortie
 * structurée, vérifiée par son schéma, jamais le texte envoyé.
 * Un appel se fait en trois temps : ses paramètres (parametres), l’envoi au prestataire (un Fournisseur : le SDK en vrai,
 * le modèle factice en mode factice, un faux dans les tests du vrai chemin), suivi au fil de l’eau s’il passe en flux
 * (suivreFlux), puis la lecture de la réponse (lireMessage). Les deux prestataires passent par le même chemin : le
 * budget, l’échéance, la lecture et le refus. Le coût de chaque vrai appel est noté par src/server/ia/usage.ts.
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

/*
 * En mode factice : ce qu’une fonction rend pour simuler un refus du modèle. Reprise ici pour les tests qui la lisent à
 * cette adresse (robustesse, ecriture) : elle part avec eux, au plus tard au lot 9a (retrait des ré-exportations).
 */
export { REFUS_FACTICE };

/**
 * La partie d’une tâche qui en a plusieurs : le plan ou une moitié des chapitres du rapport (05), la mise à jour de la
 * mémoire (07, sa création sinon). Le vrai modèle la lit dans la demande ; le modèle factice la reçoit avec la requête
 * (RequeteFactice), au lieu de la deviner au libellé de la demande.
 */
export type Partie = "plan" | "chapitres 1 à 4" | "chapitres 5 à 8" | "mise à jour";

/**
 * Ce que dit le modèle factice (tests, dev sans coût) : une fonction qui rend une sortie pour une requête et sa partie
 * (RequeteFactice). Les tests en changent par definirFactice (tests/aide/fixtures.ts) ; le prestataire reste le modèle
 * factice (prestataireFactice). Le vrai chemin, lui, se teste en changeant de prestataire : definirFournisseur.
 */
type Factice = (req: RequeteFactice) => unknown;
let factice: Factice = fournisseurFactice;
export function definirFactice(f: Factice | null) {
  factice = f ?? fournisseurFactice;
}

/* ———— Le prestataire ———— */

/** Les paramètres d’un appel (parametres), avec le repli du prestataire quand le SDK le demande. */
type Parametres = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
/** Ce que l’envoi passe au SDK : son délai, ses nouvelles tentatives, et de quoi l’arrêter. */
type OptionsEnvoi = { timeout: number; maxRetries: number; signal?: AbortSignal };
/** Ce qu’on suit d’un appel en flux : un bloc qui commence (son type : « fallback » pour un repli), la réflexion, le texte. */
export type Ecoute = { bloc: (type: string) => void; reflexion: (morceau: string) => void; texte: (morceau: string) => void };
/** Ce qu’un appel envoie au prestataire : la requête et sa partie (le modèle factice les lit), et ses paramètres (le SDK les lit). */
export type Demande = { requete: Requete; partie: Partie | null; params: Parametres };
/**
 * Un bloc de la réponse, tel qu’on le lit : du texte, un repli sur un autre modèle (de qui, vers qui, pourquoi), ou un
 * bloc qu’on ne lit pas (la réflexion…).
 */
type BlocRecu =
  | { type: "text"; text: string }
  | { type: "fallback"; from: { model: string }; to: { model: string }; trigger: { category?: string | null } }
  | { type: Exclude<Anthropic.Beta.Messages.BetaContentBlock["type"], "text" | "fallback"> };
/** Ce qu’on lit d’une réponse du modèle (un BetaMessage du SDK l’est). */
export type MessageRecu = {
  content: BlocRecu[];
  usage: Usage;
  model: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  _request_id?: string | null;
};

/**
 * Ce qui envoie une requête au modèle et rend sa réponse entière : le SDK du prestataire (prestataireSDK), le modèle
 * factice (prestataireFactice, src/server/ia/factice.ts), ou un faux dans les tests (definirFournisseur). `flux` : la
 * réponse passe en flux (les longues sorties, une sortie suivie) ; `ecoute` : ce qui s’écrit, au fil de l’eau.
 */
export type Fournisseur = {
  envoyer: (demande: Demande, options: OptionsEnvoi, envoi: { flux: boolean; ecoute: Ecoute | null }) => Promise<MessageRecu>;
  /** Un prestataire qui ne coûte rien (le modèle factice) : ses appels ne sont pas notés au suivi des coûts. */
  gratuit?: boolean;
};

let client: Anthropic | null = null;
function anthropic() {
  const e = env();
  return (client ??= new Anthropic({
    apiKey: e.ANTHROPIC_API_KEY,
    ...(e.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": e.ANTHROPIC_WORKSPACE_ID } } : {}),
  }));
}

/*
 * Le repli d’Anthropic (bêta) : quand un filtre de sécurité refuse une requête, souvent à tort, l’API la rejoue
 * d’elle-même sur le modèle qu’Anthropic recommande pour ce cas, dans le même appel. Si l’API refusait l’option,
 * on s’en passe et tout marche comme avant.
 */
const BETA_REPLI = "server-side-fallback-2026-07-01";

/**
 * Le vrai prestataire, par le client de son SDK (`client` : un client au faux `fetch` dans tests/unit/claude.test.ts).
 * Il demande le repli du prestataire ; si l’API refuse l’option, il renvoie sans elle, et ne la redemande plus.
 */
export function prestataireSDK(client: () => Anthropic): Fournisseur {
  let repliDisponible = true;
  const envoyer = async (params: Parametres, options: OptionsEnvoi, flux: boolean, ecoute: Ecoute | null): Promise<MessageRecu> => {
    if (!flux) return client().beta.messages.create(params, options);
    const f = client().beta.messages.stream(params, options);
    if (ecoute) {
      f.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start") ecoute.bloc(ev.content_block.type);
      });
      f.on("thinking", (d) => ecoute.reflexion(d));
      f.on("text", (d) => ecoute.texte(d));
    }
    return f.finalMessage();
  };
  return {
    async envoyer({ requete, params }, options, { flux, ecoute }) {
      if (!repliDisponible) return envoyer(params, options, flux, ecoute);
      try {
        return await envoyer({ ...params, fallbacks: "default", betas: [BETA_REPLI] }, options, flux, ecoute);
      } catch (e) {
        /* L’API refuse la requête avant d’écrire quoi que ce soit : le suivi n’a rien vu, il resert tel quel */
        if (!(e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message))) throw e;
        journal("repli refusé par l’API : on s’en passe", { tache: requete.tache }, "alerte");
        repliDisponible = false;
        return envoyer(params, options, flux, ecoute);
      }
    },
  };
}

const SDK = prestataireSDK(anthropic);
/** Le modèle factice, avec ce qu’il dit au moment de l’appel (definirFactice). */
const MODELE_FACTICE = prestataireFactice((req) => factice(req));

let fournisseur: Fournisseur = SDK;
/** Pour les tests du vrai chemin (hors du mode factice) : un faux prestataire, puis de nouveau le SDK (`null`). */
export function definirFournisseur(f: Fournisseur | null) {
  fournisseur = f ?? SDK;
}

/* ———— Les trois temps d’un appel ———— */

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

/** Les paramètres d’un appel : le modèle, les réglages de la tâche, son texte système (en cache), la requête et le format de sortie. */
function parametres(req: Requete, schema: z.ZodType) {
  const reglage = REGLAGES[req.tache];
  return {
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
  } satisfies Parametres;
}

/**
 * Ce qui s’écrit pendant un appel en flux, rendu à `surAvance` à chaque morceau. Un repli sur un autre modèle repart de
 * zéro, la jauge aussi. Le suivi ne doit jamais faire échouer la réponse : une erreur de `surAvance` est ignorée.
 */
function suivreFlux(surAvance: (a: Avance) => void): Ecoute {
  let a: Avance = { reflexion: 0, texte: 0, ecrit: "" };
  const suivre = () => {
    try {
      surAvance({ ...a });
    } catch {
      /* rien */
    }
  };
  return {
    bloc: (type) => {
      if (type === "fallback") a = { reflexion: 0, texte: 0, ecrit: "" };
    },
    reflexion: (d) => {
      a.reflexion += d.length;
      suivre();
    },
    texte: (d) => {
      a.texte += d.length;
      a.ecrit += d;
      suivre();
    },
  };
}

/** Le repli sur un autre modèle qu’une réponse annonce : la catégorie du refus qui l’a causé, et les deux modèles. */
type Repli = { categorie: string | null; de: string; vers: string };

/**
 * Ce que dit une réponse : la sortie vérifiée par son schéma, ou le refus (et sa catégorie), son coût, et le repli s’il
 * y en a eu un. Après un repli (bloc « fallback »), seul ce que le second modèle a écrit compte.
 */
function lireMessage<S extends z.ZodType>(message: MessageRecu, schema: S): { appel: Appel<z.infer<S>>; repli: Repli | null } {
  const c = cout(message.usage);
  const bloc = message.content.find((b): b is Extract<BlocRecu, { type: "fallback" }> => b.type === "fallback");
  const repli = bloc ? { categorie: bloc.trigger.category ?? null, de: bloc.from.model, vers: bloc.to.model } : null;
  if (message.stop_reason === "refusal") return { appel: { sortie: null, refus: true, stop: message.stop_reason, cout: c, categorie: message.stop_details?.category ?? null }, repli };
  const depuis = message.content.map((b) => b.type).lastIndexOf("fallback");
  const texte = message.content
    .slice(depuis + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  let sortie: z.infer<S> | null = null;
  try {
    const ok = schema.safeParse(JSON.parse(texte));
    if (ok.success) sortie = ok.data;
  } catch {
    /* un texte qui n’est pas du JSON : pas de sortie */
  }
  return { appel: { sortie, refus: false, stop: message.stop_reason, cout: c }, repli };
}

const cout = (u: Usage) =>
  ((u.input_tokens ?? 0) * PRIX.entree + (u.output_tokens ?? 0) * PRIX.sortie + (u.cache_creation_input_tokens ?? 0) * PRIX.ecritureCache + (u.cache_read_input_tokens ?? 0) * PRIX.lectureCache) /
  1e6;

/** Les options d’un appel (appeler). */
export type OptionsAppel = {
  /** La conv de l’appel : le suivi des coûts, et le budget du jour de son compte. */
  storyId?: string;
  /** Le nom de l’appel dans le suivi des coûts (ai_usage.task) ; la tâche sinon. */
  etiquette?: string;
  /** La partie d’une tâche qui en a plusieurs (Partie), pour le modèle factice : le vrai la lit dans la demande. */
  partie?: Partie;
  /** La réponse passe en flux, et on suit ce qui s’écrit (pour une jauge qui avance vraiment, les bulles du chat). */
  surAvance?: (a: Avance) => void;
  /** L’appel s’arrête quand il n’a plus de raison d’être (l’autre moitié du rapport a échoué). */
  signal?: AbortSignal;
  /** Sans conv : le compte connecté qui paie (des captures lues avant l’import). */
  compte?: { email: string } | null;
  /** Le suivi des coûts et l’alerte d’un repli passent après la réponse (le chat en flux), au lieu de la retarder. */
  differer?: (tache: () => Promise<unknown>) => void;
};

/**
 * Appelle le modèle pour une tâche, avec son format de sortie. `storyId` sert au suivi des coûts et au budget du jour :
 * au-delà de celui de tous ou de celui du compte de la conv (sans conv, celui de `compte`, le compte connecté qui
 * envoie des captures avant l’import ; sans compte, la part sans compte), l’appel ne part pas (ErreurTache « budget »,
 * src/server/budget.ts), en mode factice aussi. Les autres options : OptionsAppel.
 * Avec une échéance (src/server/echeance.ts), l’appel s’arrête avant elle, et ne part pas s’il n’a plus le temps (en
 * mode factice aussi : il passe par le même chemin, prestataireFactice à la place du SDK).
 */
export async function appeler<S extends z.ZodType>(req: Requete, schema: S, { storyId, etiquette, partie, surAvance, signal, compte, differer }: OptionsAppel = {}): Promise<Appel<z.infer<S>>> {
  const payeur = await controlerBudget({ storyId, compte });
  const prestataire = iaFactice() ? MODELE_FACTICE : fournisseur;
  /* Tout de suite, ou après la réponse */
  const ensuite = async (tache: () => Promise<unknown>) => {
    if (differer) differer(tache);
    else await tache();
  };
  if (tempsRestant() < TEMPS_MIN_APPEL) throw new ErreurTache("delai");
  const base = parametres(req, schema);
  /* Les longues sorties (rapport, mémoire) passent en flux. Une sortie suivie aussi */
  const flux = REGLAGES[req.tache].flux || !!surAvance;
  const debut = Date.now();
  /* Le délai et les nouvelles tentatives du SDK tiennent dans le temps qui reste (600 s et 2 tentatives sans échéance) */
  const reste = tempsRestant();
  const options: OptionsEnvoi = { timeout: delaiAppel(600_000), maxRetries: reste === Infinity ? 2 : reste > 150_000 ? 1 : 0, ...(signal ? { signal } : {}) };
  const message = await prestataire.envoyer({ requete: req, partie: partie ?? null, params: base }, options, { flux, ecoute: surAvance ? suivreFlux(surAvance) : null });
  const { usage, model } = message;
  const ms = Date.now() - debut;
  if (!prestataire.gratuit) await ensuite(() => noterUsage(usage, Math.round(cout(usage) * 1e6), { storyId, payeur, tache: etiquette ?? req.tache, ms, modele: model }));
  const { appel, repli } = lireMessage(message, schema);
  /*
   * Un repli a eu lieu : le premier modèle a refusé, un autre a pris le relais. On note pourquoi (la catégorie, jamais le
   * contenu). L’équipe n’en est prévenue que pour une conv : un repli sans conv (des captures lues avant l’import, que
   * n’importe qui peut envoyer) ne ferait qu’user le budget des alertes (S-19)
   */
  if (repli) {
    journal("repli sur un autre modèle", { tache: req.tache, categorie: repli.categorie, de: repli.de, vers: repli.vers, histoire: storyId }, "alerte");
    if (storyId)
      await ensuite(() =>
        alerter("repli sur un autre modèle", [`Tâche ${req.tache}`, `Catégorie du refus : ${repli.categorie ?? "aucune (refus sans catégorie)"}`, `De ${repli.de} vers ${repli.vers}`, `Histoire ${storyId}`]),
      );
  }
  /* La catégorie du refus (cyber, bio, general_harms…) et l’identifiant de la requête (de la réponse, pas de lireMessage) : jamais de contenu */
  if (appel.refus) journal("refus du modèle", { tache: req.tache, categorie: appel.categorie ?? null, requete: message._request_id }, "alerte");
  return appel;
}

/** Le suivi des coûts (ai_usage) et la dépense du jour de qui paie (le budget de l’IA, src/server/budget.ts) : noterCout, src/server/ia/usage.ts. */
async function noterUsage(u: Usage, micros: number, { storyId, payeur, tache, ms, modele }: { storyId?: string; payeur: Payeur; tache: string; ms: number; modele: string }) {
  await noterCout({
    storyId,
    tache,
    modele,
    entree: u.input_tokens ?? 0,
    sortie: u.output_tokens ?? 0,
    cacheLu: u.cache_read_input_tokens ?? 0,
    cacheEcrit: u.cache_creation_input_tokens ?? 0,
    micros,
    ms,
    payeur,
  });
}
