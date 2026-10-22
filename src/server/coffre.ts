import "server-only";
import { z } from "zod";
import { estFaite, type Echange, type MemoireFaite } from "@prompts/lib/memoire";
import { GENRES_DU_HAUT } from "@/contenu/haut-du-paywall";
import type { Memoire, Plan, Rapport, Verdict } from "@prompts/lib/schemas";
import type { BlushAnswer, Chapter, ScoreRow, SoberReport, VocalLigne } from "@/types";
import { chiffrer, chiffrerCompresse, chiffrerOctets, dechiffrer, dechiffrerOctets } from "./chiffrement";
import { ErreurInvariant } from "./erreurs";
import type { Meta } from "./histoires";
import type { ConvEnMorceaux } from "./morceaux";
import type { VerdictPartage } from "./partages";
import type { Contexte, DonneesMemoire, DonneesRapport, DonneesVerdict, DonneesVocal } from "./stockage/types";

/*
 * Le coffre : tout ce qui entre chiffré dans la base, et en sort. Un registre dit ce que garde chaque colonne chiffrée
 * (src/server/db/schema.ts) : `ecrire(colonne, valeur)` n’accepte que cette forme, `lire(colonne, octets)` la rend.
 * Avant lui, chaque appelant de `dechiffrer<T>` choisissait T à la main : renommer un champ compilait, et cassait en
 * silence la lecture des lignes déjà en base.
 * Les formes qui ont déjà changé sont relues par un schéma zod : une ligne d’avant revient à la forme d’aujourd’hui
 * (ses valeurs par défaut), et une ligne qui n’a pas la forme attendue échoue ici, en le disant, plutôt que plus loin.
 * Les autres sont relues telles qu’`ecrire` les a écrites. Dans src, seul ce fichier chiffre et déchiffre
 * (chiffrement.ts ; la règle et ses dernières exceptions : eslint.config.mjs). Il ne dépend ni de la chaîne d’analyse
 * (analyse.ts) ni des écrans (donnees.ts) : les formes qu’ils se passent sont dans stockage/types.ts. Deux formes restent
 * chez le module qui les fait, et qui passe par le coffre en retour : Meta (histoires.ts) et VerdictPartage
 * (partages.ts). Des imports de types seulement, sans effet à l’exécution.
 */

/* ———— Ce que gardent les colonnes ———— */

/* Les formes que la chaîne et les écrans se passent vivent dans src/server/stockage/types.ts. */

/**
 * Ce qu’il a envoyé au chat : `texte`, ce que le modèle lit ; `lignes`, les messages de leur conv envoyés avec (un
 * export, des captures), gardés pour la suite du fil ; `affiche`, ce que l’historique réaffiche (« (3 captures) »).
 */
/** Ton message au chat : ce que BLUSH a lu, les lignes jointes, ce que l’historique réaffiche, et la clé de l’envoi (« Réessayer »). */
type MessageToi = { texte: string; lignes?: string[]; affiche?: string; cle?: string };
/**
 * La réponse de BLUSH au chat, et son résumé (ce que le fil des échanges suivants en garde). `alerte` : elle est sortie en
 * alerte ; verrouillée, elle montre alors les numéros d’urgence en clair (reponseMasquee). Absent avant le 21 octobre 2026.
 */
type MessageBlush = { reponse: BlushAnswer; resume: string; alerte?: true };

/**
 * Le registre : pour chaque colonne chiffrée, la forme de ce qu’elle garde. `chat_messages.data` garde ton message ou
 * la réponse de BLUSH, selon le rôle de la ligne : une entrée pour chacun.
 */
export type Formes = {
  "stories.meta": Meta;
  /** La conv brute, telle qu’importée (effacée une fois la mémoire écrite) : son texte, ou ses morceaux (src/server/morceaux.ts). */
  "stories.conv": string | ConvEnMorceaux;
  "stories.context": Contexte;
  "verdicts.data": DonneesVerdict;
  /** Le plan du rapport (prompt 05, première étape), le temps que les chapitres s’écrivent. */
  "reports.plan": Plan;
  "reports.data": DonneesRapport;
  /** Les chapitres déjà finis, le temps que le rapport s’écrive (src/server/analyse.ts, rapportChapitres). */
  "reports.partiel": Chapter[];
  "memories.data": DonneesMemoire;
  "chat_messages.data:toi": MessageToi;
  "chat_messages.data:blush": MessageBlush;
  /** L’entrée d’une tâche : les échanges qui mettent la mémoire à jour (memoire_maj, la seule qui en a une), dans l’ordre. */
  "tasks.input": Echange[];
  "shares.data": VerdictPartage;
  "vocals.data": DonneesVocal;
  /** L’email de la liste d’attente, en minuscules (src/server/attente.ts). */
  "waitlist.email": string;
  /** Le secret du lien d’une conv de tournage (src/server/tournage.ts), que /admin remontre. */
  "tournages.cle": string;
};
export type Colonne = keyof Formes;

/* ———— Les formes qui ont changé ———— */

/*
 * Ce que le modèle a écrit (un verdict, un rapport, une mémoire) a été vérifié par son schéma de sortie quand il l’a
 * écrit (prompts/lib/schemas.ts). Ces schémas changent avec les prompts, et une mémoire d’avant doit rester lisible :
 * ici, on vérifie seulement que c’est un objet.
 */
const objet = <T>() => z.custom<T>((v) => typeof v === "object" && v !== null && !Array.isArray(v));

/*
 * stories.meta : ses champs n’ont été qu’ajoutés, tous facultatifs (les captures, une conv coupée, ceux de « Qui
 * es-tu ? »), et ses unions élargies (l’appli, le format). On vérifie les participants, que tout le code lit, et les
 * champs ajoutés quand ils sont là ; leurs valeurs sont vérifiées à l’écriture (les routes).
 */
const participantGarde = z.looseObject({ nom: z.string(), prenom: z.string(), pronomLu: z.string().optional() });
const MetaGardee = z
  .looseObject({
    /* Toujours deux (l’import n’en écrit jamais d’autre nombre) : les lecteurs prennent l’un et l’autre sans vérifier */
    participants: z.tuple([participantGarde, participantGarde]),
    captures: z.number().optional(),
    coupe: z.boolean().optional(),
    moi: z.literal([0, 1]).optional(),
    pronom: z.string().optional(),
    devinette: z.string().optional(),
    objectif: z.string().optional(),
    pronomAutre: z.string().optional(),
    contact: z.literal([0, 1]).optional(),
    /* Une conv en plusieurs morceaux (src/server/morceaux.ts, depuis le 22 octobre) : leur résumé, que l’écran de l’histoire réunie lit */
    morceaux: z.array(z.looseObject({ appli: z.string(), fichier: z.string(), resume: z.looseObject({ debut: z.string(), fin: z.string(), total: z.number() }) })).optional(),
    doublons: z.number().optional(),
  })
  .pipe(z.custom<Meta>());

const ContexteGarde = z
  .looseObject({
    chiffres: z.string(),
    style: z.string(),
    fin: z.string(),
    /* Avant le 7 octobre : absent (rempli plus bas) */
    dernier: z.number().optional(),
    /* Avant le 8 octobre : absentes, la lecture n’en montre aucune */
    trouvailles: z.array(z.string()).default(() => []),
    /* Avant le 17 octobre : absent, l’achat ne compte pour aucun titre */
    accroche: z.enum(GENRES_DU_HAUT).optional(),
  })
  /* Sans `dernier`, les messages ajoutés repartent de la fin du jour du dernier message (`fin`, sans fuseau comme lui) */
  .transform((c) => ({ ...c, dernier: c.dernier ?? Date.parse(`${c.fin}T23:59:59Z`) }));

const MemoireGardee = z.looseObject({
  /*
   * Faite (sa mémoire et sa fiche) : la création refuse une sortie sans elles (« memoire_vide », analyse.ts). Vérifié
   * ici, une fois pour tous ses lecteurs (le chat, sa mise à jour, la fiche), qui n’ont plus à le faire
   */
  etat: z.custom<MemoireFaite>((v) => typeof v === "object" && v !== null && !Array.isArray(v) && estFaite(v as Memoire)),
  lignes: z.array(z.tuple([z.string(), z.string()])),
  suivant: z.number(),
  /*
   * Absentes d’une fiche jamais corrigée à la main, et de toute mémoire écrite avant le chat (le 7 octobre). Pas de
   * valeur par défaut : l’absence se garde telle quelle (une mise à jour ne les écrit pas vides, et le modèle ne
   * reçoit pas de corrections vides) ; chaque lecteur la lit comme « rien corrigé ».
   */
  editions: z.looseObject({ parToi: z.array(z.string()), supprimees: z.array(z.string()) }).optional(),
  /* Une mémoire de secours (src/server/secours.ts) ; absent de toute autre, et de toute mémoire écrite avant le 13 octobre */
  secours: z.literal(true).optional(),
});

/*
 * Le verdict suit le prompt 04 : on vérifie que c’est un objet. Avant le 13 octobre, il n’avait pas les titres des
 * chapitres fermés (`titres`, absents) : ils se relisent null, et ces chapitres gardent leurs titres d’attente.
 */
const VerdictGarde = z
  .looseObject({ sortie: objet<Verdict>(), scores: z.array(objet<ScoreRow>()) })
  .transform((v) => ({ ...v, sortie: { ...v.sortie, titres: v.sortie.titres ?? null } }));

/* Le rapport suit le prompt 05 (sa sortie, ses blocs) : on vérifie ce que les écrans et le vocal lisent sans le modèle */
const RapportGarde = z.looseObject({
  sortie: objet<Rapport>(),
  chapitres: z.array(objet<Chapter>()),
  sobre: objet<SoberReport>().nullable(),
  lecture: z.looseObject({ free: z.string(), full: z.string() }),
});

/* Avant le 22 octobre 2026 (la mise à jour groupée, src/server/memoire-groupee.ts) : un seul échange par tâche */
const EntreeGardee = z.union([z.array(objet<Echange>()), objet<Echange>().transform((e) => [e])]);

const VocalGarde = z.looseObject({
  sobre: z.boolean(),
  lignes: z.array(objet<VocalLigne>()),
  /* Avant le 8 octobre (le script sans phrases complètes, les messages cités pas annoncés) : absente, c’est la version 1 */
  version: z.number().default(1),
});

/** Comment se garde une colonne : compressée avant d’être chiffrée (la conv brute), relue par un schéma (les formes qui ont changé). */
type Regle<T> = { compressee?: true; relecture?: z.ZodType<T> };

const REGISTRE: { [C in Colonne]: Regle<Formes[C]> } = {
  "stories.meta": { relecture: MetaGardee },
  "stories.conv": { compressee: true },
  "stories.context": { relecture: ContexteGarde },
  "verdicts.data": { relecture: VerdictGarde },
  "reports.plan": {},
  "reports.data": { relecture: RapportGarde },
  "reports.partiel": {},
  "memories.data": { relecture: MemoireGardee },
  "chat_messages.data:toi": {},
  "chat_messages.data:blush": {},
  "tasks.input": { relecture: EntreeGardee },
  "shares.data": {},
  "vocals.data": { relecture: VocalGarde },
  "waitlist.email": {},
  "tournages.cle": {},
};

/** Les colonnes d’audio (des MP3) : chiffrées telles quelles, sans JSON (ecrireAudio, lireAudio). */
const AUDIOS = ["vocals.audio", "chat_vocals.audio"];

/** Toutes les colonnes que le coffre connaît (tests/unit/coffre.test.ts les compare aux colonnes chiffrées du schéma). */
export const COLONNES = [...Object.keys(REGISTRE), ...AUDIOS];

/* ———— Lire, écrire ———— */

/** Ce que garde la colonne, chiffré : la valeur ne peut avoir que la forme de la colonne. */
export function ecrire<C extends Colonne>(colonne: C, valeur: Formes[C]): Buffer {
  return REGISTRE[colonne].compressee ? chiffrerCompresse(valeur) : chiffrer(valeur);
}

/**
 * Ce que garde la colonne, déchiffré, dans sa forme d’aujourd’hui. Une ligne qui n’a pas la forme attendue lève une
 * erreur qui nomme la colonne et les champs en cause, jamais leur contenu (elle finit dans les logs).
 */
export function lire<C extends Colonne>(colonne: C, octets: Buffer | Uint8Array): Formes[C] {
  /* Le seul endroit où le type de ce qu’on déchiffre est affirmé : celui de la colonne, qu’`ecrire` a imposé */
  const valeur = dechiffrer<Formes[C]>(octets);
  const relecture = REGISTRE[colonne].relecture;
  if (!relecture) return valeur;
  const lue = relecture.safeParse(valeur);
  if (lue.success) return lue.data;
  throw new ErreurInvariant(`${colonne}:forme_inattendue`, `${colonne} : forme inattendue (${lue.error.issues.map((i) => i.path.join(".") || "racine").join(", ")})`);
}

/** Un audio (vocals.audio, chat_vocals.audio), chiffré. */
export const ecrireAudio = (audio: Buffer): Buffer => chiffrerOctets(audio);

/** Un audio (vocals.audio, chat_vocals.audio), déchiffré. */
export const lireAudio = (chiffre: Buffer | Uint8Array): Buffer => dechiffrerOctets(chiffre);
