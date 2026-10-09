import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { gunzipSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { detecterFormat, erreurImport, lire, participantsDe, principaux, type Devinette, type Format, type Histoire, type Objectif, type Pronom } from "@prompts/lib/conv";
import { prenomDe } from "@prompts/lib/ajouts";
import { choisirParties, estFichierUtile, lireExport, type Appli, type ExportLu } from "@prompts/lib/export";
import type { TexteCaptures } from "@prompts/lib/captures";
import type { Story } from "@/types";
import { chiffrer, dechiffrer, empreinte, jeton } from "./chiffrement";
import { db, schema } from "./db";
import type { Utilisateur } from "./auth";

/** Le texte d’une conv, même très longue, tient sous cette taille (une fois décompressé). */
export const TAILLE_MAX = 40 * 1024 * 1024;
/** Un export compte quelques fichiers utiles (la conv, ses parties) : au-delà, ce n’est pas un export. */
const FICHIERS_MAX = 200;
/** Le nom d’un des deux participants, tel que l’export l’écrit. */
const NOM_MAX = 100;

export class ErreurImport extends Error {
  constructor(readonly code: "fichier" | "groupe" | "courte") {
    super(code);
  }
}

/** Ce qu’on sait d’une histoire, chiffré dans `stories.meta`. */
export type Meta = {
  /** L’appli d’où vient la conv : un export (WhatsApp, Instagram), ou des captures (Instagram, Hinge, iMessage, autre). */
  appli: Appli | "hinge" | "imessage" | "autre";
  format: Format;
  fichier: string;
  /** Les deux participants, du plus bavard au moins bavard, avec leur nom dans l’export. */
  participants: { nom: string; prenom: string; messages: number }[];
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

/**
 * Ce qu’on garde de la conv une fois effacée, chiffré dans `stories.context`. `dernier` : l’heure du dernier
 * message lu (celle de l’export, sans fuseau), d’où repartent les messages ajoutés ensuite.
 */
export type Contexte = { chiffres: string; style: string; fin: string; dernier?: number; trouvailles?: string[] };

export type Ligne = typeof schema.stories.$inferSelect;

export { prenomDe };

/** Un fichier envoyé tel quel (un .txt, un message_1.html, ou un .zip) : on en tire le texte de la conv. */
export async function depuisFichier(fichier: File): Promise<ExportLu & { nom: string }> {
  if (fichier.size > TAILLE_MAX || fichier.size === 0) throw new ErreurImport("fichier");
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let fichiers = [{ nom: fichier.name, contenu: "" }];
  if (octets[0] === 0x50 && octets[1] === 0x4b) {
    /* Une archive piégée (quelques Mo qui en font des Go) : on compte ce qu’on décompresse, au total, avant de le faire */
    let total = 0;
    let nombre = 0;
    try {
      const contenu = unzipSync(octets, {
        filter: (f) => {
          if (!estFichierUtile(f.name)) return false;
          total += f.originalSize;
          if (++nombre > FICHIERS_MAX || total > TAILLE_MAX) throw new ErreurImport("fichier");
          return true;
        },
      });
      fichiers = Object.entries(contenu).map(([nom, o]) => ({ nom, contenu: strFromU8(o) }));
    } catch {
      throw new ErreurImport("fichier");
    }
  } else fichiers[0].contenu = strFromU8(octets);
  const parties = choisirParties(fichiers);
  const lu = parties && parties !== "plusieurs" ? lireExport(parties) : null;
  if (!lu) throw new ErreurImport("fichier");
  return { ...lu, nom: fichier.name };
}

const Paquet = z.object({ nom: z.string().max(300), parties: z.array(z.object({ nom: z.string().max(500), contenu: z.string() })).min(1).max(50), coupe: z.boolean().optional() });

/**
 * Le paquet préparé par le navigateur (src/services/preparer-export.ts) : du JSON compressé, relu et vérifié ici.
 * `coupe` : la conv était trop longue pour partir en entier, le navigateur n’a gardé que sa partie la plus récente.
 */
export async function depuisPaquet(paquet: File): Promise<ExportLu & { nom: string; coupe?: boolean }> {
  if (paquet.size > 4.5 * 1024 * 1024 || paquet.size === 0) throw new ErreurImport("fichier");
  try {
    /* La décompression s’arrête d’elle-même à TAILLE_MAX : un paquet piégé ne remplit pas la mémoire du serveur */
    const octets = gunzipSync(Buffer.from(await paquet.arrayBuffer()), { maxOutputLength: TAILLE_MAX });
    const p = Paquet.parse(JSON.parse(octets.toString("utf8")));
    const lu = lireExport(p.parties);
    if (!lu) throw new ErreurImport("fichier");
    return { ...lu, nom: p.nom, ...(p.coupe ? { coupe: true } : {}) };
  } catch {
    throw new ErreurImport("fichier");
  }
}

/** Lit l’export et crée une histoire brouillon (avant l’email). `secret` part dans le cookie du brouillon. */
export async function importer({ nom, appli, texte, coupe }: ExportLu & { nom: string; coupe?: boolean }): Promise<{ id: string; meta: Meta; secret: string }> {
  const format = detecterFormat(texte);
  if (format === "captures" || !format) throw new ErreurImport("fichier");
  /* Un nom qui n’apparaît qu’à peine (un message collé d’un autre) ne fait pas une conv de groupe : ses lignes restent du texte */
  const noms = principaux(participantsDe(texte));
  if (noms.length > 2) throw new ErreurImport("groupe");
  if (noms.length < 2) throw new ErreurImport("courte");
  /* Un nom de contact est court : un nom démesuré (ou fait de caractères de contrôle) gonflerait ce qu’on garde de la conv */
  if (noms.some((n) => n.nom.length > NOM_MAX || /[\u0000-\u001f\u007f]/.test(n.nom))) throw new ErreurImport("fichier");
  const personne = (k: number) => ({ prenom: prenomDe(noms[k].nom), pronom: "il" as const, nomExport: noms[k].nom });
  const lu = lire(texte, { utilisateur: personne(0), autre: personne(1), format }, { autresEnTexte: true });
  const err = erreurImport(lu);
  if (err) throw new ErreurImport(err);
  const meta: Meta = {
    appli,
    format,
    fichier: nom.slice(0, 200),
    participants: noms.map((n) => ({ nom: n.nom, prenom: prenomDe(n.nom), messages: n.messages })),
    resume: {
      debut: new Date(lu.messages[0].t).toISOString().slice(0, 10),
      fin: new Date(lu.messages.at(-1)!.t).toISOString().slice(0, 10),
      total: lu.messages.length,
      vocaux: lu.messages.filter((m) => m.media === "vocal").length,
    },
    ...(coupe ? { coupe: true } : {}),
  };
  const secret = jeton();
  const [ligne] = await db()
    .insert(schema.stories)
    .values({ draftToken: empreinte(secret), messageCount: lu.messages.length, meta: chiffrer(meta), conv: chiffrer(texte) })
    .returning({ id: schema.stories.id });
  return { id: ligne.id, meta, secret };
}

/** Des captures, lues par le prompt 01 (src/server/captures.ts) : une histoire brouillon, comme un export. */
export async function importerCaptures({ appli, t }: { appli: Meta["appli"]; t: TexteCaptures }): Promise<{ id: string; meta: Meta; secret: string }> {
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
    resume: {
      debut: new Date(lu.messages[0].t).toISOString().slice(0, 10),
      fin: new Date(lu.messages.at(-1)!.t).toISOString().slice(0, 10),
      total: lu.messages.length,
      vocaux: lu.messages.filter((m) => m.media === "vocal").length,
    },
    moi: 0,
  };
  const secret = jeton();
  const [ligne] = await db()
    .insert(schema.stories)
    .values({ draftToken: empreinte(secret), messageCount: lu.messages.length, meta: chiffrer(meta), conv: chiffrer(t.texte) })
    .returning({ id: schema.stories.id });
  return { id: ligne.id, meta, secret };
}

/**
 * Ce qui désigne une histoire : le brouillon (une conv importée, pas encore lue), la conv choisie dans « Tes convs »
 * (deux cookies), et la conv que montre la page d’où part la requête (`affichee`, l’en-tête ENTETE_CONV).
 */
export type Designation = { brouillon?: string; choisie?: string; affichee?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une histoire du compte a-t-elle été lue (sa lecture lancée) ? Les tâches restent après coup : leur présence suffit. */
const lue = sql<boolean>`exists (select 1 from ${schema.tasks} where ${schema.tasks.storyId} = ${schema.stories.id})`;

/**
 * L’histoire ouverte.
 * - Un geste parti d’une page (un appel du navigateur) vise la conv que montre cette page (`affichee`).
 * - Le parcours d’import (`parcours`) regarde d’abord le brouillon : la conv qu’on est en train d’importer. Ailleurs
 *   (l’accueil, le rapport…), une conv importée puis laissée en plan ne prend pas la place de celle qu’on suit.
 * - Sinon, la conv du compte choisie dans « Tes convs » (si elle est bien à lui), ou la plus récente déjà lue.
 * Sans compte : le brouillon seul.
 */
export async function histoireOuverte(utilisateur: Utilisateur | null, { brouillon, choisie, affichee }: Designation, { parcours = false } = {}): Promise<Ligne | null> {
  if (brouillon && (parcours || !utilisateur)) {
    const ligne = await brouillonDe(brouillon);
    if (ligne || !utilisateur) return ligne;
  }
  if (!utilisateur) return null;
  /* La conv à l’écran : celle-là, ou rien (supprimée entre-temps, ou pas à ce compte). Jamais une autre à sa place */
  if (affichee && !parcours) {
    if (!UUID.test(affichee)) return null;
    const [ligne] = await db()
      .select()
      .from(schema.stories)
      .where(and(eq(schema.stories.id, affichee), eq(schema.stories.userId, utilisateur.id)));
    return ligne ?? null;
  }
  if (choisie && UUID.test(choisie)) {
    const [ligne] = await db()
      .select()
      .from(schema.stories)
      .where(and(eq(schema.stories.id, choisie), eq(schema.stories.userId, utilisateur.id)));
    if (ligne) return ligne;
  }
  const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.userId, utilisateur.id)).orderBy(desc(lue), desc(schema.stories.createdAt)).limit(1);
  return ligne ?? null;
}

/** Le brouillon d’un cookie, tant qu’il n’a pas de compte. */
export async function brouillonDe(secret: string): Promise<Ligne | null> {
  const [ligne] = await db()
    .select()
    .from(schema.stories)
    .where(and(eq(schema.stories.draftToken, empreinte(secret)), isNull(schema.stories.userId)));
  return ligne ?? null;
}

/** Les histoires du compte déjà lues, la plus récente d’abord (celles laissées avant la lecture n’y sont pas). */
export async function histoiresDuCompte(userId: string): Promise<Ligne[]> {
  return db().select().from(schema.stories).where(and(eq(schema.stories.userId, userId), lue)).orderBy(desc(schema.stories.createdAt));
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
    .where(and(eq(schema.stories.draftToken, empreinte(secret)), isNull(schema.stories.userId)))
    .returning({ id: schema.stories.id });
  return ligne?.id ?? null;
}

export const metaDe = (ligne: Ligne) => dechiffrer<Meta>(ligne.meta);
export const contexteDe = (ligne: Ligne) => (ligne.context ? dechiffrer<Contexte>(ligne.context) : null);
export const convDe = (ligne: Ligne) => (ligne.conv ? dechiffrer<string>(ligne.conv) : null);

/** « Qui es-tu ? » est rempli (en base) : la lecture peut partir sans le parcours du navigateur. */
export const quiRempli = (meta: Meta): meta is Meta & Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">> =>
  meta.moi != null && !!meta.pronom && !!meta.devinette && !!meta.objectif;

/** Qui est qui, une fois « Qui es-tu ? » rempli. L’autre a le pronom opposé (BLUSH : un garçon et une fille). */
export function histoireDe(meta: Meta): Histoire {
  if (!quiRempli(meta)) throw new Error("« Qui es-tu ? » n’est pas rempli");
  const [moi, autre] = [meta.participants[meta.moi], meta.participants[1 - meta.moi]];
  return {
    utilisateur: { prenom: moi.prenom, pronom: meta.pronom, nomExport: moi.nom },
    autre: { prenom: autre.prenom, pronom: meta.pronom === "il" ? "elle" : "il", nomExport: autre.nom },
    devinette: meta.devinette,
    objectif: meta.objectif,
    appli: meta.appli,
    format: meta.format,
  };
}

export async function definirQui(id: string, { prenom, ...qui }: Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">> & { prenom?: string }): Promise<Meta> {
  const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
  const avant = metaDe(ligne);
  /* Des captures : l’utilisateur est « Moi », son prénom vient de l’écran */
  const participants = prenom ? avant.participants.map((p, k) => (k === qui.moi ? { ...p, prenom: prenomDe(prenom) } : p)) : avant.participants;
  const meta = { ...avant, ...qui, participants };
  await db().update(schema.stories).set({ meta: chiffrer(meta), updatedAt: new Date() }).where(eq(schema.stories.id, id));
  return meta;
}

const APPLIS: Record<Meta["appli"], string> = { whatsapp: "WhatsApp", instagram: "Instagram", hinge: "Hinge", imessage: "iMessage", autre: "Captures" };
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso: string) => `${+iso.slice(8, 10)} ${MOIS[+iso.slice(5, 7) - 1]}`;

/** L’histoire telle que l’affiche le front. Les participants sont p0 et p1 (dans l’ordre de l’export). */
export function storyAffichee(id: string, meta: Meta): Story {
  const { debut, fin, total, vocaux } = meta.resume;
  const periode = `${dateCourte(debut)} → ${dateCourte(fin)}`;
  const jours = Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / 86400e3));
  const [a, b] = meta.participants;
  /* Le pronom de chacun, une fois « Tu es » rempli : l’utilisateur a le sien, l’autre l’opposé */
  const pronom = (k: 0 | 1) => (meta.moi == null || !meta.pronom ? {} : { pronoun: k === meta.moi ? meta.pronom : meta.pronom === "il" ? ("elle" as const) : ("il" as const) });
  return {
    id,
    participants: [
      { id: "p0", name: a.prenom, initial: initialeDe(a.prenom), ...pronom(0) },
      { id: "p1", name: b.prenom, initial: initialeDe(b.prenom), ...pronom(1) },
    ],
    sources: [
      meta.captures
        ? { id: "s1", app: meta.appli, mode: "captures", screenshotCount: meta.captures, label: `${APPLIS[meta.appli]} · ${meta.captures} captures`, period: periode, messageCount: total, voiceCount: vocaux }
        : {
            id: "s1",
            app: meta.appli,
            mode: "export",
            fileName: meta.fichier,
            label: `${APPLIS[meta.appli]} · ${dateCourte(debut)}`,
            period: periode,
            messageCount: total,
            voiceCount: vocaux,
            /* Une conv trop longue, coupée : combien de mois BLUSH en lit */
            ...(meta.coupe ? { moisLus: Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / (30.44 * 86400e3))) } : {}),
          },
    ],
    totalMessages: total,
    voiceCount: vocaux,
    period: periode,
    durationLabel: `${jours} jour${jours > 1 ? "s" : ""}`,
    updatedLabel: "aujourd’hui",
    /* Qui est l’utilisateur : le rapport ouvert depuis le mail (un autre onglet, sans parcours) met les bons avatars */
    ...(meta.moi == null ? {} : { me: meta.moi === 0 ? "p0" : "p1" }),
  };
}

/** L’initiale d’un nom : son premier caractère entier (un emoji n’est pas coupé en deux), en majuscule. */
export const initialeDe = (nom: string) => [...nom.trim()][0]?.toUpperCase() ?? "?";

/** Efface l’histoire et tout ce qui en vient (verdict, rapport, mémoire, chat, tâches : en cascade). */
export async function supprimerHistoire(id: string): Promise<void> {
  await db().delete(schema.stories).where(eq(schema.stories.id, id));
}
