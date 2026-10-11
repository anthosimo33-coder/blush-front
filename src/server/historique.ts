import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
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
