import "server-only";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { GenreDuHaut } from "@/contenu/haut-du-paywall";
import type { NoteDuRapport, RaisonDeLaNote } from "@/types";
import { cookieSecurise } from "./cookies";
import { db, schema } from "./db";
import { auMieux, journalErreur } from "./journal";

/*
 * Les compteurs du tableau de bord : un nom, un jour (heure de Paris), un nombre. Rien d’autre : ni contenu,
 * ni email, ni adresse IP. Un compteur raté ne fait jamais échouer ce qu’il compte.
 */

export const CLES = {
  /** La fenêtre de partage ouverte (le lien est créé à ce moment-là, s’il n’existait pas). */
  partageOuvert: "partage_ouvert",
  /** Un nouveau lien de partage. */
  lienCree: "lien_cree",
  /** L’image de l’aperçu dessinée : le lien vient d’être collé dans une conv (WhatsApp, iMessage…). */
  lienApercu: "lien_apercu",
  /** La page d’un verdict partagé, ouverte par une personne (pas par un robot d’aperçu). */
  lienVu: "lien_vu",
  /** « Analyser ma conv » touché sur la page d’un verdict partagé. */
  lienEssai: "lien_essai",
  /** Une conv importée par quelqu’un venu d’un verdict partagé. */
  importPartage: "import_partage",
  /** Une image « Partager en image » (une réponse du chat, la chute d’un chapitre). */
  imagePartagee: "image_partagee",
  /** Le lien de parrainage d’une amie ouvert (/p/<code>, src/server/parrainage.ts). */
  lienParrainage: "parrainage_lien",
  /** Une réponse du chat sortie en alerte (danger, détresse, mineur) : la santé de /admin les compte (src/server/stats.ts). */
  alerteChat: "chat_alerte",
  /**
   * Un import de vidéo arrêté par un refus de lecture (le modèle refuse un lot, malgré son repli : le navigateur arrête
   * tout, src/services/api.ts), une fois par envoi, seulement pour le produit (noterLeRefusDUneVideo, src/server/imports.ts).
   */
  videoRefusee: "video_refus",
  /**
   * Une mise à jour de la mémoire au calme gardée en direct parce que sa conv est en alerte (le garde-fou de la mémoire
   * en lot, « lot:alerte », src/server/memoire-en-lot.ts), seulement pour le produit : tasks.error s’efface quand elle finit.
   */
  majEnDirectParAlerte: "memoire_alerte_direct",
} as const;
/**
 * La note d’un rapport écrit (src/server/note-du-rapport.ts) : « Oui, grave », « Bof », ce qui n’allait pas après
 * « Bof », et un avis parti à l’équipe. Une fois par conv chacun, sans rien de la conv ni du compte.
 */
export const CLES_DE_LA_NOTE = {
  oui: "note_oui",
  bof: "note_bof",
  avis: "note_avis",
  precis: "note_raison_precis",
  a_cote: "note_raison_a_cote",
  dur: "note_raison_dur",
  long: "note_raison_long",
  autre: "note_raison_autre",
} as const satisfies Record<NoteDuRapport | RaisonDeLaNote | "avis", string>;
/** Le début des clés de la note : /admin les lit d’une requête (src/server/stats.ts). */
export const NOTE = "note_";

export type Cle = (typeof CLES)[keyof typeof CLES] | (typeof CLES_DE_LA_NOTE)[keyof typeof CLES_DE_LA_NOTE];

/** Compte un passage ; un échec laisse une ligne au journal (le nom de l’erreur, jamais son message), sans rien faire échouer. */
export async function compter(cle: Cle): Promise<void> {
  await auMieux(
    () =>
      db()
        .insert(schema.counters)
        .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key: cle, count: 1 })
        .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } }),
    "compteur non noté",
    { cle },
  );
}

/**
 * Le début de la clé d’un compteur de pannes (src/server/pannes.ts), suivi du lieu de la panne : la clé du contrat d’une
 * route (« panne:POST /api/chat ») ou le fichier d’une page (« panne:/rapport »). Jamais une adresse demandée.
 */
export const PANNE = "panne:";

/**
 * Compte une panne de `lieu` aujourd’hui (jour de Paris), et rend le compte du jour avec elle : 1 pour la première.
 * L’ajout est atomique : deux pannes en même temps ne lisent jamais toutes deux 1. Null si la base ne l’a pas noté (la
 * base en panne, justement) : une ligne au journal le dit, sans rien faire échouer.
 */
export async function compterUnePanne(lieu: string): Promise<number | null> {
  try {
    const [ligne] = await db()
      .insert(schema.counters)
      .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key: `${PANNE}${lieu}`, count: 1 })
      .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } })
      .returning({ count: schema.counters.count });
    return ligne?.count ?? null;
  } catch (e) {
    journalErreur("panne non comptée", e, { lieu });
    return null;
  }
}

/**
 * Le début de la clé d’un compteur du haut du paywall (src/contenu/haut-du-paywall.ts) : « haut:vu:<titre> » quand une
 * conv arrive au paywall avec ce titre, « haut:paye:<titre> » quand son rapport est débloqué. Des comptes par jour, sans
 * la conv : le titre d’une conv, lui, reste chiffré avec elle (stories.context).
 */
export const HAUT = "haut:";

/** Compte un titre du haut du paywall, vu ou payé, aujourd’hui (jour de Paris), sans rien faire échouer. */
export async function compterLeHaut(genre: GenreDuHaut, quoi: "vu" | "paye"): Promise<void> {
  const key = `${HAUT}${quoi}:${genre}`;
  await auMieux(
    () =>
      db()
        .insert(schema.counters)
        .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key, count: 1 })
        .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } }),
    "compteur non noté",
    { cle: key },
  );
}

/**
 * Le début de la clé d’un compteur des mails des séquences (src/server/sequences.ts) : « mail:<clé du mail> », un bouton
 * de ce mail touché (son lien porte `?m=<clé>`, lu par /ouvrir/<conv> et /commencer). Des comptes par jour, sans le compte.
 */
export const MAIL = "mail:";

/** Compte un bouton touché d’un mail des séquences (`mail` : sa clé, déjà vérifiée), aujourd’hui (jour de Paris), sans rien faire échouer. */
export async function compterUnClicDeMail(mail: string): Promise<void> {
  const key = `${MAIL}${mail}`;
  await auMieux(
    () =>
      db()
        .insert(schema.counters)
        .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key, count: 1 })
        .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } }),
    "compteur non noté",
    { cle: key },
  );
}

/** Les robots qui ouvrent un lien pour en dessiner l’aperçu (WhatsApp, iMessage, Slack…) : pas des visites. */
export const estUnRobot = (agent: string | null) =>
  !agent ||
  /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|embedly|pinterest|iframely|signal|snapchat|instagram|headless/i.test(agent);

/* Venu d’un verdict partagé : retenu 30 jours, pour compter son import (une marque, pas un identifiant) */
const VENU = "blush-venu";
export const marquerVenuDuPartage = async () =>
  (await cookies()).set(VENU, "partage", { httpOnly: true, secure: cookieSecurise(), sameSite: "lax", path: "/", maxAge: 30 * 86400 });

/** Après un import : s’il vient d’un verdict partagé, on le compte (une fois). */
export async function compterImportVenuDuPartage(): Promise<void> {
  const c = await cookies();
  if (c.get(VENU)?.value !== "partage") return;
  c.delete(VENU);
  await compter(CLES.importPartage);
}
