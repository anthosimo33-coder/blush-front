import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { ADMIN } from "../reglages";
import { oublierLimiteDesCodes, sql } from "./base";
import { RESEAU } from "./page";
import { seConnecter } from "./parcours";

/*
 * Les aides des pages publiques et de l’équipe (public-admin*.spec.ts) : se connecter avec l’email de l’équipe, et
 * préparer en base ce qu’aucun écran ne crée (un partage illisible, une conv importée il y a plus de 24 h).
 */

/**
 * Se connecter avec l’email de l’équipe (ADMIN, dans BLUSH_ADMINS), par l’interface. Il n’y en a qu’un pour tous les
 * workers : deux connexions en même temps liraient l’une le code de l’autre dans la boîte à mails (le dernier arrivé),
 * qui ne vaut que dans le navigateur qui l’a demandé. Un verrou Postgres les fait passer l’une après l’autre ; et ses
 * compteurs de codes (dix par jour) repartent de zéro, pour --repeat-each.
 */
export async function seConnecterAdmin(page: Page, { timeout = RESEAU }: { timeout?: number } = {}): Promise<void> {
  const verrou = await sql().reserve();
  try {
    const fin = Date.now() + timeout;
    for (;;) {
      const [{ pris }] = await verrou<{ pris: boolean }[]>`select pg_try_advisory_lock(hashtext('blush-e2e:admin')) as pris`;
      if (pris) break;
      if (Date.now() > fin) throw new Error(`la connexion de ${ADMIN} attend son tour depuis ${timeout} ms`);
      await new Promise((r) => setTimeout(r, 200));
    }
    try {
      await oublierLimiteDesCodes(ADMIN);
      await seConnecter(page, ADMIN);
    } finally {
      await verrou`select pg_advisory_unlock(hashtext('blush-e2e:admin'))`;
    }
  } finally {
    verrou.release();
  }
}

/**
 * Un lien de partage dont le verdict ne se déchiffre plus (chiffré avec une autre clé, abîmé) : la page /v/<id> plante
 * en le lisant. Sa conv est un brouillon sans compte, créé maintenant (la purge ne le prend pas). Renvoie l’identifiant
 * du lien et de quoi tout effacer.
 */
export async function partageIllisible(): Promise<{ id: string; effacer: () => Promise<void> }> {
  /* Les octets d’un chiffré de BLUSH (la version 1, puis du bruit) : la version passe, l’authentification échoue */
  const illisible = () => Buffer.concat([Buffer.from([1]), randomBytes(48)]);
  const id = randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "x").slice(0, 12);
  const [story] = await sql()<{ id: string }[]>`insert into stories (message_count, meta) values (64, ${illisible()}) returning id`;
  await sql()`insert into shares (id, story_id, data) values (${id}, ${story.id}, ${illisible()})`;
  return { id, effacer: async () => void (await sql()`delete from stories where id = ${story.id}`) };
}

/** Désactive un lien de partage, comme le bouton du rapport (la ligne part ; la conv reste). */
export async function desactiverPartage(id: string): Promise<void> {
  await sql()`delete from shares where id = ${id}`;
}

/** Fait comme si cette histoire avait été importée il y a `heures` heures. */
export async function vieillirHistoire(id: string, heures: number): Promise<void> {
  const r = await sql()`update stories set created_at = now() - make_interval(hours => ${heures}) where id = ${id}`;
  if (!r.count) throw new Error(`aucune histoire ${id}`);
}
