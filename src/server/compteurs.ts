import "server-only";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "./db";

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
} as const;
export type Cle = (typeof CLES)[keyof typeof CLES];

export async function compter(cle: Cle): Promise<void> {
  try {
    await db()
      .insert(schema.counters)
      .values({ day: sql`(now() at time zone 'Europe/Paris')::date`, key: cle, count: 1 })
      .onConflictDoUpdate({ target: [schema.counters.day, schema.counters.key], set: { count: sql`${schema.counters.count} + 1` } });
  } catch (e) {
    console.error(`compteur ${cle} non noté :`, e instanceof Error ? e.message : "erreur");
  }
}

/** Les robots qui ouvrent un lien pour en dessiner l’aperçu (WhatsApp, iMessage, Slack…) : pas des visites. */
export const estUnRobot = (agent: string | null) =>
  !agent || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|embedly|pinterest|iframely|signal|snapchat|instagram|headless/i.test(agent);

/* Venu d’un verdict partagé : retenu 30 jours, pour compter son import (une marque, pas un identifiant) */
const VENU = "blush-venu";
export const marquerVenuDuPartage = async () =>
  (await cookies()).set(VENU, "partage", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });

/** Après un import : s’il vient d’un verdict partagé, on le compte (une fois). */
export async function compterImportVenuDuPartage(): Promise<void> {
  const c = await cookies();
  if (c.get(VENU)?.value !== "partage") return;
  c.delete(VENU);
  await compter(CLES.importPartage);
}
