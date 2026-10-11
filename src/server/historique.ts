import "server-only";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import type { BlushAnswer } from "@/types";
import * as coffre from "./coffre";
import { db, schema } from "./db";

/*
 * L’historique du chat, à part du chat lui-même : l’accueil le réaffiche à chaque ouverture sans charger le modèle
 * (le SDK et les prompts de src/server/chat.ts).
 */

/** Un échange avec BLUSH, tel que l’accueil le réaffiche : `id` (celui de ton message) sert à charger ceux d’avant. */
export type EchangeAffiche = { id: number; mine: string; answer: BlushAnswer; at: number };

/**
 * L’historique du chat, du plus ancien au plus récent : les derniers messages, ou ceux d’avant `avant` (l’id d’un
 * échange déjà affiché). Rien n’est jamais effacé tant que la conv existe : on charge simplement par morceaux.
 * `plus` : il en reste d’autres, plus anciens. Un message de BLUSH coupé de sa question (au bord d’un morceau)
 * revient avec elle dans le morceau d’avant. `modeVocal` : celui de l’histoire, quand l’appelant l’a déjà lue.
 */
export async function historique(
  storyId: string,
  { avant, limite = 40, modeVocal }: { avant?: number; limite?: number; modeVocal?: boolean } = {},
): Promise<{ echanges: EchangeAffiche[]; plus: boolean; modeVocal: boolean }> {
  const ou = avant ? and(eq(schema.chatMessages.storyId, storyId), lt(schema.chatMessages.id, avant)) : eq(schema.chatMessages.storyId, storyId);
  const lignes = (await db().select().from(schema.chatMessages).where(ou).orderBy(desc(schema.chatMessages.id)).limit(limite)).reverse();
  const echanges: EchangeAffiche[] = [];
  for (let i = 0; i < lignes.length - 1; i++) {
    if (lignes[i].role !== "toi" || lignes[i + 1].role !== "blush") continue;
    const toi = coffre.lire("chat_messages.data:toi", lignes[i].data);
    const blush = coffre.lire("chat_messages.data:blush", lignes[i + 1].data);
    echanges.push({ id: lignes[i].id, mine: toi.affiche ?? toi.texte, answer: blush.reponse, at: lignes[i].createdAt.getTime() });
  }
  /* Le mode vocal, tel qu’il est en base : « Repasser à l’écrit » le coupe sans nouvelle réponse */
  if (modeVocal !== undefined) return { echanges, plus: lignes.length === limite, modeVocal };
  const [s] = await db().select({ chatVocal: schema.stories.chatVocal }).from(schema.stories).where(eq(schema.stories.id, storyId));
  return { echanges, plus: lignes.length === limite, modeVocal: !!s?.chatVocal };
}

/** Un échange du chat, déchiffré : ton message et la réponse de BLUSH qui le suit. */
type EchangeLu = { toi: coffre.Formes["chat_messages.data:toi"]; blush: coffre.Formes["chat_messages.data:blush"] };

/**
 * L’échange du chat de cette conv qui commence par ton message `idToi` : lui, et le message de BLUSH qui le suit. null :
 * pas de tel message de toi dans cette conv, ou pas encore de réponse juste après.
 */
export async function echangeDuChat(storyId: string, idToi: number): Promise<EchangeLu | null> {
  const c = schema.chatMessages;
  const [toi] = await db()
    .select({ id: c.id, data: c.data })
    .from(c)
    .where(and(eq(c.id, idToi), eq(c.storyId, storyId), eq(c.role, "toi")));
  if (!toi) return null;
  const [blush] = await db()
    .select({ role: c.role, data: c.data })
    .from(c)
    .where(and(eq(c.storyId, storyId), gt(c.id, toi.id)))
    .orderBy(asc(c.id))
    .limit(1);
  if (blush?.role !== "blush") return null;
  return { toi: coffre.lire("chat_messages.data:toi", toi.data), blush: coffre.lire("chat_messages.data:blush", blush.data) };
}

/** Le chat en vocal (il a demandé à BLUSH de lui parler en vocal), ou de nouveau à l’écrit. */
export async function definirChatVocal(storyId: string, actif: boolean): Promise<void> {
  await db().update(schema.stories).set({ chatVocal: actif }).where(eq(schema.stories.id, storyId));
}
