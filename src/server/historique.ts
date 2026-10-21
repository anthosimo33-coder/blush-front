import "server-only";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { URGENCES } from "@/contenu/aide";
import type { BlushAnswer } from "@/types";
import * as coffre from "./coffre";
import { db, schema } from "./db";

/*
 * L’historique du chat, à part du chat lui-même : l’accueil le réaffiche à chaque ouverture sans charger le modèle
 * (le SDK et les prompts de src/server/chat.ts).
 */

/* La longueur d’une ligne, telle que l’écran la dessine : en caractères (un emoji en vaut un), jamais son texte */
const longueur = (texte: string) => Array.from(texte).length;

/**
 * Une réponse verrouillée (écrite à 0 bulle), telle qu’elle quitte le serveur, à partir de la réponse en base
 * (`reponse`, déchiffrée ici et jamais envoyée telle quelle) : la lecture de BLUSH se lit en clair (ses bulles et les
 * messages qu’elles citent) ; la réponse à lui envoyer, son pourquoi, la relance et le geste attendent d’être payés, et
 * seule la forme de la réponse à envoyer part (VerrouDeLaReponse, « reponse »). Sans réponse à envoyer (une question,
 * un geste, une lecture seule), rien ne la distingue de ce qui se paie : elle se verrouille en entier, et seule la forme
 * de ses bulles part (« tout »). Le reste (un niveau franchi, son vocal) attend aussi. Avec de quoi la lire une fois
 * payée (son message, son coût) et le mode vocal du chat. `alerte` : la réponse est sortie en alerte (danger, détresse,
 * mineur) ; elle se paie comme les autres, mais les numéros d’urgence (URGENCES) se lisent en clair, avant elle.
 */
export function reponseMasquee(message: number, cout: number, reponse: BlushAnswer, modeVocal?: boolean, alerte = false): BlushAnswer {
  const envoi = reponse.send?.filter(Boolean) ?? [];
  const avecVocal = modeVocal === undefined ? {} : { modeVocal };
  const aide = alerte ? [{ text: URGENCES }] : [];
  if (envoi.length)
    return {
      kind: "bubbles",
      bubbles: [...aide, ...reponse.bubbles.map(({ text, messages }) => ({ text, ...(messages ? { messages } : {}) }))],
      verrouillee: { message, cout, cache: { quoi: "reponse", lignes: envoi.map(longueur) } },
      ...avecVocal,
    };
  const tout = [...reponse.bubbles.map((b) => b.text), reponse.ask ?? "", reponse.react ?? ""].filter(Boolean);
  return { kind: "bubbles", bubbles: aide, verrouillee: { message, cout, cache: { quoi: "tout", lignes: tout.map(longueur) } }, ...avecVocal };
}

/** Une réponse de BLUSH telle qu’elle quitte le serveur : en entier, ou masquée si elle est verrouillée (reponseMasquee). */
function reponseAffichee(blush: { id: number; data: Buffer; cout: number | null; verrouillee: boolean }): BlushAnswer {
  const { reponse, alerte } = coffre.lire("chat_messages.data:blush", blush.data);
  return blush.verrouillee ? reponseMasquee(blush.id, blush.cout ?? 1, reponse, undefined, !!alerte) : reponse;
}

/** Un échange avec BLUSH, tel que l’accueil le réaffiche : `id` (celui de ton message) sert à charger ceux d’avant. */
export type EchangeAffiche = { id: number; mine: string; answer: BlushAnswer; at: number };

/**
 * L’historique du chat, du plus ancien au plus récent : les derniers messages, ou ceux d’avant `avant` (l’id d’un
 * échange déjà affiché). Rien n’est jamais effacé tant que la conv existe : on charge simplement par morceaux.
 * `plus` : il en reste d’autres, plus anciens. Un message de BLUSH coupé de sa question (au bord d’un morceau)
 * revient avec elle dans le morceau d’avant. `modeVocal` : celui de l’histoire, quand l’appelant l’a déjà lue. Une
 * réponse verrouillée (écrite à 0 bulle) revient masquée (reponseMasquee) : sa lecture, et la forme de ce qui se paie.
 */
export async function historique(
  storyId: string,
  { avant, limite = 40, modeVocal }: { avant?: number; limite?: number; modeVocal?: boolean } = {},
): Promise<{ echanges: EchangeAffiche[]; plus: boolean; modeVocal: boolean }> {
  const ou = avant ? and(eq(schema.chatMessages.storyId, storyId), lt(schema.chatMessages.id, avant)) : eq(schema.chatMessages.storyId, storyId);
  const lignes = (await db().select().from(schema.chatMessages).where(ou).orderBy(desc(schema.chatMessages.id)).limit(limite)).reverse();
  const echanges: EchangeAffiche[] = [];
  /* Chaque ligne avec la suivante : un message de toi, puis la réponse de BLUSH */
  lignes.forEach((ligne, i) => {
    const suivante = lignes[i + 1];
    if (ligne.role !== "toi" || suivante?.role !== "blush") return;
    const toi = coffre.lire("chat_messages.data:toi", ligne.data);
    echanges.push({ id: ligne.id, mine: toi.affiche ?? toi.texte, answer: reponseAffichee(suivante), at: ligne.createdAt.getTime() });
  });
  /* Le mode vocal, tel qu’il est en base : « Repasser à l’écrit » le coupe sans nouvelle réponse */
  if (modeVocal !== undefined) return { echanges, plus: lignes.length === limite, modeVocal };
  const [s] = await db().select({ chatVocal: schema.stories.chatVocal }).from(schema.stories).where(eq(schema.stories.id, storyId));
  return { echanges, plus: lignes.length === limite, modeVocal: !!s?.chatVocal };
}

/** Combien de messages récents on relit pour retrouver un envoi déjà fait (sa clé) : un « Réessayer » suit de près. */
const RELUS_POUR_UNE_CLE = 20;

/**
 * La réponse de BLUSH à l’envoi de cette clé (POST /api/chat, `cle`), s’il est déjà fait dans cette conv : un
 * « Réessayer » après une coupure, ou un double toucher. Elle telle qu’en base (masquée si elle est verrouillée),
 * l’échange (l’id de ton message) et ce qu’elle a coûté ; null : pas d’envoi de cette clé parmi les derniers messages,
 * ou pas encore de réponse gardée. Seuls les derniers messages sont relus (et déchiffrés).
 */
export async function reponseDeLEnvoi(storyId: string, cle: string): Promise<{ reponse: BlushAnswer; echange: number; cout: number | null; verrouillee: boolean } | null> {
  const c = schema.chatMessages;
  const lignes = await db().select().from(c).where(eq(c.storyId, storyId)).orderBy(desc(c.id)).limit(RELUS_POUR_UNE_CLE);
  /* Un message de toi de cette clé, et la réponse qui le suit : l’id d’après (un échange prend ses deux ids d’un coup) */
  for (const toi of lignes) {
    if (toi.role !== "toi" || coffre.lire("chat_messages.data:toi", toi.data).cle !== cle) continue;
    const blush = lignes.find((l) => l.id === toi.id + 1);
    if (blush?.role !== "blush") return null;
    return { reponse: reponseAffichee(blush), echange: toi.id, cout: blush.cout, verrouillee: blush.verrouillee };
  }
  return null;
}

/** Un échange du chat, déchiffré : ton message et la réponse de BLUSH qui le suit. */
type EchangeLu = { toi: coffre.Formes["chat_messages.data:toi"]; blush: coffre.Formes["chat_messages.data:blush"] };

/**
 * L’échange du chat de cette conv qui commence par ton message `idToi` : lui, et le message de BLUSH qui le suit. null :
 * pas de tel message de toi dans cette conv, pas encore de réponse juste après, ou une réponse verrouillée (pas encore
 * payée : rien ne s’en partage).
 */
export async function echangeDuChat(storyId: string, idToi: number): Promise<EchangeLu | null> {
  const c = schema.chatMessages;
  const [toi] = await db()
    .select({ id: c.id, data: c.data })
    .from(c)
    .where(and(eq(c.id, idToi), eq(c.storyId, storyId), eq(c.role, "toi")));
  if (!toi) return null;
  const [blush] = await db()
    .select({ role: c.role, data: c.data, verrouillee: c.verrouillee })
    .from(c)
    .where(and(eq(c.storyId, storyId), gt(c.id, toi.id)))
    .orderBy(asc(c.id))
    .limit(1);
  if (blush?.role !== "blush" || blush.verrouillee) return null;
  return { toi: coffre.lire("chat_messages.data:toi", toi.data), blush: coffre.lire("chat_messages.data:blush", blush.data) };
}

/**
 * Une réponse de BLUSH de ce compte (`message`, son id), une fois payée : elle telle qu’en base, l’échange auquel elle
 * appartient (l’id de ton message juste avant) et son coût. null : pas une réponse de ce compte, ou encore verrouillée.
 */
export async function reponseDuCompte(userId: string, message: number): Promise<{ reponse: BlushAnswer; echange: number | null; cout: number | null } | null> {
  const c = schema.chatMessages;
  const [blush] = await db()
    .select({ storyId: c.storyId, data: c.data, cout: c.cout })
    .from(c)
    .innerJoin(schema.stories, eq(schema.stories.id, c.storyId))
    .where(and(eq(c.id, message), eq(c.role, "blush"), eq(c.verrouillee, false), eq(schema.stories.userId, userId)));
  if (!blush) return null;
  const [avant] = await db()
    .select({ id: c.id, role: c.role })
    .from(c)
    .where(and(eq(c.storyId, blush.storyId), lt(c.id, message)))
    .orderBy(desc(c.id))
    .limit(1);
  return { reponse: coffre.lire("chat_messages.data:blush", blush.data).reponse, echange: avant?.role === "toi" ? avant.id : null, cout: blush.cout };
}

/** Le chat en vocal (il a demandé à BLUSH de lui parler en vocal), ou de nouveau à l’écrit. */
export async function definirChatVocal(storyId: string, actif: boolean): Promise<void> {
  await db().update(schema.stories).set({ chatVocal: actif }).where(eq(schema.stories.id, storyId));
}
