import type { TestInfo } from "@playwright/test";
import { dechiffrer, sql } from "./base";
import { ecrire, NOE_ET_MAELYS, texteWhatsApp } from "./exports";

/*
 * Les aides propres aux tests de l’import (tests/e2e/import*.spec.ts) : les fichiers qui le font échouer, le code qu’on
 * rate ou qui expire, et ce que « Qui es-tu ? » a laissé en base. Tout reste fictif, comme dans exports.ts.
 */

/** Un autre code à 6 chiffres que celui-ci : faux à coup sûr. */
export const autreCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

/** Le code de cet email expire maintenant, comme dix minutes plus tard (src/server/auth.ts, CODE_MINUTES). */
export async function expirerCode(email: string): Promise<void> {
  const r = await sql()`update login_codes set expires_at = now() - interval '1 second' where email = ${email.toLowerCase()}`;
  if (!r.count) throw new Error(`aucun code en cours pour ${email}`);
}

/* ———— Des fichiers qui ne passent pas ———— */

/**
 * Une conv de groupe : l’export de Noé et Maëlys, où une troisième personne (Inès) écrit un message sur trois. Assez
 * pour être une vraie participante (src/server/histoires.ts, `principaux`).
 */
export function exportGroupeWhatsApp(testInfo: TestInfo): string {
  let k = 0;
  const texte = texteWhatsApp(NOE_ET_MAELYS, 64)
    .split("\n")
    .map((ligne, i) => (i > 0 && /^‎?\[[^\]]+\] (Noé|Maëlys): /.test(ligne) && ++k % 3 === 0 ? ligne.replace(/\] (Noé|Maëlys): /, "] Inès: ") : ligne))
    .join("\n");
  return ecrire(testInfo.outputPath("exports", "groupe", "_chat.txt"), texte);
}

/** Un .txt qui n’est pas une conv (une liste de courses) : le navigateur l’envoie, le serveur le refuse. */
export function texteQuiNEstPasUneConv(testInfo: TestInfo): string {
  return ecrire(testInfo.outputPath("exports", "courses.txt"), "Liste de courses\n- pâtes\n- tomates\n- chocolat noir\n");
}

/** Un .zip abîmé (sa signature, puis rien de lisible) : le navigateur ne l’ouvre pas, rien ne part. */
export function zipAbime(testInfo: TestInfo): string {
  return ecrire(testInfo.outputPath("exports", "WhatsApp Chat - Maëlys.zip"), new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 60 }, (_, k) => (k * 37) % 256)]));
}

/* ———— Ce que « Qui es-tu ? » a laissé en base ———— */

/** Les réponses de « Qui es-tu ? » enregistrées avec la conv : qui est l’utilisateur, son pronom, sa devinette, son objectif. */
export type QuiEnregistre = { moi: string; pronom?: string; devinette?: string; objectif?: string };

/**
 * Ce que la dernière conv importée par ce compte a gardé de « Qui es-tu ? » (stories.meta, chiffré) : le prénom choisi,
 * le pronom, la devinette et l’objectif. Rien avant la lecture : le serveur les reçoit en la lançant.
 */
export async function quiEnregistre(email: string): Promise<QuiEnregistre | null> {
  const [s] = await sql()<{ meta: Buffer }[]>`
    select s.meta from stories s join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1`;
  if (!s) return null;
  const meta = dechiffrer<{ participants: { prenom: string }[]; moi?: 0 | 1; pronom?: string; devinette?: string; objectif?: string }>(s.meta);
  return { moi: meta.moi == null ? "" : meta.participants[meta.moi].prenom, pronom: meta.pronom, devinette: meta.devinette, objectif: meta.objectif };
}
