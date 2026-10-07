import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { detecterFormat, erreurImport, lire, participantsDe, type Devinette, type Format, type Histoire, type Objectif, type Pronom } from "@prompts/lib/conv";
import type { Story } from "@/types";
import { chiffrer, dechiffrer, empreinte, jeton } from "./chiffrement";
import { db, schema } from "./db";
import type { Utilisateur } from "./auth";

/** Un export WhatsApp « sans médias » pèse quelques Mo au plus. */
export const TAILLE_MAX = 20 * 1024 * 1024;

export class ErreurImport extends Error {
  constructor(readonly code: "fichier" | "groupe" | "courte") {
    super(code);
  }
}

/** Ce qu’on sait d’une histoire, chiffré dans `stories.meta`. */
export type Meta = {
  appli: "whatsapp";
  format: Exclude<Format, "captures">;
  fichier: string;
  /** Les deux participants, du plus bavard au moins bavard, avec leur nom dans l’export. */
  participants: { nom: string; prenom: string; messages: number }[];
  resume: { debut: string; fin: string; total: number; vocaux: number };
  /** Rempli sur « Qui es-tu ? » : l’index de l’utilisateur dans `participants`, son pronom, sa devinette, son objectif. */
  moi?: 0 | 1;
  pronom?: Pronom;
  devinette?: Devinette;
  objectif?: Objectif;
};

/** Ce qu’on garde de la conv une fois effacée, chiffré dans `stories.context`. */
export type Contexte = { chiffres: string; style: string; fin: string };

export type Ligne = typeof schema.stories.$inferSelect;

/** Le prénom d’un nom d’export (« Anthony S » → « Anthony », « Charlyse 🌸 » → « Charlyse »). */
export const prenomDe = (nom: string) => nom.match(/\p{L}[\p{L}'’-]*/u)?.[0] ?? nom.trim();

/** Le texte d’un export : un .txt, ou le _chat.txt d’un .zip. */
export async function texteDe(fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX || fichier.size === 0) throw new ErreurImport("fichier");
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const estZip = octets[0] === 0x50 && octets[1] === 0x4b;
  if (!estZip) return strFromU8(octets);
  let contenu: Record<string, Uint8Array>;
  try {
    contenu = unzipSync(octets, { filter: (f) => f.name.toLowerCase().endsWith(".txt") && f.originalSize < TAILLE_MAX });
  } catch {
    throw new ErreurImport("fichier");
  }
  const nom = Object.keys(contenu).find((n) => n.endsWith("_chat.txt")) ?? Object.keys(contenu)[0];
  if (!nom) throw new ErreurImport("fichier");
  return strFromU8(contenu[nom]);
}

/** Lit l’export et crée une histoire brouillon (avant l’email). `secret` part dans le cookie du brouillon. */
export async function importer(fichier: File): Promise<{ id: string; meta: Meta; secret: string }> {
  const texte = await texteDe(fichier);
  const format = detecterFormat(texte);
  if (format === "captures" || !format) throw new ErreurImport("fichier");
  const noms = participantsDe(texte, format);
  if (noms.length > 2) throw new ErreurImport("groupe");
  if (noms.length < 2) throw new ErreurImport("courte");
  const personne = (k: number) => ({ prenom: prenomDe(noms[k].nom), pronom: "il" as const, nomExport: noms[k].nom });
  const lu = lire(texte, { utilisateur: personne(0), autre: personne(1), format });
  const err = erreurImport(lu);
  if (err) throw new ErreurImport(err);
  const meta: Meta = {
    appli: "whatsapp",
    format,
    fichier: fichier.name.slice(0, 200),
    participants: noms.map((n) => ({ nom: n.nom, prenom: prenomDe(n.nom), messages: n.messages })),
    resume: {
      debut: new Date(lu.messages[0].t).toISOString().slice(0, 10),
      fin: new Date(lu.messages.at(-1)!.t).toISOString().slice(0, 10),
      total: lu.messages.length,
      vocaux: lu.messages.filter((m) => m.media === "vocal").length,
    },
  };
  const secret = jeton();
  const [ligne] = await db()
    .insert(schema.stories)
    .values({ draftToken: empreinte(secret), messageCount: lu.messages.length, meta: chiffrer(meta), conv: chiffrer(texte) })
    .returning({ id: schema.stories.id });
  return { id: ligne.id, meta, secret };
}

/** L’histoire ouverte : la plus récente du compte, sinon le brouillon du cookie. */
export async function histoireOuverte(utilisateur: Utilisateur | null, secretBrouillon: string | undefined): Promise<Ligne | null> {
  if (utilisateur) {
    const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.userId, utilisateur.id)).orderBy(desc(schema.stories.createdAt)).limit(1);
    if (ligne) return ligne;
  }
  if (!secretBrouillon) return null;
  const secret = secretBrouillon;
  const [brouillon] = await db()
    .select()
    .from(schema.stories)
    .where(and(eq(schema.stories.draftToken, empreinte(secret)), isNull(schema.stories.userId)));
  return brouillon ?? null;
}

/** À la connexion : le brouillon du cookie devient l’histoire du compte. */
export async function rattacherBrouillon(utilisateur: Utilisateur, secret: string | undefined): Promise<void> {
  if (!secret) return;
  await db()
    .update(schema.stories)
    .set({ userId: utilisateur.id, draftToken: null, updatedAt: new Date() })
    .where(and(eq(schema.stories.draftToken, empreinte(secret)), isNull(schema.stories.userId)));
}

export const metaDe = (ligne: Ligne) => dechiffrer<Meta>(ligne.meta);
export const contexteDe = (ligne: Ligne) => (ligne.context ? dechiffrer<Contexte>(ligne.context) : null);
export const convDe = (ligne: Ligne) => (ligne.conv ? dechiffrer<string>(ligne.conv) : null);

/** Qui est qui, une fois « Qui es-tu ? » rempli. L’autre a le pronom opposé (BLUSH : un garçon et une fille). */
export function histoireDe(meta: Meta): Histoire {
  if (meta.moi == null || !meta.pronom || !meta.devinette || !meta.objectif) throw new Error("« Qui es-tu ? » n’est pas rempli");
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

export async function definirQui(id: string, qui: Required<Pick<Meta, "moi" | "pronom" | "devinette" | "objectif">>): Promise<Meta> {
  const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
  const meta = { ...metaDe(ligne), ...qui };
  await db().update(schema.stories).set({ meta: chiffrer(meta), updatedAt: new Date() }).where(eq(schema.stories.id, id));
  return meta;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso: string) => `${+iso.slice(8, 10)} ${MOIS[+iso.slice(5, 7) - 1]}`;

/** L’histoire telle que l’affiche le front. Les participants sont p0 et p1 (dans l’ordre de l’export). */
export function storyAffichee(id: string, meta: Meta): Story {
  const { debut, fin, total, vocaux } = meta.resume;
  const periode = `${dateCourte(debut)} → ${dateCourte(fin)}`;
  const jours = Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / 86400e3));
  const [a, b] = meta.participants;
  return {
    id,
    participants: [
      { id: "p0", name: a.prenom, initial: a.prenom[0]?.toUpperCase() ?? "?" },
      { id: "p1", name: b.prenom, initial: b.prenom[0]?.toUpperCase() ?? "?" },
    ],
    sources: [{ id: "s1", app: "whatsapp", mode: "export", fileName: meta.fichier, label: `WhatsApp · ${dateCourte(debut)}`, period: periode, messageCount: total, voiceCount: vocaux }],
    totalMessages: total,
    voiceCount: vocaux,
    period: periode,
    durationLabel: `${jours} jour${jours > 1 ? "s" : ""}`,
    updatedLabel: "aujourd’hui",
  };
}

/** Efface l’histoire et tout ce qui en vient (verdict, rapport, mémoire, chat, tâches : en cascade). */
export async function supprimerHistoire(id: string): Promise<void> {
  await db().delete(schema.stories).where(eq(schema.stories.id, id));
}
