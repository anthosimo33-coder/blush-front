import type { Page } from "@playwright/test";
import { empreinte, sql } from "./base";

/*
 * Les aides de la bêta fermée (tests/e2e/beta-*.beta.spec.ts) : la liste d’attente vue de la base, le lien de retrait de
 * son mail, et l’écran tel que la personne le lit.
 */

/** La place de cet email sur la liste d’attente (d’où vient l’inscription : « accueil » ou « connexion »), ou null. */
export async function placeSurLaListe(email: string): Promise<{ source: string } | null> {
  /* La liste d’attente ne garde l’email qu’en empreinte (src/server/chiffrement.ts) */
  const [ligne] = await sql()<{ source: string }[]>`select source from waitlist where email_hash = ${empreinte(`attente:${email.toLowerCase()}`)}`;
  return ligne ?? null;
}

/** Une histoire par son identifiant (celui que /api/import renvoie) : `aUnCompte` dit si elle est rattachée. null : effacée. */
export async function histoire(id: string): Promise<{ aUnCompte: boolean } | null> {
  const [ligne] = await sql()<{ aUnCompte: boolean }[]>`select user_id is not null as "aUnCompte" from stories where id = ${id}`;
  return ligne ?? null;
}

/** Le lien « Retire ton email de la liste » d’un mail de la liste d’attente, tel que la version texte du mail le donne. */
export function lienDeRetrait(mail: { sujet: string; texte: string }): string {
  const lien = mail.texte.match(/Retire ton email de la liste : (\S+)/)?.[1];
  if (!lien) throw new Error(`pas de lien de retrait dans le mail « ${mail.sujet} »`);
  return lien;
}

/**
 * Le texte de l’écran (le contenu principal), tel que la personne le lit, l’email tapé remplacé : de quoi comparer ce que
 * voient un invité et un email hors de la liste. Le compte à rebours du renvoi du code, lui, avance avec le temps.
 */
export async function ecranLu(page: Page, email: string): Promise<string> {
  const texte = await page.getByRole("main").innerText();
  return texte.replaceAll(email, "‹email›").replace(/\(\d+ s\)/g, "(… s)");
}
