import "server-only";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import {
  detecterFormat,
  erreurImport,
  lire,
  participantsDe,
  principaux,
  type Devinette,
  type Format,
  type Histoire,
  type Message,
  type Objectif,
  type Pronom,
} from "@prompts/lib/conv";
import { prenomDe } from "@prompts/lib/ajouts";
import type { Appli, ExportLu } from "@prompts/lib/export";
import type { TexteCaptures } from "@prompts/lib/captures";
import { pronomOppose } from "@/lib/pronom";
import { empreinte, jeton } from "./chiffrement";
import * as coffre from "./coffre";
import { db, schema, uneLigne } from "./db";
import { PREDICATS } from "./depot";
import type { Utilisateur } from "./auth";
import { ErreurInvariant } from "./erreurs";
import { borner, ErreurImport } from "./import";
import type { Consentement } from "./juridique";

/*
 * Les histoires en base : le brouillon d’un import, la conv ouverte, « Qui es-tu ? », l’effacement. L’import d’un export
 * (le fichier, le paquet, leurs bornes) vit dans import.ts, la conv telle que l’affiche le front dans conv-affichee.ts.
 */

/** Le nom d’un des deux participants, tel que l’export l’écrit. */
const NOM_MAX = 100;

/** L’un des deux participants d’une conv : son prénom, son nom dans l’export, combien de messages il y a écrits. */
export type Participant = { nom: string; prenom: string; messages: number };

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
  /** Rempli sur « Qui es-tu ? » : l’index de l’utilisateur dans `participants`, son pronom, sa devinette, son objectif. */
  moi?: 0 | 1;
  pronom?: Pronom;
  devinette?: Devinette;
  objectif?: Objectif;
};

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

/**
 * L’histoire brouillon d’un import (un export ou des captures), avant l’email : sa meta et sa conv brute, chiffrées, et
 * l’accord de son import (src/server/juridique.ts). Le cookie du brouillon la retrouve par l’empreinte de `secret`.
 */
async function creerBrouillon(meta: Meta, texte: string, secret: string, consentement: Consentement): Promise<{ id: string; meta: Meta; secret: string }> {
  const ligne = uneLigne(
    await db()
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
  return { id: ligne.id, meta, secret };
}

/**
 * Lit l’export et crée une histoire brouillon (avant l’email). `secret` part dans le cookie du brouillon. Le texte est
 * borné ici aussi (import.ts, borner) : depuisFichier et depuisPaquet l’ont fait, un autre appelant n’y échappe pas.
 */
export async function importer(recu: ExportLu & { nom: string; coupe?: boolean }, consentement: Consentement): Promise<{ id: string; meta: Meta; secret: string }> {
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
  const personne = ({ nom }: { nom: string }) => ({ prenom: prenomDe(nom), pronom: "il" as const, nomExport: nom });
  const participant = ({ nom, messages }: { nom: string; messages: number }): Participant => ({ nom, prenom: prenomDe(nom), messages });
  const lu = lire(texte, { utilisateur: personne(premier), autre: personne(second), format }, { autresEnTexte: true });
  const err = erreurImport(lu);
  if (err) throw new ErreurImport(err);
  const meta: Meta = {
    appli,
    format,
    fichier: nom.slice(0, 200),
    participants: [participant(premier), participant(second)],
    resume: resumeDe(lu.messages),
    ...(coupe ? { coupe: true } : {}),
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
}: {
  appli: Meta["appli"];
  t: TexteCaptures;
  secret?: string;
  consentement: Consentement;
}): Promise<{ id: string; meta: Meta; secret: string }> {
  const personne = (nom: string) => ({ prenom: nom, pronom: "il" as const, nomExport: nom });
  const lu = lire(t.texte, { utilisateur: personne("Moi"), autre: personne(t.autre), format: "captures" });
  const err = erreurImport(lu, "captures");
  if (err) throw new ErreurImport(err);
  const compte = (nom: string) => lu.messages.filter((m) => m.nom === nom).length;
  const meta: Meta = {
    appli,
    format: "captures",
    fichier: `${t.captures} captures`,
    captures: t.captures,
    participants: [
      { nom: "Moi", prenom: "Moi", messages: compte("Moi") },
      { nom: t.autre, prenom: prenomDe(t.autre), messages: compte(t.autre) },
    ],
    resume: resumeDe(lu.messages),
    moi: 0,
  };
  return creerBrouillon(meta, t.texte, secret, consentement);
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

/** Qui est qui, une fois « Qui es-tu ? » rempli. L’autre a le pronom opposé (BLUSH : un garçon et une fille). */
export function histoireDe(meta: Meta): Histoire {
  if (!quiRempli(meta)) throw new Error("« Qui es-tu ? » n’est pas rempli");
  const { moi, autre } = personnesDe(meta);
  return {
    utilisateur: { prenom: moi.prenom, pronom: meta.pronom, nomExport: moi.nom },
    autre: { prenom: autre.prenom, pronom: pronomOppose(meta.pronom), nomExport: autre.nom },
    devinette: meta.devinette,
    objectif: meta.objectif,
    appli: meta.appli,
    format: meta.format,
  };
}

export async function definirQui(id: string, { prenom, ...qui }: Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">> & { prenom?: string }): Promise<Meta> {
  const avant = metaDe(uneLigne(await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, id)), "stories:qui_est_qui"));
  /* Des captures : l’utilisateur est « Moi », son prénom vient de l’écran */
  const renomme = (p: Participant, k: 0 | 1): Participant => (prenom && k === qui.moi ? { ...p, prenom: prenomDe(prenom) } : p);
  const participants: Meta["participants"] = [renomme(avant.participants[0], 0), renomme(avant.participants[1], 1)];
  const meta = { ...avant, ...qui, participants };
  await db()
    .update(schema.stories)
    .set({ meta: coffre.ecrire("stories.meta", meta), updatedAt: new Date() })
    .where(eq(schema.stories.id, id));
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
