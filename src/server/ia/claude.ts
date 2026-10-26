import "server-only";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { REGLAGES, systeme, type Requete, type Tache } from "@prompts/lib/contextes";
import { env, iaFactice } from "../env";
import { alerter } from "../alertes";
import { controlerBudget, type Payeur, type Reserve } from "../budget";
import { delaiAppel, tempsRestant } from "../echeance";
import { ErreurTache } from "../erreurs";
import { journal, journalErreur } from "../journal";
import { fournisseurFactice, prestataireFactice, type RequeteFactice } from "./factice";
import { noterCout } from "./usage";
import { TEXTES } from "./textes.generated";

/*
 * Le seul endroit qui parle au modèle. Les prompts (TEXTES) ne sortent pas d’ici : on renvoie la sortie
 * structurée, vérifiée par son schéma, jamais le texte envoyé.
 * Un appel se fait en trois temps : ses paramètres (parametres), l’envoi au prestataire (un Fournisseur : le SDK en vrai,
 * le modèle factice en mode factice, un faux dans les tests du vrai chemin), suivi au fil de l’eau s’il passe en flux
 * (suivreFlux), puis la lecture de la réponse (lireMessage). Les deux prestataires passent par le même chemin : le
 * budget, l’échéance, la lecture et le refus. Le coût de chaque vrai appel est noté par src/server/ia/usage.ts. Une
 * requête qui peut attendre part aussi en lot (l’API Message Batches : envoyerEnLot, plus bas), avec les mêmes paramètres,
 * et sa réponse se lit par le même chemin (lireLeResultat).
 */
const MODELE = "claude-opus-5-5";
/**
 * Le modèle d’une tâche, quand ce n’est pas MODELE. Lire des captures (et les écrans d’un enregistrement) est une
 * transcription, pas une écriture : à l’essai du 20 octobre (scripts/essai-video-modeles.mts, deux convs de test
 * filmées comme iMessage), Sonnet 5.5 en a lu autant mot pour mot qu’Opus 5.5, deux fois moins cher et plus vite.
 */
const MODELE_DE: Partial<Record<Tache, string>> = { "01-captures": "claude-sonnet-5-5" };

/** Prix au million de tokens : entrée, sortie, écriture et lecture du cache. */
type Prix = { entree: number; sortie: number; ecritureCache: number; lectureCache: number };
/*
 * Le prix de chaque modèle qui peut répondre : le nôtre, et ceux du repli (fallbacks « default » : sur un refus, l’API
 * rejoue la requête sur un autre modèle, facturé à son propre tarif). Un modèle inconnu se compte au plus cher : le
 * budget du jour coupe alors trop tôt plutôt que trop tard.
 */
const PRIX_DES_MODELES: Record<string, Prix> = {
  "claude-opus-5-5": { entree: 4, sortie: 20, ecritureCache: 5, lectureCache: 0.2 },
  "claude-fable-5-1": { entree: 10, sortie: 50, ecritureCache: 12.5, lectureCache: 0.25 },
  "claude-fable-5": { entree: 10, sortie: 50, ecritureCache: 12.5, lectureCache: 1 },
  "claude-opus-5": { entree: 5, sortie: 25, ecritureCache: 6.25, lectureCache: 0.5 },
  "claude-opus-4-8": { entree: 5, sortie: 25, ecritureCache: 6.25, lectureCache: 0.5 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10, ecritureCache: 2.5, lectureCache: 0.2 },
  "claude-sonnet-5": { entree: 2, sortie: 10, ecritureCache: 2.5, lectureCache: 0.2 },
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5, ecritureCache: 0.125, lectureCache: 0.01 },
};
const PRIX_INCONNU: Prix = { entree: 10, sortie: 50, ecritureCache: 12.5, lectureCache: 1 };

/** Ce que le modèle a déjà écrit : sa réflexion (en caractères), sa réponse (en caractères, et le texte lui-même). */
export type Avance = { reflexion: number; texte: number; ecrit: string };

/** La sortie (vérifiée par son schéma), et ce que l’appel a coûté en dollars. `categorie` : celle d’un refus. */
export type Appel<T> = { sortie: T | null; refus: boolean; stop: string | null; cout: number; categorie?: string | null };
type Tokens = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
/** L’usage d’une réponse, et, avec un repli, celui de chaque modèle qui a écrit (`iterations`, son modèle avec). */
type Usage = Tokens & { iterations?: readonly (Tokens & { type?: string; model?: string | null })[] | null };

/** Moins de temps que ça avant l’échéance (src/server/echeance.ts) : l’appel ne part pas, il serait coupé avant de répondre. */
const TEMPS_MIN_APPEL = 20_000;

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

/**
 * Les paramètres d’un appel (parametres) : ceux de l’API des messages (la bêta, où le SDK ajoute le repli du
 * prestataire) et ceux de l’API des lots (sans bêta) à la fois. La même requête part par l’une ou l’autre.
 */
type Parametres = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & Anthropic.Messages.MessageCreateParamsNonStreaming;
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

/** Le système du montage partagé (prompts/lib/contextes.ts) : le socle seul, le même pour le verdict, le rapport, le vocal et la mémoire. */
const SOCLE = TEXTES.socle.trim();

/**
 * Les tâches du montage partagé : celles qui lisent la conv entière, et le vocal, qui ne la lit pas mais relit le socle
 * mis en cache par le verdict. Elles ne le relisent qu’avec les mêmes réglages : le modèle, la réflexion et l’effort
 * font partie du préfixe en cache (tests/unit/claude.test.ts le vérifie).
 */
export type TacheDuMontage = "04-verdict" | "05-rapport" | "06-vocal" | "07-memoire";

/**
 * La consigne d’une tâche du montage partagé, à passer à sa requête (BLUSH_MONTAGE=partage) : son prompt, qui part alors
 * dans le message (après la conv, ou devant ce que dit le vocal), au lieu du système. Rien dans le montage d’origine.
 * Le prompt ne sort pas du serveur : il revient ici dans la requête, comme les autres.
 */
export const consigneDuMontage = (tache: TacheDuMontage): string | undefined => (env().BLUSH_MONTAGE === "partage" ? TEXTES[tache] : undefined);

/**
 * Le format de sortie demandé : le schéma JSON tiré du schéma zod, sans la lecture que le SDK y attache (`parse`). Avec
 * elle, le SDK lit lui-même chaque texte d’une réponse en flux, et lève une erreur sans nom ni code (« Error ») devant un
 * refus en cours d’écriture, un repli (le texte coupé du premier modèle reste dans la réponse) ou une sortie coupée :
 * lireMessage sait traiter les trois, encore faut-il qu’il les voie (la mémoire du 13 octobre : « erreur:Error » à
 * chaque essai, tests/unit/claude.test.ts).
 */
function formatDeSortie(schema: z.ZodType) {
  const { type, schema: json } = betaZodOutputFormat(schema);
  return { type, schema: json };
}

/** Les paramètres d’un appel : le modèle, les réglages de la tâche, son texte système (en cache), la requête et le format de sortie. */
function parametres(req: Requete, schema: z.ZodType) {
  const reglage = REGLAGES[req.tache];
  return {
    model: MODELE_DE[req.tache] ?? MODELE,
    max_tokens: reglage.maxTokens,
    /*
     * La réflexion résumée : sur notre modèle, elle arrive vide par défaut (« omitted »), et les jauges de lecture et
     * d’écriture, qui avancent sur sa longueur (suivreFlux, src/server/avancement.ts), resteraient figées jusqu’aux
     * premiers mots. Le résumé ne coûte rien de plus (la réflexion est facturée pareil), et son texte ne sort pas d’ici
     */
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    /* Le montage partagé n’impose aucun format : un format imposé passe avant le système dans le préfixe en cache (lireMessage vérifie la réponse) */
    output_config: req.partage ? { effort: req.effort ?? reglage.effort } : { effort: req.effort ?? reglage.effort, format: formatDeSortie(schema) },
    system: [{ type: "text" as const, text: req.partage ? SOCLE : SYSTEMES[req.tache], cache_control: { type: "ephemeral" as const } }],
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
 * zéro, la jauge aussi. Le suivi ne doit jamais faire échouer la réponse : une erreur de `surAvance` est passée, et
 * dite au journal une fois par appel (elle reviendrait à chaque morceau).
 */
function suivreFlux(surAvance: (a: Avance) => void, tache: string): Ecoute {
  let a: Avance = { reflexion: 0, texte: 0, ecrit: "" };
  let dite = false;
  const suivre = () => {
    try {
      surAvance({ ...a });
    } catch (e) {
      if (!dite) journalErreur("suivi de l’avance en erreur", e, { tache });
      dite = true;
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
function lireMessage<S extends z.ZodType>(message: MessageRecu, schema: S, { lot = false }: { lot?: boolean } = {}): { appel: Appel<z.infer<S>>; repli: Repli | null } {
  const c = cout(message.usage, message.model, { lot });
  const bloc = message.content.find((b): b is Extract<BlocRecu, { type: "fallback" }> => b.type === "fallback");
  const repli = bloc ? { categorie: bloc.trigger.category ?? null, de: bloc.from.model, vers: bloc.to.model } : null;
  if (message.stop_reason === "refusal")
    return { appel: { sortie: null, refus: true, stop: message.stop_reason, cout: c, categorie: message.stop_details?.category ?? null }, repli };
  const depuis = message.content.map((b) => b.type).lastIndexOf("fallback");
  const texte = message.content
    .slice(depuis + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  let sortie: z.infer<S> | null = null;
  try {
    /* Sans format imposé (le montage partagé), l’objet peut arriver dans un bloc de code : on le prend de la première accolade à la dernière */
    const ok = schema.safeParse(JSON.parse(texte.slice(texte.indexOf("{"), texte.lastIndexOf("}") + 1)));
    if (ok.success) sortie = ok.data;
  } catch {
    /* un texte qui n’est pas du JSON : pas de sortie */
  }
  return { appel: { sortie, refus: false, stop: message.stop_reason, cout: c }, repli };
}

/** Le prix d’un modèle ; un modèle inconnu se compte au plus cher, et le journal le dit (la table est à compléter). */
function prixDe(modele: string | null | undefined): Prix {
  const prix = modele ? PRIX_DES_MODELES[modele] : PRIX_DES_MODELES[MODELE];
  if (prix) return prix;
  journal("modèle sans prix, compté au plus cher", { modele: modele ?? null }, "alerte");
  return PRIX_INCONNU;
}

const coutDe = (t: Tokens, prix: Prix) =>
  ((t.input_tokens ?? 0) * prix.entree +
    (t.output_tokens ?? 0) * prix.sortie +
    (t.cache_creation_input_tokens ?? 0) * prix.ecritureCache +
    (t.cache_read_input_tokens ?? 0) * prix.lectureCache) /
  1e6;

/**
 * La remise d’un lot (l’API Message Batches) : le prestataire y facture chaque jeton à moitié prix, l’entrée, la sortie,
 * l’écriture et la lecture du cache comprises.
 */
const REMISE_DU_LOT = 0.5;

/**
 * Ce qu’un appel a coûté, en dollars : chaque passage du modèle à son tarif (`iterations` : le nôtre, puis celui du
 * repli ; sans modèle dit, celui qui a répondu), sinon tout au tarif du modèle qui a répondu (`modele`). `lot` : la
 * requête est passée en lot, à moitié prix (REMISE_DU_LOT).
 */
export function cout(u: Usage, modele: string, { lot = false }: { lot?: boolean } = {}): number {
  /* Rien d’écrit (le modèle factice) : rien à compter, ni de prix à chercher */
  if (!u.input_tokens && !u.output_tokens && !u.cache_creation_input_tokens && !u.cache_read_input_tokens && !u.iterations?.length) return 0;
  const remise = lot ? REMISE_DU_LOT : 1;
  if (u.iterations?.length) return remise * u.iterations.reduce((n, i) => n + coutDe(i, prixDe(i.model ?? modele)), 0);
  return remise * coutDe(u, prixDe(modele));
}

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
export async function appeler<S extends z.ZodType>(
  req: Requete,
  schema: S,
  { storyId, etiquette, partie, surAvance, signal, compte, differer }: OptionsAppel = {},
): Promise<Appel<z.infer<S>>> {
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
  /*
   * Le délai et les nouvelles tentatives du SDK tiennent ensemble dans le temps qui reste. Le SDK compte son délai à
   * chaque tentative. En flux, il ne couvre que l’attente du début du flux : il se partage entre les tentatives (sans
   * échéance, un script : trois de 200 s). D’un bloc, il couvre tout l’appel (un verdict écrit parfois plus de deux
   * minutes) : chaque tentative garde le délai plein. Dans les deux cas, l’échéance arrête l’appel entier (le signal) :
   * une nouvelle tentative ne part qu’après un échec rapide (une surcharge, une connexion coupée), dans le temps qui
   * reste. Une tentative de plus quand il reste plus de 150 s.
   */
  const reste = tempsRestant();
  const maxRetries = reste === Infinity ? 2 : reste > 150_000 ? 1 : 0;
  const delai = delaiAppel(600_000);
  const signaux = [...(signal ? [signal] : []), ...(reste === Infinity ? [] : [AbortSignal.timeout(delai)])];
  const options: OptionsEnvoi = {
    timeout: flux ? Math.floor(delai / (maxRetries + 1)) : delai,
    maxRetries,
    ...(signaux.length ? { signal: AbortSignal.any(signaux) } : {}),
  };
  const message = await prestataire.envoyer({ requete: req, partie: partie ?? null, params: base }, options, { flux, ecoute: surAvance ? suivreFlux(surAvance, req.tache) : null });
  const { usage, model } = message;
  const ms = Date.now() - debut;
  if (!prestataire.gratuit) await ensuite(() => noterUsage(usage, Math.round(cout(usage, model) * 1e6), { storyId, payeur, tache: etiquette ?? req.tache, ms, modele: model }));
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
        alerter("repli sur un autre modèle", [
          `Tâche ${req.tache}`,
          `Catégorie du refus : ${repli.categorie ?? "aucune (refus sans catégorie)"}`,
          `De ${repli.de} vers ${repli.vers}`,
          `Histoire ${storyId}`,
        ]),
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

/* ———— Les lots (l’API Message Batches) ———— */

/*
 * Une requête qui peut attendre (une mise à jour de la mémoire au calme : src/server/memoire-en-lot.ts) part en lot chez
 * le prestataire : il la traite quand il veut (d’habitude en quelques minutes, au plus 24 h), à moitié prix. C’est la même
 * requête qu’en direct, à l’octet près (parametres : le modèle, la réflexion, l’effort, le format de sortie, le système et
 * son cache, les messages), sans le flux, qu’un lot n’a pas, et sans le repli du prestataire (`fallbacks` et son en-tête
 * bêta) : l’API des lots le refuse. Un refus en lot n’est donc pas repris par un autre modèle : la mise à jour repart en
 * direct, avec lui (le repli ne change que le modèle qui répond à un refus, jamais la requête). Une requête par lot : une
 * mise à jour qu’il faut faire tout de suite annule le sien sans toucher aux autres. Son identifiant (custom_id) est celui
 * de sa tâche, précédé de PREFIXE_DES_LOTS : le ménage (src/server/memoire-en-lot.ts) reconnaît ainsi les lots à nous
 * parmi ceux de l’espace de travail de la clé (les évals des prompts en envoient aussi), sans rien lire de la base.
 */

/** Où en est un lot chez le prestataire : il tourne (ou s’annule), il est fini (ses résultats se lisent), ou il n’existe plus. */
export type EtatDuLot = "en_cours" | "fini" | "introuvable";

/** Ce qu’est devenue une requête d’un lot : sa réponse, une erreur (son type, jamais son message), annulée, ou expirée (24 h). */
export type IssueDuLot = { type: "succeeded"; message: MessageRecu } | { type: "errored"; code: string } | { type: "canceled" } | { type: "expired" };

/** Un lot de l’espace de travail, tel que la liste du prestataire le montre : fini ou non, son nombre de requêtes, sa création. */
export type LotRecent = { id: string; fini: boolean; requetes: number; creeLe: Date };

/**
 * Le délai d’un appel à l’API des lots : `court` sur le chemin d’une requête (sa fiche ouverte, le chat : la personne
 * attend), sinon celui du passage des 5 minutes.
 */
export type Presse = { court?: boolean };

/**
 * Ce qui envoie un lot au prestataire et le suit : le SDK (lotsSDK), le modèle factice (ses réponses tout de suite, sans
 * rien envoyer), ou un faux dans les tests (definirFournisseurDeLots). `envoyer` rend l’identifiant du lot ; `resultats`,
 * l’issue de chaque requête une fois le lot fini, avec l’identifiant de sa tâche (null : une requête qui n’est pas à
 * nous) ; `effacer` le retire de chez le prestataire, ses réponses avec ; `recents`, les lots de l’espace de travail créés
 * depuis `depuis`, les plus récents d’abord (le ménage).
 */
export type FournisseurDeLots = {
  envoyer: (requetes: { id: string; demande: Demande }[]) => Promise<string>;
  etat: (lot: string, o?: Presse) => Promise<EtatDuLot>;
  resultats: (lot: string, o?: Presse) => Promise<{ id: string | null; issue: IssueDuLot }[]>;
  annuler: (lot: string, o?: Presse) => Promise<void>;
  effacer: (lot: string, o?: Presse) => Promise<void>;
  recents: (depuis: Date) => Promise<LotRecent[]>;
  /** Un prestataire qui ne coûte rien (le modèle factice) : ses réponses ne sont pas notées au suivi des coûts. */
  gratuit?: boolean;
};

/** Ce qui précède l’identifiant de la tâche dans celui de sa requête (custom_id, 64 caractères au plus : 46 avec un uuid). */
const PREFIXE_DES_LOTS = "blush-maj-";

/** Au passage des 5 minutes : 20 s par appel à l’API des lots, et un nouvel essai. */
const OPTIONS_LOTS = { timeout: 20_000, maxRetries: 1 };
/**
 * L’envoi d’un lot : un seul essai (un nouvel essai après une réponse perdue enverrait un second lot, payé lui aussi), et
 * 20 s au plus : la tâche prise pour l’envoyer ne passe pas pour abandonnée entre-temps (PERIME_S, 90 s).
 */
const OPTIONS_ENVOI = { timeout: 20_000, maxRetries: 0 };
/** Sur le chemin d’une requête : 5 s, sans nouvel essai ; sans réponse, la mise à jour part en direct. */
const OPTIONS_COURTES = { timeout: 5_000, maxRetries: 0 };
const optionsDesLots = ({ court = false }: Presse = {}) => (court ? OPTIONS_COURTES : OPTIONS_LOTS);

/**
 * Une erreur de l’envoi qui peut passer (trop de requêtes, le prestataire surchargé ou en panne, la connexion coupée ou
 * trop lente) : la mise à jour retente au passage suivant au lieu de partir en direct, à plein tarif. Une connexion coupée
 * a pu laisser le lot partir sans que sa réponse arrive : le ménage le reconnaîtra (son identifiant), puis l’effacera.
 */
export const erreurPassagere = (e: unknown): boolean =>
  e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;

/** L’issue d’une requête d’un lot, telle que le SDK la rend. */
function issueDe(r: Anthropic.Messages.MessageBatchResult): IssueDuLot {
  if (r.type === "succeeded") return { type: "succeeded", message: r.message };
  if (r.type === "errored") return { type: "errored", code: r.error.error.type };
  return { type: r.type };
}

/**
 * Le vrai prestataire des lots, par le client de son SDK (`client` : un client au faux `fetch` dans tests/unit/lots.test.ts),
 * sur l’API des lots sans bêta (`messages.batches`) : les paramètres de chaque requête sont ceux du direct, tels quels.
 */
export function lotsSDK(client: () => Anthropic): FournisseurDeLots {
  return {
    async envoyer(requetes) {
      const lot = await client().messages.batches.create(
        { requests: requetes.map(({ id, demande }) => ({ custom_id: `${PREFIXE_DES_LOTS}${id}`, params: demande.params })) },
        OPTIONS_ENVOI,
      );
      return lot.id;
    },
    async etat(lot, o) {
      try {
        return (await client().messages.batches.retrieve(lot, {}, optionsDesLots(o))).processing_status === "ended" ? "fini" : "en_cours";
      } catch (e) {
        if (e instanceof Anthropic.NotFoundError) return "introuvable";
        throw e;
      }
    },
    async resultats(lot, o) {
      const lus: { id: string | null; issue: IssueDuLot }[] = [];
      for await (const r of await client().messages.batches.results(lot, {}, optionsDesLots(o)))
        lus.push({ id: r.custom_id.startsWith(PREFIXE_DES_LOTS) ? r.custom_id.slice(PREFIXE_DES_LOTS.length) : null, issue: issueDe(r.result) });
      return lus;
    },
    async annuler(lot, o) {
      await client().messages.batches.cancel(lot, {}, optionsDesLots(o));
    },
    async effacer(lot, o) {
      try {
        await client().messages.batches.delete(lot, {}, optionsDesLots(o));
      } catch (e) {
        /* Déjà effacé (un passage coupé après l’effacement) : il n’y est plus, c’est ce qu’on voulait */
        if (!(e instanceof Anthropic.NotFoundError)) throw e;
      }
    },
    async recents(depuis) {
      const lus: LotRecent[] = [];
      /* Les plus récents d’abord, page après page : on s’arrête au premier créé avant `depuis` */
      for await (const b of client().messages.batches.list({ limit: 100 }, OPTIONS_LOTS)) {
        const creeLe = new Date(b.created_at);
        if (creeLe < depuis) break;
        const n = b.request_counts;
        lus.push({ id: b.id, fini: b.processing_status === "ended", requetes: n.processing + n.succeeded + n.errored + n.canceled + n.expired, creeLe });
      }
      return lus;
    },
  };
}

/**
 * Les lots du modèle factice (le dev et les tests, sans prestataire) : chaque requête a sa réponse factice dès l’envoi,
 * gardée par l’instance, et le lot est fini tout de suite. Rien à faire au ménage : aucun ne part ailleurs.
 */
function lotsFactices(prestataire: Fournisseur): FournisseurDeLots {
  const lots = new Map<string, { id: string; issue: IssueDuLot }[]>();
  return {
    gratuit: true,
    async envoyer(requetes) {
      const id = `lot_factice_${randomUUID()}`;
      const issues = await Promise.all(
        requetes.map(async ({ id: r, demande }) => ({
          id: r,
          issue: { type: "succeeded" as const, message: await prestataire.envoyer(demande, { timeout: 0, maxRetries: 0 }, { flux: false, ecoute: null }) },
        })),
      );
      lots.set(id, issues);
      return id;
    },
    etat: async (lot) => (lots.has(lot) ? "fini" : "introuvable"),
    resultats: async (lot) => lots.get(lot) ?? [],
    annuler: async () => {},
    effacer: async (lot) => void lots.delete(lot),
    recents: async () => [],
  };
}

const LOTS_SDK = lotsSDK(anthropic);
const LOTS_FACTICES = lotsFactices(MODELE_FACTICE);

let lotsDuTest: FournisseurDeLots | null = null;
/**
 * Pour les tests : un faux prestataire des lots, puis de nouveau celui de l’appli (`null`). Il passe avant le modèle
 * factice (à l’inverse de definirFournisseur) : les tests de la base, en mode factice, y décident de chaque issue.
 */
export function definirFournisseurDeLots(f: FournisseurDeLots | null) {
  lotsDuTest = f;
}
/** Le prestataire des lots : le faux d’un test, ou le modèle factice en mode factice (jamais le SDK), ou le SDK. */
const lots = () => lotsDuTest ?? (iaFactice() ? LOTS_FACTICES : LOTS_SDK);

/**
 * Envoie une requête en lot (son identifiant : `id`, celui de sa tâche) et rend l’identifiant du lot. Le budget du jour
 * est contrôlé avant, comme pour un appel direct (ErreurTache « budget »), avec ce que coûteront les lots déjà partis
 * (`reserve`) : leur coût n’est noté qu’à la lecture de leur réponse (lireLeResultat).
 */
export async function envoyerEnLot<S extends z.ZodType>(
  id: string,
  req: Requete,
  schema: S,
  { storyId, partie, reserve }: Pick<OptionsAppel, "storyId" | "partie"> & { reserve?: Reserve },
): Promise<string> {
  await controlerBudget({ storyId, ...(reserve ? { reserve } : {}) });
  return lots().envoyer([{ id, demande: { requete: req, partie: partie ?? null, params: parametres(req, schema) } }]);
}

/** Où en est ce lot chez le prestataire. */
export const etatDuLot = (lot: string, o?: Presse): Promise<EtatDuLot> => lots().etat(lot, o);
/** L’issue de chaque requête d’un lot fini. */
export const resultatsDuLot = (lot: string, o?: Presse) => lots().resultats(lot, o);
/** Annule un lot qui tourne : ce qui n’a pas commencé ne sera ni fait ni facturé ; ce qui est en cours peut encore finir. */
export const annulerLeLot = (lot: string, o?: Presse): Promise<void> => lots().annuler(lot, o);
/** Efface un lot fini de chez le prestataire, ses réponses avec : elles n’y restent pas 29 jours. */
export const effacerLeLot = (lot: string, o?: Presse): Promise<void> => lots().effacer(lot, o);
/** Les lots de l’espace de travail créés depuis `depuis`, les plus récents d’abord. */
export const lotsRecents = (depuis: Date): Promise<LotRecent[]> => lots().recents(depuis);

/**
 * La réponse d’une requête passée en lot, lue comme celle d’un appel direct (lireMessage) : sa sortie vérifiée par son
 * schéma, ou son refus. Son coût, à moitié prix, est noté au suivi (ai_usage, sous `etiquette`) et dans la dépense du
 * jour de qui paie (`payeur` : le compte de la conv à l’envoi, src/server/memoire-en-lot.ts), même quand la réponse ne
 * servira plus (sa tâche partie en direct entre-temps) : elle a été facturée. L’appelant ne la lit qu’une fois. `ms` : le
 * temps du lot, de l’envoi à la lecture.
 */
export async function lireLeResultat<S extends z.ZodType>(
  message: MessageRecu,
  schema: S,
  { storyId, payeur, etiquette, ms }: { storyId?: string; payeur: Payeur; etiquette: string; ms: number },
): Promise<Appel<z.infer<S>>> {
  if (!lots().gratuit)
    await noterUsage(message.usage, Math.round(cout(message.usage, message.model, { lot: true }) * 1e6), { storyId, payeur, tache: etiquette, ms, modele: message.model });
  const { appel } = lireMessage(message, schema, { lot: true });
  if (appel.refus) journal("refus du modèle", { tache: etiquette, categorie: appel.categorie ?? null, requete: message._request_id ?? null }, "alerte");
  return appel;
}
