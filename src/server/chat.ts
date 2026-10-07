import "server-only";
import { desc, eq } from "drizzle-orm";
import { requeteChat, type Fil } from "@prompts/lib/contextes";
import { bullesAffichees, messagesAffiches } from "@prompts/lib/front";
import { introuvables, preuvesChat } from "@prompts/lib/preuves";
import { Sortie10, type ReponseChat } from "@prompts/lib/schemas";
import type { BlushAnswer, LevelId } from "@/types";
import type { DonneesMemoire } from "./analyse";
import { ErreurTache } from "./erreurs";
import { chiffrer, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { appeler, textesSysteme } from "./ia/claude";
import { recopieLesPrompts, REFUS_FUITE } from "./ia/garde";
import { planifier } from "./taches";
import { aujourdhuiParis } from "./temps";

/* Le chat du quotidien : la mémoire à la place de la conv, les derniers échanges, ce qu’il vient d’écrire. */

type MessageToi = { texte: string };
type MessageBlush = { reponse: BlushAnswer; resume: string };
const ECHANGES_DANS_LE_FIL = 6;


/** L’historique du chat, du plus ancien au plus récent : ce que l’accueil réaffiche, en paires (sa question, la réponse). */
export async function historique(storyId: string, limite = 40): Promise<{ mine: string; answer: BlushAnswer; at: number }[]> {
  const lignes = (await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, storyId)).orderBy(desc(schema.chatMessages.id)).limit(limite)).reverse();
  const paires: { mine: string; answer: BlushAnswer; at: number }[] = [];
  for (let i = 0; i < lignes.length - 1; i++) {
    if (lignes[i].role !== "toi" || lignes[i + 1].role !== "blush") continue;
    paires.push({ mine: dechiffrer<MessageToi>(lignes[i].data).texte, answer: dechiffrer<MessageBlush>(lignes[i + 1].data).reponse, at: lignes[i].createdAt.getTime() });
  }
  return paires;
}

async function fil(storyId: string): Promise<Fil> {
  const lignes = (await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, storyId)).orderBy(desc(schema.chatMessages.id)).limit(ECHANGES_DANS_LE_FIL * 2)).reverse();
  return lignes.map((l) => (l.role === "toi" ? { de: "toi" as const, texte: dechiffrer<MessageToi>(l.data).texte } : { de: "blush" as const, texte: dechiffrer<MessageBlush>(l.data).resume }));
}

const resume = (r: ReponseChat) => [...r.lecture.map((b) => b.texte), ...(r.a_envoyer ?? []), r.question ?? "", r.reaction ?? ""].filter(Boolean).join(" / ");
const texteDe = (r: ReponseChat) => [resume(r), r.pourquoi ?? ""].join(" ");

/** Une réponse de BLUSH, en bulles. Elle enregistre l’échange et, s’il apporte du neuf, programme la mise à jour de la mémoire. */
export async function repondre(story: Ligne, memoire: DonneesMemoire, dit: string): Promise<{ reponse: BlushAnswer; majMemoire: boolean }> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const ctx = contexteDe(story);
  if (!ctx) throw new ErreurTache("contexte_absent");
  const lignes = new Map(memoire.lignes);
  const jour = aujourdhuiParis();
  const req = requeteChat({ h, aujourdhui: jour.t, chiffres: ctx.chiffres, fin: ctx.fin, etat: memoire.etat, lignes, editions: memoire.editions, style: ctx.style, fil: await fil(story.id), dit });

  let sortie: ReponseChat | null = null;
  for (let essai = 0; essai < 2 && !sortie; essai++) {
    const a = await appeler(req, Sortie10, { storyId: story.id, etiquette: "chat" });
    if (a.refus) throw new ErreurTache("refus");
    if (a.sortie && (!introuvables(preuvesChat(a.sortie), lignes).length || essai === 1)) sortie = a.sortie;
  }
  if (!sortie) throw new ErreurTache("sortie_illisible");

  /* Le garde-fou : une réponse qui recopie les prompts est remplacée */
  const fuite = recopieLesPrompts(texteDe(sortie), textesSysteme);
  if (fuite) console.warn(`garde-fou : réponse remplacée (histoire ${story.id})`);
  const avant = memoire.etat.niveau?.niveau ?? null;
  const reponse: BlushAnswer = fuite
    ? { kind: "bubbles", bubbles: REFUS_FUITE.map((text) => ({ text })) }
    : {
        ...bullesAffichees(sortie, messagesAffiches(lignes, h.utilisateur.prenom)),
        ...(sortie.niveau_atteint && sortie.niveau_atteint !== avant ? { levelUp: sortie.niveau_atteint as LevelId } : {}),
      };

  await db()
    .insert(schema.chatMessages)
    .values([
      { storyId: story.id, role: "toi", data: chiffrer({ texte: dit } satisfies MessageToi) },
      { storyId: story.id, role: "blush", data: chiffrer({ reponse, resume: fuite ? REFUS_FUITE.join(" / ") : resume(sortie) } satisfies MessageBlush) },
    ]);

  /* Une nouvelle, un message reçu, une suite, ou un niveau qui bouge : la mémoire se met à jour après la réponse */
  const majMemoire = !fuite && (["nouvelle", "message_recu", "suite"].includes(sortie.type) || !!sortie.niveau_atteint);
  if (majMemoire) await planifier(story.id, "memoire_maj", { date: jour.iso, dit, reponse: sortie.lecture.map((b) => b.texte).concat(sortie.a_envoyer ?? []) });
  return { reponse, majMemoire };
}
