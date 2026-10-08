import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { messagesAffiches } from "@prompts/lib/front";
import type { Vocal } from "@prompts/lib/schemas";
import { minuter, texteDit } from "@/lib/vocal";
import type { VocalLigne, VocalRapport } from "@/types";
import { chiffrer, chiffrerOctets, dechiffrer, dechiffrerOctets } from "./chiffrement";
import { db, schema } from "./db";
import { histoireDe, metaDe, type Ligne } from "./histoires";
import { dire, voixPour, type Voix } from "./ia/voix";

/*
 * Le vocal du rapport, une fois le script écrit (analyse.ts, tâche « vocal ») : on le fait dire par la voix de l’A/B
 * test, on le minute d’après l’audio, et on garde les deux, chiffrés. Le front le lit avec ses sous-titres.
 */
export type DonneesVocal = { sobre: boolean; lignes: VocalLigne[] };

export async function vocalExiste(storyId: string): Promise<boolean> {
  const [n] = await db().select({ n: count() }).from(schema.vocals).where(eq(schema.vocals.storyId, storyId));
  return (n?.n ?? 0) > 0;
}

/**
 * Fait dire le script et le garde. `lignes` : les messages qu’il pouvait citer (la banque des preuves) ; un message
 * cité s’affiche en bulle pendant qu’elle en parle. Un vocal déjà fait n’est pas refait (deux tâches en même temps).
 */
export async function enregistrerVocal(story: Ligne, script: Vocal, lignes: Map<string, string>, sobre: boolean): Promise<void> {
  if (!script.lignes.length || (await vocalExiste(story.id))) return;
  const voix: Voix = voixPour(story.userId ?? story.id);
  const { texte } = texteDit(script.lignes);
  const { audio, alignement } = await dire(texte, voix, { sobre, storyId: story.id });
  const prenom = histoireDe(metaDe(story)).utilisateur.prenom;
  const messages = messagesAffiches(lignes, prenom);
  const minutees: VocalLigne[] = minuter(script.lignes, alignement).map((l, k) => {
    const recu = script.lignes[k].preuve ? messages.get(script.lignes[k].preuve!) : undefined;
    return recu ? { ...l, recu } : l;
  });
  const fin = Math.max(...alignement.character_end_times_seconds, ...minutees.map((l) => l.fin));
  const donnees: DonneesVocal = { sobre, lignes: minutees };
  await db()
    .insert(schema.vocals)
    .values({ storyId: story.id, voix, data: chiffrer(donnees), audio: chiffrerOctets(audio), dureeMs: Math.round(fin * 1000) })
    .onConflictDoNothing();
}

/** Le vocal tel que l’affiche le front, s’il est fait. L’adresse de l’audio change avec lui (le navigateur le garde en cache). */
export async function vocalPret(storyId: string): Promise<Extract<VocalRapport, { etat: "pret" }> | null> {
  const [v] = await db()
    .select({ voix: schema.vocals.voix, data: schema.vocals.data, dureeMs: schema.vocals.dureeMs, createdAt: schema.vocals.createdAt })
    .from(schema.vocals)
    .where(eq(schema.vocals.storyId, storyId));
  if (!v) return null;
  const d = dechiffrer<DonneesVocal>(v.data);
  return { etat: "pret", audio: `/api/vocal/audio?v=${v.createdAt.getTime().toString(36)}`, duree: v.dureeMs / 1000, voix: v.voix as Voix, sobre: d.sobre, lignes: d.lignes };
}

/** L’audio du vocal (MP3), déchiffré. */
export async function audioDe(storyId: string): Promise<Buffer | null> {
  const [v] = await db().select({ audio: schema.vocals.audio }).from(schema.vocals).where(eq(schema.vocals.storyId, storyId));
  return v ? dechiffrerOctets(v.audio) : null;
}

export const EVENEMENTS = ["debut", "fin", "reecoute", "ferme"] as const;
export type Evenement = (typeof EVENEMENTS)[number];

/** Note un moment de l’écoute (pour comparer les deux voix). Sans vocal, rien. */
export async function noterEcoute(storyId: string, evenement: Evenement, positionMs: number): Promise<void> {
  const [v] = await db().select({ voix: schema.vocals.voix }).from(schema.vocals).where(eq(schema.vocals.storyId, storyId));
  if (!v) return;
  await db()
    .insert(schema.vocalEcoutes)
    .values({ storyId, voix: v.voix, evenement, positionMs: Math.max(0, Math.min(10 * 60_000, Math.round(positionMs))) });
}

/**
 * Les chiffres de l’A/B test, voix par voix : combien de vocaux, combien écoutés, écoutés jusqu’au bout, réécoutés,
 * et jusqu’où on va en moyenne (en part du vocal).
 */
export async function statsVocal() {
  const lignes = await db()
    .select({
      voix: schema.vocals.voix,
      vocaux: sql<number>`count(distinct ${schema.vocals.storyId})`,
      ecoutes: sql<number>`count(distinct ${schema.vocalEcoutes.storyId}) filter (where ${schema.vocalEcoutes.evenement} = 'debut')`,
      finis: sql<number>`count(distinct ${schema.vocalEcoutes.storyId}) filter (where ${schema.vocalEcoutes.evenement} = 'fin')`,
      reecoutes: sql<number>`count(distinct ${schema.vocalEcoutes.storyId}) filter (where ${schema.vocalEcoutes.evenement} = 'reecoute')`,
      jusqua: sql<number>`avg(least(1, ${schema.vocalEcoutes.positionMs}::float / ${schema.vocals.dureeMs})) filter (where ${schema.vocalEcoutes.evenement} in ('fin', 'ferme'))`,
    })
    .from(schema.vocals)
    .leftJoin(schema.vocalEcoutes, and(eq(schema.vocalEcoutes.storyId, schema.vocals.storyId)))
    .groupBy(schema.vocals.voix)
    .orderBy(schema.vocals.voix);
  return lignes.map((l) => ({ ...l, vocaux: Number(l.vocaux), ecoutes: Number(l.ecoutes), finis: Number(l.finis), reecoutes: Number(l.reecoutes), jusqua: l.jusqua == null ? null : Number(l.jusqua) }));
}
