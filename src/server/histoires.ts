import "server-only";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import {
  detecterFormat,
  erreurImport,
  lire,
  MIN_MESSAGES,
  MIN_MESSAGES_CAPTURES,
  participantsDe,
  principaux,
  type Devinette,
  type Format,
  type Histoire,
  type Message,
  type Objectif,
  type Pronom,
  type Provenance,
} from "@prompts/lib/conv";
import { nomsDistincts, prenomDe, prenomEcrit } from "@prompts/lib/noms";
import type { Appli, ExportLu } from "@prompts/lib/export";
import type { TexteCaptures } from "@prompts/lib/captures";
import { doutePrenom, nomLu } from "@/lib/participants";
import { pronomDeLAutre, pronomsLus } from "./accords";
import { empreinte, jeton } from "./chiffrement";
import * as coffre from "./coffre";
import { db, schema, uneLigne } from "./db";
import { PREDICATS } from "./depot";
import type { Utilisateur } from "./auth";
import { ErreurInvariant, ErreurPublique } from "./erreurs";
import { borner, ErreurImport, TEXTE_LU_MAX_CARACTERES } from "./import";
import { journal } from "./journal";
import type { Consentement } from "./juridique";
import {
  contactDuFichier,
  lectureReunie,
  MOI,
  MORCEAUX_MAX,
  ErreurMorceau,
  relier,
  type ConvEnMorceaux,
  type Identite,
  type Morceau,
  type MorceauRecu,
  type QuiLit,
} from "./morceaux";

/*
 * Les histoires en base : le brouillon d’un import, la conv ouverte, « Qui es-tu ? », l’effacement. L’import d’un export
 * (le fichier, le paquet, leurs bornes) vit dans import.ts, la conv telle que l’affiche le front dans conv-affichee.ts.
 */

/** Le nom d’un des deux participants, tel que l’export l’écrit. */
const NOM_MAX = 100;

/**
 * L’un des deux participants d’une conv : son prénom, son nom dans l’export, combien de messages il y a écrits, et le
 * pronom que ses accords laissent lire, quand la conv le dit nettement (pronomsLus, src/server/accords.ts).
 */
export type Participant = { nom: string; prenom: string; messages: number; pronomLu?: Pronom };

/** Ce qu’on sait d’une histoire, chiffré dans `stories.meta`. */
export type Meta = {
  /** L’appli d’où vient la conv : un export (WhatsApp, Instagram), ou des captures (Instagram, Hinge, iMessage, autre). */
  appli: Appli | "hinge" | "imessage" | "autre";
  format: Format;
  fichier: string;
  /**
   * Les deux participants, du plus bavard au moins bavard, avec leur nom dans l’export. Toujours deux : l’import refuse
   * un groupe et une conv à une voix (importer), des captures en ont deux (« Moi » et l’autre), et le coffre vérifie
   * qu’une meta lue en a bien deux (src/server/coffre.ts).
   */
  participants: [Participant, Participant];
  resume: { debut: string; fin: string; total: number; vocaux: number };
  /** Des captures : combien. L’utilisateur y est « Moi » (à droite), son prénom vient de « Qui es-tu ? ». */
  captures?: number;
  /** L’export était trop long pour partir en entier : seule sa partie la plus récente a été gardée (de `resume.debut` à la fin). */
  coupe?: boolean;
  /**
   * Une longue vidéo lue en partie avant l’achat (src/server/lecture-partielle.ts) : seule sa partie la plus récente est
   * lue, le reste de ses écrans attend le paiement (src/server/suite-video.ts, qui l’efface une fois la conv complétée).
   * Ce que l’écran de l’import en dit (« le début sera lu avec ton rapport »), rien de plus.
   */
  suiteVideo?: boolean;
  /** Rempli sur « Qui es-tu ? » : l’index de l’utilisateur dans `participants`, son pronom, sa devinette, son objectif. */
  moi?: 0 | 1;
  pronom?: Pronom;
  devinette?: Devinette;
  objectif?: Objectif;
  /** Choisi sur sa fiche : le pronom de l’autre, qui passe devant celui que la conv laisse lire (pronomDeLAutre, src/server/accords.ts). */
  pronomAutre?: Pronom;
  /**
   * L’autre personne, quand un nom la désigne avant « Qui es-tu ? » : le haut des captures, le nom du fichier WhatsApp
   * (« Discussion WhatsApp avec Léa »). Un morceau ajouté doit être avec elle (src/server/morceaux.ts, relier).
   */
  contact?: 0 | 1;
  /**
   * Une conv réunie de plusieurs morceaux (src/server/morceaux.ts), dans l’ordre de leur import : ce que chacun contenait,
   * pour l’écran de l’histoire réunie. La conv brute les garde un à un. `appli`, `fichier` et `format` sont alors ceux de
   * la conv entière : l’appli et le fichier du premier morceau, et « captures » dès qu’un morceau en est (la lecture
   * compte alors à partir de MIN_MESSAGES_CAPTURES), sinon le format du premier export. `resume` compte la conv réunie.
   */
  morceaux?: MorceauMeta[];
  /** Plusieurs morceaux : les messages vus dans deux morceaux, gardés une fois. */
  doublons?: number;
};

/** Ce que la meta dit d’un morceau : d’où il vient (des captures : combien), et ce qu’il contenait, doublons compris. */
export type MorceauMeta = Pick<Meta, "appli" | "fichier" | "resume"> & Pick<Meta, "captures" | "coupe" | "suiteVideo">;

/** L’histoire telle qu’en base, avec la conv brute (chiffrée, jusqu’à plusieurs Mo) : pour la chaîne d’analyse (pipeline.ts, executer). */
export type LigneComplete = typeof schema.stories.$inferSelect;
/**
 * Une histoire, sans sa conv brute (ni `status`, que rien ne lit) : ce dont ont besoin le chat, le partage, la fiche, le
 * vocal… Une ligne complète comme une ligne d’écran s’y passe.
 */
export type Ligne = Omit<LigneComplete, "conv" | "status">;
/** Ce que lisent les écrans et les routes : la ligne sans la conv, et si elle est encore en base (`aConv`). */
export type LigneEcran = Ligne & { aConv: boolean };

/** Le résumé d’une conv lue (au moins un message) : son premier et son dernier jour, ses messages, dont ses vocaux. */
export function resumeDe(messages: Message[]): Meta["resume"] {
  const [premier] = messages;
  const dernier = messages.at(-1);
  /* erreurImport refuse une conv sans message avant d’arriver ici */
  if (!premier || !dernier) throw new ErreurInvariant("conv:sans_message", "une conv lue a au moins un message");
  return {
    debut: new Date(premier.t).toISOString().slice(0, 10),
    fin: new Date(dernier.t).toISOString().slice(0, 10),
    total: messages.length,
    vocaux: messages.filter((m) => m.media === "vocal").length,
  };
}

/** Une transaction de la base (db().transaction), telle que la reçoit son travail. */
export type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/**
 * Ce qui naît avec un brouillon, dans la même transaction (`avec`, la suite d’une longue vidéo, src/server/suite-video.ts) :
 * si elle échoue, le brouillon n’existe pas non plus.
 */
type AvecLeBrouillon = (tx: Transaction, id: string) => Promise<void>;

/**
 * L’histoire brouillon d’un import (un export ou des captures), avant l’email : sa meta et sa conv brute, chiffrées, et
 * l’accord de son import (src/server/juridique.ts). Le cookie du brouillon la retrouve par l’empreinte de `secret`.
 */
async function creerBrouillon(meta: Meta, texte: string, secret: string, consentement: Consentement, avec?: AvecLeBrouillon): Promise<{ id: string; meta: Meta; secret: string }> {
  const creer = async (tx: Transaction | ReturnType<typeof db>) =>
    uneLigne(
      await tx
        .insert(schema.stories)
        .values({
          draftToken: empreinte(secret),
          messageCount: meta.resume.total,
          meta: coffre.ecrire("stories.meta", meta),
          conv: coffre.ecrire("stories.conv", texte),
          consentementLe: consentement.le,
          consentementVersion: consentement.version,
        })
        .returning({ id: schema.stories.id }),
      "stories:brouillon_cree",
    );
  const ligne = avec
    ? await db().transaction(async (tx) => {
        const l = await creer(tx);
        await avec(tx, l.id);
        return l;
      })
    : await creer(db());
  return { id: ligne.id, meta, secret };
}

/** Un export lu, prêt à devenir une conv ou l’un de ses morceaux : son texte borné, son format, ses deux participants (le plus bavard d’abord). */
function exportLu(recu: ExportLu & { nom: string; coupe?: boolean }) {
  const { nom, appli, texte, coupe } = borner(recu);
  const format = detecterFormat(texte);
  if (format === "captures" || !format) throw new ErreurImport("fichier");
  /* Un nom qui n’apparaît qu’à peine (un message collé d’un autre) ne fait pas une conv de groupe : ses lignes restent du texte */
  const noms = principaux(participantsDe(texte));
  const [premier, second] = noms;
  if (noms.length > 2) throw new ErreurImport("groupe");
  if (!premier || !second) throw new ErreurImport("courte");
  /* Un nom de contact est court : un nom démesuré (ou fait de caractères de contrôle) gonflerait ce qu’on garde de la conv */
  if (noms.some((n) => n.nom.length > NOM_MAX || /[\u0000-\u001f\u007f]/.test(n.nom))) throw new ErreurImport("fichier");
  /* « Discussion WhatsApp avec Léa » : le nom du fichier désigne l’autre (Instagram nomme le compte, pas la conv) */
  const contact = appli === "whatsapp" ? contactDuFichier(nom, [premier.nom, second.nom]) : undefined;
  return { nom, appli, texte, coupe, format, premier, second, contact };
}

/**
 * Lit l’export et crée une histoire brouillon (avant l’email). `secret` part dans le cookie du brouillon. Le texte est
 * borné ici aussi (import.ts, borner) : depuisFichier et depuisPaquet l’ont fait, un autre appelant n’y échappe pas.
 * Une conv courte reste un brouillon : on peut lui ajouter le début (ajouterUnExport, ajouterDesCaptures), et sa lecture
 * ne part qu’assez longue (tropCourte, POST /api/analyse).
 */
export async function importer(recu: ExportLu & { nom: string; coupe?: boolean }, consentement: Consentement): Promise<{ id: string; meta: Meta; secret: string }> {
  const { nom, appli, texte, coupe, format, premier, second, contact } = exportLu(recu);
  const personne = ({ nom }: { nom: string }) => ({ prenom: prenomDe(nom), pronom: "il" as const, nomExport: nom });
  const participant = ({ nom, messages }: { nom: string; messages: number }, pronomLu?: Pronom): Participant => ({
    nom,
    prenom: prenomDe(nom),
    messages,
    ...(pronomLu ? { pronomLu } : {}),
  });
  const lu = lire(texte, { utilisateur: personne(premier), autre: personne(second), format }, { autresEnTexte: true });
  /* Des lignes marquées jetées sans être reconnues : peut-être un libellé qu’on ne sait pas lire (des vocaux perdus). Leur silhouette seule, sans aucune lettre : jamais un mot d’un message */
  if (lu.inconnues.lignes) journal("import : lignes marquées inconnues", { format, lignes: lu.inconnues.lignes, forme: lu.inconnues.forme }, "alerte");
  if (erreurImport(lu) === "groupe") throw new ErreurImport("groupe");
  /* Le premier participant est lu en « toi », le second en « autre » */
  const lus = pronomsLus(lu.messages);
  const meta: Meta = {
    appli,
    format,
    fichier: nom.slice(0, 200),
    participants: [participant(premier, lus.toi), participant(second, lus.autre)],
    resume: resumeDe(lu.messages),
    ...(coupe ? { coupe: true } : {}),
    ...(contact === undefined ? {} : { contact: contact === premier.nom ? 0 : 1 }),
  };
  return creerBrouillon(meta, texte, jeton(), consentement);
}

/**
 * Des captures, lues par le prompt 01 (src/server/captures.ts) : une histoire brouillon, comme un export. `secret` :
 * celui du cookie du brouillon, quand il est tiré de la clé de l’envoi (src/server/captures.ts, reprise).
 */
export async function importerCaptures({
  appli,
  t,
  secret = jeton(),
  consentement,
  suite,
}: {
  appli: Meta["appli"];
  t: TexteCaptures;
  secret?: string;
  consentement: Consentement;
  /**
   * La suite d’une longue vidéo lue en partie (src/server/ecrans-gardes.ts, rattacherLaSuite) : elle naît avec le
   * brouillon, dans sa transaction, et sa meta le dit (`suiteVideo`).
   */
  suite?: AvecLeBrouillon;
}): Promise<{ id: string; meta: Meta; secret: string }> {
  const lu = lectureDesCaptures(t);
  /* Courtes, elles restent un brouillon, comme un export : on peut leur ajouter un morceau (tropCourte) */
  if (erreurImport(lu, "captures") === "groupe") throw new ErreurImport("groupe");
  const meta: Meta = {
    appli,
    format: "captures",
    ...comptesDesCaptures(t, lu.messages, [MOI, prenomDe(t.autre)]),
    ...(suite ? { suiteVideo: true } : {}),
    moi: 0,
  };
  return creerBrouillon(meta, t.texte, secret, consentement, suite);
}

/** Des captures (ou un enregistrement) au format « captures », relues : l’utilisateur en « Moi », l’autre sous le nom lu en haut. */
function lectureDesCaptures(t: TexteCaptures) {
  const personne = (nom: string) => ({ prenom: nom, pronom: "il" as const, nomExport: nom });
  return lire(t.texte, { utilisateur: personne(MOI), autre: personne(t.autre), format: "captures" });
}

/** Ce que la meta d’une conv de captures dit de ses messages : son fichier, ses captures, ses deux participants (leurs prénoms donnés) et son résumé. */
function comptesDesCaptures(t: TexteCaptures, messages: Message[], [prenomMoi, prenomAutre]: [string, string]): Pick<Meta, "fichier" | "captures" | "participants" | "resume"> {
  const compte = (nom: string) => messages.filter((m) => m.nom === nom).length;
  const lus = pronomsLus(messages);
  return {
    fichier: `${t.captures} captures`,
    captures: t.captures,
    participants: [
      { nom: MOI, prenom: prenomMoi, messages: compte(MOI), ...(lus.toi ? { pronomLu: lus.toi } : {}) },
      { nom: t.autre, prenom: prenomAutre, messages: compte(t.autre), ...(lus.autre ? { pronomLu: lus.autre } : {}) },
    ],
    resume: resumeDe(messages),
  };
}

/** Une meta (ou celle d’un morceau) sans ce qui dit qu’une suite de vidéo l’attend. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- écartée
const sansLaSuite = <T extends { suiteVideo?: boolean }>({ suiteVideo, ...reste }: T): Omit<T, "suiteVideo"> => reste;

/**
 * La conv d’une longue vidéo lue en partie avant l’achat, complétée après le paiement (src/server/suite-video.ts) : son
 * texte devient `t`, la vidéo lue en entier, et sa meta se recompte comme à l’import (ses captures, ses participants, son
 * résumé), en gardant ce que « Qui es-tu ? » y a mis (qui est qui, les prénoms, le pronom, la devinette, l’objectif). Un
 * morceau ajouté depuis (src/server/morceaux.ts) : seul le premier, la vidéo, change, et la conv réunie se recompte
 * (metaReunie). Dans la transaction de l’appelant, sur sa ligne verrouillée. Rend la meta écrite, ou null : plus de conv
 * (effacée, une prise du mode tournage).
 */
export async function completerLaConv(tx: Transaction, storyId: string, t: TexteCaptures): Promise<Meta | null> {
  const [ligne] = await tx.select({ meta: schema.stories.meta, conv: schema.stories.conv }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");
  if (!ligne?.conv) return null;
  const avant = metaDe(ligne);
  const brute = coffre.lire("stories.conv", ligne.conv);
  const lu = lectureDesCaptures(t);
  /* Les prénoms de « Qui es-tu ? » restent, par la place de chaque participant (l’autre garde le nom de l’import) */
  const comptes = comptesDesCaptures(t, lu.messages, [avant.participants[0].prenom, avant.participants[1].prenom]);
  let conv: string | ConvEnMorceaux = t.texte;
  /* La vidéo est entière : sa meta ne dit plus qu’une suite l’attend (suiteVideo) */
  let meta: Meta = { ...sansLaSuite(avant), ...comptes };
  if (typeof brute !== "string") {
    const [premier, ...autres] = brute.morceaux;
    if (!premier) return null;
    conv = { morceaux: [{ ...premier, texte: t.texte, empreinte: empreinte(t.texte) }, ...autres] };
    /* Après le paiement, « Qui es-tu ? » est rempli : qui est « Moi » est connu, comme à la lecture (relire, src/server/analyse.ts) */
    const reunie = metaReunie(avant, conv, identiteDe(avant), { k: avant.moi ?? 0, connu: true });
    const [m0, ...suite] = avant.morceaux ?? [];
    const parMorceau = reunie.parMorceau[0];
    /* Le fichier de la conv entière est celui de son premier morceau : la vidéo, maintenant lue en entier */
    meta = {
      ...reunie.meta,
      fichier: comptes.fichier,
      morceaux:
        m0 && parMorceau?.length ? [{ ...sansLaSuite(m0), fichier: comptes.fichier, captures: comptes.captures, resume: resumeDe(parMorceau) }, ...suite] : (avant.morceaux ?? []),
    };
  }
  await tx
    .update(schema.stories)
    .set({ conv: coffre.ecrire("stories.conv", conv), meta: coffre.ecrire("stories.meta", meta), messageCount: meta.resume.total, updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));
  return meta;
}

/* ———— Une conv en plusieurs morceaux ———— */

/** Le minimum de messages d’une conv pour sa lecture : moins sur des captures, qui en montrent moins (prompts/lib/conv.ts). */
const minimumDe = (meta: Pick<Meta, "format">) => (meta.format === "captures" ? MIN_MESSAGES_CAPTURES : MIN_MESSAGES);
/** Une conv encore trop courte pour sa lecture : elle reste un brouillon, qu’un morceau ajouté peut compléter. */
export const tropCourte = (meta: Pick<Meta, "format" | "resume">) => meta.resume.total < minimumDe(meta);

/** La conv d’un seul morceau, devenue le premier de ses morceaux : ses noms, dans l’ordre de ses participants. */
const premierMorceau = (meta: Meta, texte: string): Morceau => ({
  format: meta.format,
  texte,
  noms: [meta.participants[0].nom, meta.participants[1].nom],
  empreinte: empreinte(texte),
});

/** La meta d’une conv d’un seul morceau, devenue celle de son premier morceau. */
const morceauMetaDe = ({ appli, fichier, resume, captures, coupe, suiteVideo }: Meta): MorceauMeta => ({
  appli,
  fichier,
  resume,
  ...(captures ? { captures } : {}),
  ...(coupe ? { coupe } : {}),
  ...(suiteVideo ? { suiteVideo } : {}),
});

/** Ce que la meta sait de qui est qui : les noms des participants, celui qui importe (des captures seules), l’autre (désigné par un nom). */
const identiteDe = (meta: Meta): Identite => ({
  noms: [meta.participants[0].nom, meta.participants[1].nom],
  ...(meta.moi != null && meta.format === "captures" && !meta.morceaux?.some((m) => !m.captures) ? { moi: meta.moi } : {}),
  ...(meta.contact === undefined ? {} : { contact: meta.contact }),
});

/**
 * La meta d’une conv réunie : ses morceaux relus ensemble (lectureReunie), toi au participant `qui.k`. Les participants
 * prennent les noms de l’identité, gardent le prénom qu’on leur connaissait (celui de « Qui es-tu ? », sur des
 * captures), et se recomptent ; le résumé et les doublons sont ceux de la conv réunie. `morceaux` reste celui de
 * `avant` (l’ajout y met le nouveau). Rend aussi ce que chaque morceau apporte (`gardes`) et ses messages lus (`parMorceau`).
 */
function metaReunie(avant: Meta, conv: ConvEnMorceaux, id: Identite, qui: QuiLit) {
  const personne = (nom: string) => ({ prenom: prenomDe(nom), pronom: "il" as const, nomExport: nom });
  const lu = lectureReunie(conv, { utilisateur: personne(id.noms[qui.k]), autre: personne(id.noms[qui.k === 0 ? 1 : 0]) }, qui);
  const lus = pronomsLus(lu.messages);
  const participant = (k: 0 | 1): Participant => {
    const nom = id.noms[k];
    const role = k === qui.k ? "toi" : "autre";
    const pronomLu = lus[role];
    return {
      nom,
      prenom: avant.participants.find((p) => p.nom === nom)?.prenom ?? prenomDe(nom),
      messages: lu.messages.filter((m) => m.role === role).length,
      ...(pronomLu ? { pronomLu } : {}),
    };
  };
  /* Ce qu’une conv d’un seul morceau dit d’elle-même, que ses morceaux disent désormais un à un (ou que l’identité redit) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- écartés, puis redits plus bas
  const { captures, coupe, suiteVideo, moi, contact, ...reste } = avant;
  const meta: Meta = {
    ...reste,
    format: conv.morceaux.some((m) => m.format === "captures") ? "captures" : conv.morceaux[0]!.format,
    participants: [participant(0), participant(1)],
    resume: resumeDe(lu.messages),
    ...(avant.morceaux?.some((m) => m.coupe) ? { coupe: true } : {}),
    ...(id.moi === undefined ? {} : { moi: id.moi }),
    ...(id.contact === undefined ? {} : { contact: id.contact }),
    doublons: lu.doublons,
  };
  return { meta, gardes: lu.gardes, parMorceau: lu.parMorceau };
}

/**
 * Un morceau de plus pour le brouillon du cookie (`secret`) : relié à sa conv (relier, src/server/morceaux.ts, qui refuse
 * un morceau avec quelqu’un d’autre), puis la conv réunie se recompte. Avant « Qui es-tu ? » seulement : un brouillon
 * sans compte, qui a sa conv brute (pas un brouillon du mode tournage). Le même texte, ou le même envoi (`cle`, un
 * nouvel essai après une coupure), ne s’ajoute pas deux fois : la conv revient telle quelle. Au-delà de MORCEAUX_MAX, ou
 * de TEXTE_LU_MAX_CARACTERES pour tous les morceaux ensemble : « trop » ; un morceau qui n’apporte aucun message nouveau
 * (tout y est déjà) : « rien_de_neuf ».
 */
async function ajouterMorceau(secret: string, recu: MorceauRecu, info: Omit<MorceauMeta, "resume">): Promise<{ id: string; meta: Meta }> {
  return db().transaction(async (tx) => {
    /* Deux ajouts en même temps : l’un après l’autre, chacun sur la conv que l’autre a laissée */
    const [ligne] = await tx.select().from(schema.stories).where(duBrouillon(secret)).for("update");
    if (!ligne?.conv || ligne.tournageId) throw new ErreurPublique("aucune");
    const avant = metaDe(ligne);
    const brute = coffre.lire("stories.conv", ligne.conv);
    const conv: ConvEnMorceaux = typeof brute === "string" ? { morceaux: [premierMorceau(avant, brute)] } : brute;
    if (conv.morceaux.some((m) => m.empreinte === recu.empreinte || (recu.cle && m.cle === recu.cle))) return { id: ligne.id, meta: avant };
    /* Cinq morceaux au plus, et pas plus de texte, ensemble, qu’un seul export au plus gros : la lecture les relit tous à chaque étape */
    const texte = conv.morceaux.reduce((n, m) => n + m.texte.length, recu.texte.length);
    if (conv.morceaux.length >= MORCEAUX_MAX || texte > TEXTE_LU_MAX_CARACTERES) throw new ErreurMorceau("trop");
    const { morceaux, identite } = relier(conv, identiteDe(avant), recu);
    const reunie: ConvEnMorceaux = { morceaux };
    /* Avant « Qui es-tu ? » : toi est le participant 0, comme à l’import d’un seul morceau */
    const { meta: lue, parMorceau, gardes } = metaReunie(avant, reunie, identite, { k: 0, connu: false });
    if (!gardes.at(-1)) throw new ErreurMorceau("rien_de_neuf");
    const metas = [...(avant.morceaux ?? [morceauMetaDe(avant)]), { ...info, resume: resumeDe(parMorceau.at(-1)!) }];
    const meta: Meta = { ...lue, morceaux: metas, ...(metas.some((m) => m.coupe) ? { coupe: true } : {}) };
    await tx
      .update(schema.stories)
      .set({ meta: coffre.ecrire("stories.meta", meta), conv: coffre.ecrire("stories.conv", reunie), messageCount: meta.resume.total, updatedAt: new Date() })
      .where(eq(schema.stories.id, ligne.id));
    return { id: ligne.id, meta };
  });
}

/** Un autre export de leur conv, ajouté au brouillon du cookie (ajouterMorceau) : lu et borné comme un premier import. */
export async function ajouterUnExport(secret: string, recu: ExportLu & { nom: string; coupe?: boolean }): Promise<{ id: string; meta: Meta }> {
  const { nom, appli, texte, coupe, format, premier, second, contact } = exportLu(recu);
  const morceau: MorceauRecu = { format, texte, noms: [premier.nom, second.nom], empreinte: empreinte(texte), ...(contact ? { contact } : {}) };
  return ajouterMorceau(secret, morceau, { appli, fichier: nom.slice(0, 200), ...(coupe ? { coupe: true } : {}) });
}

/**
 * Des captures (ou un enregistrement d’écran) ajoutées au brouillon du cookie (ajouterMorceau), déjà lues par le prompt
 * 01. `cle` : celle de l’envoi, qu’un nouvel essai retrouve. Le nom lu en haut de la conv désigne l’autre.
 */
export async function ajouterDesCaptures(secret: string, { appli, t, cle }: { appli: Meta["appli"]; t: TexteCaptures; cle?: string | null }): Promise<{ id: string; meta: Meta }> {
  const morceau: MorceauRecu = {
    format: "captures",
    texte: t.texte,
    noms: [MOI, t.autre],
    empreinte: empreinte(t.texte),
    ...(cle ? { cle: empreinte(`ajout:${cle}`) } : {}),
    ...(nomLu(t.autre) ? { contact: t.autre } : {}),
  };
  return ajouterMorceau(secret, morceau, { appli, fichier: `${t.captures} captures`, captures: t.captures });
}

/**
 * Le morceau que cet envoi (`cle`) a déjà ajouté au brouillon (ajouterDesCaptures), et combien de messages il avait :
 * un nouvel essai après une coupure le retrouve (unSeulAjout, src/server/captures.ts). null : pas encore ajouté.
 */
export async function morceauDejaAjoute(secret: string, cle: string): Promise<{ id: string; meta: Meta; secret: string; messages: number } | null> {
  const [ligne] = await db().select({ id: schema.stories.id, meta: schema.stories.meta, conv: schema.stories.conv }).from(schema.stories).where(duBrouillon(secret));
  const brute = ligne?.conv ? coffre.lire("stories.conv", ligne.conv) : null;
  if (!ligne || !brute || typeof brute === "string") return null;
  const k = brute.morceaux.findIndex((m) => m.cle === empreinte(`ajout:${cle}`));
  const meta = metaDe(ligne);
  const morceau = meta.morceaux?.[k];
  return morceau ? { id: ligne.id, meta, secret, messages: morceau.resume.total } : null;
}

/** Les morceaux de la conv du brouillon déjà là (un, sans en avoir ajouté), et si l’on peut encore en ajouter un. */
export function morceauxDe(ligne: Pick<LigneEcran, "meta" | "aConv" | "tournageId" | "userId">): { nombre: number; ajout: boolean } {
  const nombre = metaDe(ligne).morceaux?.length ?? 1;
  return { nombre, ajout: ligne.aConv && !ligne.tournageId && !ligne.userId && nombre < MORCEAUX_MAX };
}

/**
 * Ce qui désigne une histoire : le brouillon (une conv importée, pas encore lue), la conv choisie dans « Tes convs »
 * (deux cookies), et la conv que montre la page d’où part la requête (`affichee`, l’en-tête ENTETE_CONV).
 */
export type Designation = { brouillon?: string; choisie?: string; affichee?: string | null };

/*
 * Les colonnes d’une ligne d’écran : tout sauf la conv brute, que le pilote recevrait en hexadécimal (deux fois sa
 * taille) à chaque page, appel et sondage. Aucun écran ne la lit : la chaîne d’analyse relit sa ligne elle-même.
 * Ni `status`, que plus rien ne lit (src/server/db/schema.ts) : sa migration de retrait ne touchera pas cette lecture.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- status est écartée, pas lue
const { conv, status, ...ecran } = getTableColumns(schema.stories);
const ECRAN = { ...ecran, aConv: PREDICATS.convGardee };

/** La conv brute est-elle encore en base ? (Une ligne d’écran le dit, une ligne complète l’a.) */
export const aSaConv = (ligne: LigneEcran | LigneComplete) => ("aConv" in ligne ? ligne.aConv : !!ligne.conv);

/** L’identifiant d’une histoire (un uuid) : ce qui n’en a pas la forme ne va pas jusqu’à la base. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Une histoire du compte a-t-elle été lue (sa lecture lancée) ? Les tâches restent après coup : leur présence suffit */
const { lue, convDuCompte } = PREDICATS;

/**
 * L’histoire ouverte.
 * - Un geste parti d’une page (un appel du navigateur) vise la conv que montre cette page (`affichee`).
 * - Le parcours d’import (`parcours`) regarde d’abord le brouillon : la conv qu’on est en train d’importer. Ailleurs
 *   (l’accueil, le rapport…), une conv importée puis laissée en plan ne prend pas la place de celle qu’on suit.
 * - Sinon, la conv du compte choisie dans « Tes convs » (si elle est bien à lui), ou la plus récente déjà lue.
 * Sans compte : le brouillon seul.
 */
export async function histoireOuverte(utilisateur: Utilisateur | null, { brouillon, choisie, affichee }: Designation, { parcours = false } = {}): Promise<LigneEcran | null> {
  if (brouillon && (parcours || !utilisateur)) {
    const ligne = await brouillonDe(brouillon);
    if (ligne || !utilisateur) return ligne;
  }
  if (!utilisateur) return null;
  /* La conv à l’écran : celle-là, ou rien (supprimée entre-temps, ou pas à ce compte). Jamais une autre à sa place */
  if (affichee && !parcours) {
    if (!UUID.test(affichee)) return null;
    const [ligne] = await db().select(ECRAN).from(schema.stories).where(convDuCompte(affichee, utilisateur.id));
    return ligne ?? null;
  }
  if (choisie && UUID.test(choisie)) {
    const [ligne] = await db().select(ECRAN).from(schema.stories).where(convDuCompte(choisie, utilisateur.id));
    if (ligne) return ligne;
  }
  const [ligne] = await db().select(ECRAN).from(schema.stories).where(eq(schema.stories.userId, utilisateur.id)).orderBy(desc(lue), desc(schema.stories.createdAt)).limit(1);
  return ligne ?? null;
}

/** La ligne du brouillon d’un cookie (`secret` : sa valeur), tant qu’il n’a pas de compte : la condition d’une requête. */
export const duBrouillon = (secret: string) => and(eq(schema.stories.draftToken, empreinte(secret)), isNull(schema.stories.userId));

/** Le brouillon d’un cookie, tant qu’il n’a pas de compte. */
export async function brouillonDe(secret: string): Promise<LigneEcran | null> {
  const [ligne] = await db().select(ECRAN).from(schema.stories).where(duBrouillon(secret));
  return ligne ?? null;
}

/** Les histoires du compte déjà lues, la plus récente d’abord (celles laissées avant la lecture n’y sont pas). */
export async function histoiresDuCompte(userId: string): Promise<LigneEcran[]> {
  return db()
    .select(ECRAN)
    .from(schema.stories)
    .where(and(eq(schema.stories.userId, userId), lue))
    .orderBy(desc(schema.stories.createdAt));
}

/**
 * À la connexion, le brouillon de ce navigateur. Un compte qui n’a encore aucune conv lue le reçoit, et c’est lui qui
 * s’ouvre : son identifiant revient. Sinon il reste un brouillon (null) : une conv importée puis laissée avant « Qui es-tu ? »
 * ne prend pas la place de celle qu’on suit. Le parcours d’import la retrouve, et sa lecture la rattache (POST /api/analyse).
 */
export async function brouillonALaConnexion(utilisateur: Utilisateur, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const [dejaLue] = await db()
    .select({ id: schema.stories.id })
    .from(schema.stories)
    .where(and(eq(schema.stories.userId, utilisateur.id), lue))
    .limit(1);
  return dejaLue ? null : rattacherBrouillon(utilisateur, secret);
}

/**
 * Le brouillon du cookie devient une histoire du compte : à la connexion, ou quand un compte déjà connecté lance la
 * lecture d’une nouvelle conv. Renvoie son identifiant (null : pas de brouillon).
 */
export async function rattacherBrouillon(utilisateur: Utilisateur, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const [ligne] = await db()
    .update(schema.stories)
    .set({ userId: utilisateur.id, draftToken: null, updatedAt: new Date() })
    .where(duBrouillon(secret))
    .returning({ id: schema.stories.id });
  return ligne?.id ?? null;
}

export const metaDe = (ligne: Pick<Ligne, "meta">) => coffre.lire("stories.meta", ligne.meta);
export const contexteDe = (ligne: Pick<Ligne, "context">) => (ligne.context ? coffre.lire("stories.context", ligne.context) : null);
/** La conv brute : son texte tel qu’importé, ou ses morceaux (src/server/morceaux.ts). */
export const convDe = (ligne: LigneComplete) => (ligne.conv ? coffre.lire("stories.conv", ligne.conv) : null);

/** « Qui es-tu ? » est rempli (en base) : la lecture peut partir sans le parcours du navigateur. */
export const quiRempli = (meta: Meta): meta is Meta & Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">> =>
  meta.moi != null && !!meta.pronom && !!meta.devinette && !!meta.objectif;

/**
 * Toi et l’autre, parmi les participants. La règle des écrans (moiEtAutre, src/lib/participants.ts) : toi connu
 * (« Qui es-tu ? » rempli), l’autre est l’autre participant ; toi inconnu, l’autre est le second (`participants[1]`).
 */
export function personnesDe(meta: Pick<Meta, "participants" | "moi">): { moi: Participant; autre: Participant } {
  const [a, b] = meta.participants;
  return meta.moi === 1 ? { moi: b, autre: a } : { moi: a, autre: b };
}

/**
 * Qui est qui, une fois « Qui es-tu ? » rempli. L’autre a le pronom choisi sur sa fiche, sinon celui que la conv laisse
 * lire, sinon l’opposé du tien (pronomDeLAutre) : un garçon et une fille, deux filles ou deux garçons. Deux personnes au
 * même prénom prennent deux noms distincts (nomsDistincts : « Léa M. » et « Léa D. »), lus ici par tous les prompts et
 * les bulles des preuves : la conv déjà importée en profite aussi.
 */
export function histoireDe(meta: Meta): Histoire {
  if (!quiRempli(meta)) throw new Error("« Qui es-tu ? » n’est pas rempli");
  const { moi, autre } = personnesDe(meta);
  const noms = nomsDistincts(meta.participants, meta.moi === 0 ? 1 : 0);
  return {
    utilisateur: { prenom: noms[meta.moi], pronom: meta.pronom, nomExport: moi.nom },
    autre: { prenom: noms[meta.moi === 0 ? 1 : 0], pronom: pronomDeLAutre(meta, { moi, autre }), nomExport: autre.nom },
    devinette: meta.devinette,
    objectif: meta.objectif,
    appli: meta.appli,
    format: meta.format,
  };
}

/**
 * Les noms sous lesquels tes messages s’écrivent dans les lignes : celui d’histoireDe, et ton prénom gardé tel quel quand
 * il diffère de celui de l’autre. Les lignes gardées par la mémoire avant les noms distincts disent « Léa » là où la
 * conv relue dit « Léa M. » : les bulles de preuve (messagesAffiches) les reconnaissent toutes les deux.
 */
export function nomsDeToi(meta: Meta): string[] {
  const { moi, autre } = personnesDe(meta);
  const distinct = histoireDe(meta).utilisateur.prenom;
  return moi.prenom === autre.prenom || moi.prenom === distinct ? [distinct] : [distinct, moi.prenom];
}

/**
 * D’où vient chaque morceau d’une conv réunie (son appli, un export ou des captures, ses dates), pour la ligne qui ouvre
 * la conv que lit le modèle (rendre, prompts/lib/conv.ts) : le trou entre deux morceaux n’y est plus lu comme un
 * silence. Aucun pour une conv d’un seul morceau.
 */
export const provenancesDe = (meta: Pick<Meta, "morceaux">): Provenance[] =>
  (meta.morceaux ?? []).map((m) => ({ appli: m.appli, source: m.captures ? "captures" : "export", debut: m.resume.debut, fin: m.resume.fin }));

export async function definirQui(
  id: string,
  { prenom, prenomAutre, ...qui }: Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">> & { prenom?: string; prenomAutre?: string },
): Promise<Meta> {
  const ligne = uneLigne(await db().select({ meta: schema.stories.meta, conv: schema.stories.conv }).from(schema.stories).where(eq(schema.stories.id, id)), "stories:qui_est_qui");
  const brute = ligne.conv ? coffre.lire("stories.conv", ligne.conv) : null;
  /*
   * Plusieurs morceaux : ils se relisent avec le bon « Moi » (sur des captures, c’est lui), qu’on n’avait que deviné.
   * Les doublons et les comptes de la conv réunie sont alors ceux que lira la chaîne (relire, src/server/analyse.ts)
   */
  const avant = brute && typeof brute !== "string" ? metaReunie(metaDe(ligne), brute, identiteDe(metaDe(ligne)), { k: qui.moi, connu: true }).meta : metaDe(ligne);
  /*
   * Des captures : l’utilisateur est « Moi », son prénom vient de l’écran. L’autre garde le nom lu en haut de la conv, ou
   * son nom d’export ; quand il ne dit pas son prénom (« Elle », un numéro, un compte supprimé, un surnom : doutePrenom),
   * le prénom que l’écran a demandé le remplace
   */
  const renomme = (p: Participant, k: 0 | 1): Participant => {
    if (prenom && k === qui.moi) return { ...p, prenom: prenomEcrit(prenom) };
    if (prenomAutre && k !== qui.moi && doutePrenom(p.nom)) return { ...p, prenom: prenomEcrit(prenomAutre) };
    return p;
  };
  const participants: Meta["participants"] = [renomme(avant.participants[0], 0), renomme(avant.participants[1], 1)];
  const meta = { ...avant, ...qui, participants };
  await db()
    .update(schema.stories)
    .set({ meta: coffre.ecrire("stories.meta", meta), messageCount: meta.resume.total, updatedAt: new Date() })
    .where(eq(schema.stories.id, id));
  return meta;
}

/**
 * Le pronom de l’autre, choisi sur sa fiche : il passe devant celui que la conv laisse lire (pronomDeLAutre). Rend la
 * meta écrite (chiffrée), pour relire sa fiche sans relire la ligne.
 */
export async function definirPronomAutre(id: string, pronomAutre: Pronom): Promise<Ligne["meta"]> {
  const avant = metaDe(uneLigne(await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, id)), "stories:pronom_autre"));
  const meta = coffre.ecrire("stories.meta", { ...avant, pronomAutre });
  await db().update(schema.stories).set({ meta, updatedAt: new Date() }).where(eq(schema.stories.id, id));
  return meta;
}

/** Efface l’histoire et tout ce qui en vient (verdict, rapport, mémoire, chat, tâches : en cascade). */
export async function supprimerHistoire(id: string): Promise<void> {
  await db().transaction(async (tx) => {
    const [effacee] = await tx.delete(schema.stories).where(eq(schema.stories.id, id)).returning({ id: schema.stories.id });
    /* Au registre : une base restaurée à un instant d’avant la ré-effacera (BACKEND.md, « Les sauvegardes ») */
    if (effacee) await tx.insert(schema.effacements).values({ quoi: "conv", cible: id });
  });
}
