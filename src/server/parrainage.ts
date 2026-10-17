import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { PARRAINAGE } from "@/contenu/offres";
import { mouvementDans, type Executeur } from "./bulles";
import { db, schema } from "./db";
import { env } from "./env";
import { journal } from "./journal";

/*
 * Le parrainage : chaque compte a un lien (/p/<code>) qu’il donne à une amie. Le lien pose le code dans un cookie
 * (30 jours) ; le compte créé ensuite dans ce navigateur garde sa marraine (users.parrain_id). Au premier rapport payé
 * de la filleule (livrer, src/server/achats.ts), chacune reçoit PARRAINAGE.bulles, une fois ; remboursé ou contesté sans
 * autre rapport payé, elles sont reprises. La filleule ne voit rien de sa marraine (ni conv, ni prénom), et l’inverse.
 * Jamais sa propre marraine, jamais une marraine posée après coup sur un compte qui existait déjà.
 * TODO(produit): la page de confidentialité ne dit pas encore ce lien entre deux comptes (users.parrain_id), ni les
 * conditions du parrainage (à relire par le juriste avec le reste des mails).
 */

/** Les lettres d’un code : sans 0, O, 1, l ni i, qui se confondent à l’œil. */
const LETTRES = "abcdefghjkmnpqrstuvwxyz23456789";
const LONGUEUR = 7;

/** La forme d’un code de parrainage : ce que /p/<code> accepte, rien d’autre. */
export const CODE = new RegExp(`^[${LETTRES}]{${LONGUEUR}}$`);

/** Un compte créé il y a moins de ce temps est neuf : seul un compte neuf prend une marraine. */
const COMPTE_NEUF_MS = 30 * 60e3;

/** Le code de parrainage du compte, créé la première fois (unique : un tirage déjà pris se refait). */
export async function codeDe(userId: string): Promise<string> {
  const u = schema.users;
  for (let essai = 0; essai < 5; essai++) {
    const [deja] = await db().select({ code: u.codeParrainage }).from(u).where(eq(u.id, userId));
    if (deja?.code) return deja.code;
    const code = Array.from({ length: LONGUEUR }, () => LETTRES[randomInt(LETTRES.length)]).join("");
    try {
      await db()
        .update(u)
        .set({ codeParrainage: code })
        .where(and(eq(u.id, userId), isNull(u.codeParrainage)));
    } catch {
      /* Le code tiré était déjà pris (l’index unique) : un autre tirage */
    }
  }
  throw new Error("parrainage : aucun code libre");
}

/** Le lien de parrainage du compte, à donner à une amie. */
export const lienDeParrainage = async (userId: string) => `${env().BLUSH_URL}/p/${await codeDe(userId)}`;

/**
 * Le compte qui vient de naître garde sa marraine : celle du code du cookie, si ce code existe, si ce n’est pas le sien,
 * et si le compte est neuf et sans marraine. Vrai si elle est notée.
 */
export async function noterLaMarraine(utilisateur: { id: string; createdAt: Date | string }, code: string | undefined): Promise<boolean> {
  if (!code || !CODE.test(code) || Date.now() - new Date(utilisateur.createdAt).getTime() > COMPTE_NEUF_MS) return false;
  const u = schema.users;
  const [marraine] = await db().select({ id: u.id }).from(u).where(eq(u.codeParrainage, code));
  if (!marraine || marraine.id === utilisateur.id) return false;
  const notee = await db()
    .update(u)
    .set({ parrainId: marraine.id })
    .where(and(eq(u.id, utilisateur.id), isNull(u.parrainId)))
    .returning({ id: u.id });
  if (notee.length) journal("parrainage", { evenement: "filleule" });
  return notee.length > 0;
}

/** Au premier rapport payé de la filleule, dans la transaction de sa livraison : ses bulles et celles de sa marraine, une fois. */
export async function recompenserLeParrainage(tx: Executeur, filleuleId: string): Promise<void> {
  const [f] = await tx.select({ marraine: schema.users.parrainId }).from(schema.users).where(eq(schema.users.id, filleuleId));
  if (!f?.marraine) return;
  if (await mouvementDans(tx, filleuleId, PARRAINAGE.bulles, "parrainage", `filleule:${filleuleId}`))
    await mouvementDans(tx, f.marraine, PARRAINAGE.bulles, "parrainage", `marraine:${filleuleId}`);
}

/**
 * Un rapport de la filleule remboursé ou contesté, dans la transaction de la reprise : sans autre rapport payé, les
 * bulles du parrainage sont reprises, aux deux (une fois ; elles ne se redonnent pas).
 */
export async function reprendreLeParrainage(tx: Executeur, filleuleId: string): Promise<void> {
  const m = schema.mouvementsBulles;
  const a = schema.achats;
  const [donnees] = await tx
    .select({ id: m.id })
    .from(m)
    .where(and(eq(m.raison, "parrainage"), eq(m.ref, `filleule:${filleuleId}`)));
  if (!donnees) return;
  const [autre] = await tx
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.userId, filleuleId), eq(a.statut, "paye"), sql`${a.storyId} is not null`))
    .limit(1);
  if (autre) return;
  const [marraine] = await tx
    .select({ id: m.userId })
    .from(m)
    .where(and(eq(m.raison, "parrainage"), eq(m.ref, `marraine:${filleuleId}`)));
  await mouvementDans(tx, filleuleId, -PARRAINAGE.bulles, "remboursement", `parrainage:filleule:${filleuleId}`);
  if (marraine) await mouvementDans(tx, marraine.id, -PARRAINAGE.bulles, "remboursement", `parrainage:marraine:${filleuleId}`);
}
