import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { empreinte, jeton, memeEmpreinte } from "./chiffrement";
import { db, schema } from "./db";
import { envoyerCodeParEmail } from "./email";
import { accesLibre, peutEntrer } from "./env";

const SESSION_JOURS = 90;
const CODE_MINUTES = 10;
const CODE_ESSAIS = 5;

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export type Utilisateur = typeof schema.users.$inferSelect;

/** Envoie un code à 6 chiffres. On n’en garde que l’empreinte, liée à l’email. */
export async function envoyerCode(email: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ligne = { codeHash: empreinte(`${email}:${code}`), expiresAt: new Date(Date.now() + CODE_MINUTES * 60e3), attempts: 0, createdAt: new Date() };
  await db()
    .insert(schema.loginCodes)
    .values({ email, ...ligne })
    .onConflictDoUpdate({ target: schema.loginCodes.email, set: ligne });
  await envoyerCodeParEmail(email, code);
}

/** Prend le code : bon, il est consommé (il ne sert qu’une fois). Faux sinon : mauvais, expiré, ou trop d’essais. */
export async function prendreCode(email: string, code: string): Promise<boolean> {
  /*
   * L’essai est compté avant de comparer, en une seule requête : des essais envoyés en même temps ne passent pas tous
   * sous la limite (lire puis écrire laissait chacun voir le même compte).
   */
  const [ligne] = await db()
    .update(schema.loginCodes)
    .set({ attempts: sql`${schema.loginCodes.attempts} + 1` })
    .where(and(eq(schema.loginCodes.email, email), lt(schema.loginCodes.attempts, CODE_ESSAIS), gt(schema.loginCodes.expiresAt, new Date())))
    .returning({ codeHash: schema.loginCodes.codeHash });
  if (!ligne) return false;
  if (!/^\d{6}$/.test(code) || !memeEmpreinte(`${email}:${code}`, ligne.codeHash)) return false;
  /* Le code ne sert qu’une fois : deux bons essais en même temps, un seul ouvre la session */
  const [pris] = await db()
    .delete(schema.loginCodes)
    .where(and(eq(schema.loginCodes.email, email), eq(schema.loginCodes.codeHash, ligne.codeHash)))
    .returning({ email: schema.loginCodes.email });
  return !!pris;
}

/** Vérifie le code. Bon : crée le compte s’il n’existe pas et le renvoie. */
export async function verifierCode(email: string, code: string): Promise<Utilisateur | null> {
  return (await prendreCode(email, code)) ? compteDe(email) : null;
}

/** Le compte de cet email, créé s’il n’existe pas. */
export async function compteDe(email: string): Promise<Utilisateur> {
  const [existant] = await db().select().from(schema.users).where(eq(schema.users.email, email));
  const utilisateur =
    existant ??
    (await db()
      .insert(schema.users)
      .values({ email, plan: accesLibre(email) ? "blushplus" : "gratuit" })
      .returning())[0];
  /* La bêta sans paiement : un email ajouté à la liste après coup a son accès à la connexion suivante */
  if (existant && existant.plan === "gratuit" && accesLibre(email)) {
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, existant.id));
    utilisateur.plan = "blushplus";
  }

  return utilisateur;
}

/** Ouvre une session : on garde l’empreinte du secret, le secret part dans le cookie. */
export async function ouvrirSession(userId: string): Promise<{ secret: string; expiresAt: Date }> {
  const secret = jeton();
  const expiresAt = new Date(Date.now() + SESSION_JOURS * 86400e3);
  await db().insert(schema.sessions).values({ id: empreinte(secret), userId, expiresAt });
  return { secret, expiresAt };
}

/**
 * Le compte d’une session, ou null. Bêta fermée : un email retiré de la liste n’entre plus, même avec une session
 * ouverte avant (elle dure 90 jours). Son plan ne change pas : ce qui a été donné reste donné, si la bêta s’ouvre.
 */
export async function utilisateurDeSession(secret: string | undefined): Promise<Utilisateur | null> {
  if (!secret) return null;
  const [ligne] = await db()
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, empreinte(secret)), gt(schema.sessions.expiresAt, new Date())));
  return ligne && peutEntrer(ligne.user.email) ? ligne.user : null;
}

export async function fermerSession(secret: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.id, empreinte(secret)));
}
