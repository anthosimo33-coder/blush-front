import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { empreinte, jeton, memeEmpreinte } from "./chiffrement";
import { db, schema } from "./db";
import { envoyerCodeParEmail } from "./email";
import { accesLibre } from "./env";

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

/** Vérifie le code. Bon : crée le compte s’il n’existe pas et le renvoie. */
export async function verifierCode(email: string, code: string): Promise<Utilisateur | null> {
  const [ligne] = await db().select().from(schema.loginCodes).where(eq(schema.loginCodes.email, email));
  if (!ligne || ligne.expiresAt < new Date() || ligne.attempts >= CODE_ESSAIS) return null;
  await db()
    .update(schema.loginCodes)
    .set({ attempts: ligne.attempts + 1 })
    .where(eq(schema.loginCodes.email, email));
  if (!/^\d{6}$/.test(code) || !memeEmpreinte(`${email}:${code}`, ligne.codeHash)) return null;
  await db().delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));

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

/** Le compte d’une session, ou null. */
export async function utilisateurDeSession(secret: string | undefined): Promise<Utilisateur | null> {
  if (!secret) return null;
  const [ligne] = await db()
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, empreinte(secret)), gt(schema.sessions.expiresAt, new Date())));
  return ligne?.user ?? null;
}

export async function fermerSession(secret: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.id, empreinte(secret)));
}
