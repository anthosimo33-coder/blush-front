import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Vocal } from "@prompts/lib/schemas";
import { minuter, texteDit } from "@/lib/vocal";
import type { EvenementEcoute, VocalLigne, VocalRapport, Voix } from "@/types";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { Utilisateur } from "./auth";
import { donneesVerdict, PREDICATS } from "./depot";
import { rapportOuvert } from "./droits";
import { messagesAffiches } from "./ecrans/messages";
import { histoireDe, metaDe, UUID, type Ligne } from "./histoires";
import { COUPE_VOIX, dire, scriptQuiTient, voixPour } from "./ia/voix";
import { ouvertureDu } from "./presentation/rapport";

/*
 * Le vocal du rapport, une fois le script écrit (analyse.ts, tâche « vocal ») : on le fait dire par la voix de l’A/B
 * test, on le minute d’après l’audio, et on garde les deux, chiffrés. Le front le lit avec ses sous-titres (vocalLu). La
 * forme du script gardé est dans src/server/stockage/types.ts (DonneesVocal), et le coffre la range par colonne.
 */

/**
 * La version du script (prompt 06). Quand le prompt change, on l’augmente : les vocaux faits avant se refont à leur
 * prochaine ouverture. 2 : des phrases complètes, et chaque message cité annoncé (« elle t’a écrit : … »).
 */
const VERSION_VOCAL = 2;

/** Le vocal de l’histoire, s’il est fait : ce qu’en voit le front, s’il est à la version du script, et quand il a été fait. */
export async function vocalLu(storyId: string): Promise<{ pret: Extract<VocalRapport, { etat: "pret" }>; aJour: boolean; fait: Date } | null> {
  const [v] = await db()
    .select({ voix: schema.vocals.voix, data: schema.vocals.data, dureeMs: schema.vocals.dureeMs, createdAt: schema.vocals.createdAt })
    .from(schema.vocals)
    .where(eq(schema.vocals.storyId, storyId));
  if (!v) return null;
  /* Un vocal d’avant la version 2 n’en a pas : le coffre le relit en version 1 */
  const d = coffre.lire("vocals.data", v.data);
  return {
    pret: {
      etat: "pret",
      audio: `/api/vocal/audio?conv=${storyId}&v=${v.createdAt.getTime().toString(36)}`,
      duree: v.dureeMs / 1000,
      voix: v.voix,
      sobre: d.sobre,
      lignes: d.lignes,
    },
    aJour: d.version >= VERSION_VOCAL,
    fait: v.createdAt,
  };
}

/** Un vocal à la version du script existe-t-il déjà ? (Sinon, la tâche le fait, ou le refait.) */
export async function vocalAJour(storyId: string): Promise<boolean> {
  return (await vocalLu(storyId))?.aJour ?? false;
}

/**
 * Fait dire le script et le garde. `lignes` : les messages qu’il pouvait citer (la banque des preuves) ; un message
 * cité s’affiche en bulle pendant qu’elle en parle. Un vocal déjà fait n’est pas refait (deux tâches en même temps).
 */
export async function enregistrerVocal(story: Ligne, script: Vocal, lignes: Map<string, string>, sobre: boolean): Promise<void> {
  if (!script.lignes.length || (await vocalAJour(story.id))) return;
  const voix: Voix = voixPour(story.userId ?? story.id);
  /* Le script tient dans la coupe du vocal du rapport (S-13) : des lignes entières, pour que les sous-titres suivent l’audio */
  const dites = scriptQuiTient(script.lignes, COUPE_VOIX.rapport);
  const { texte } = texteDit(dites);
  const { audio, alignement } = await dire(texte, voix, { sobre, storyId: story.id, pour: "rapport" });
  const prenom = histoireDe(metaDe(story)).utilisateur.prenom;
  const messages = messagesAffiches(lignes, prenom);
  const minutees: VocalLigne[] = minuter(dites, alignement).map((l, k) => {
    const preuve = dites[k]?.preuve;
    const recu = preuve ? messages.get(preuve) : undefined;
    return recu ? { ...l, recu } : l;
  });
  const fin = Math.max(...alignement.character_end_times_seconds, ...minutees.map((l) => l.fin));
  const data = coffre.ecrire("vocals.data", { sobre, lignes: minutees, version: VERSION_VOCAL });
  const valeurs = { voix, data, audio: coffre.ecrireAudio(audio), dureeMs: Math.round(fin * 1000), createdAt: new Date() };
  /* Un vocal d’une version plus ancienne est remplacé (sa nouvelle date change l’adresse de l’audio) */
  await db()
    .insert(schema.vocals)
    .values({ storyId: story.id, ...valeurs })
    .onConflictDoUpdate({ target: schema.vocals.storyId, set: valeurs });
}

/*
 * Safari lit un audio en deux requêtes coup sur coup (deux octets, puis le reste). L’instance garde donc un moment
 * l’audio des derniers vocaux lus, CHIFFRÉ comme en base (jamais en clair hors de la requête) : la seconde requête ne
 * relit pas ses 500 Ko. Quelques vocaux, une minute : la place de quelques Mo.
 */
const GARDE_MS = 60_000;
const GARDES_MAX = 8;
const gardes = new Map<string, { fait: number; chiffre: Buffer; jusqua: number }>();

function garder(storyId: string, fait: number, chiffre: Buffer) {
  gardes.delete(storyId);
  gardes.set(storyId, { fait, chiffre, jusqua: Date.now() + GARDE_MS });
  /* Le plus ancien gardé part d’abord (une Map garde l’ordre d’insertion) */
  for (const cle of gardes.keys()) {
    if (gardes.size <= GARDES_MAX) break;
    gardes.delete(cle);
  }
}

/**
 * L’audio d’une réponse du chat dite en vocal (MP3), déchiffré, si elle est dans une conv de ce compte ; null sinon. Le
 * compte seul suffit : pas besoin de la conv ouverte.
 */
export async function audioDuChat(userId: string, id: number): Promise<Buffer | null> {
  const [v] = await db()
    .select({ audio: schema.chatVocals.audio })
    .from(schema.chatVocals)
    .innerJoin(schema.stories, eq(schema.stories.id, schema.chatVocals.storyId))
    .where(and(eq(schema.chatVocals.id, id), eq(schema.stories.userId, userId)));
  return v ? coffre.lireAudio(v.audio) : null;
}

/**
 * L’audio du vocal d’une conv de ce compte (MP3), déchiffré, en une seule requête qui vérifie aussi que la conv est à
 * lui. null : pas de conv à ce compte ; « acces » : le rapport de cette conv n’est pas ouvert à ce compte (ni débloqué,
 * ni l’équipe, ni le mode sobre : la même règle que sa lecture, ouvertureDu), par exemple payé puis remboursé ; `audio`
 * null : son vocal n’est pas prêt. Le verdict (le mode sobre) n’est relu que pour un rapport fermé.
 */
export async function audioDuCompte(compte: Pick<Utilisateur, "id" | "email">, storyId: string): Promise<{ audio: Buffer | null } | "acces" | null> {
  if (!UUID.test(storyId)) return null;
  let garde = gardes.get(storyId);
  if (garde && garde.jusqua < Date.now()) {
    gardes.delete(storyId);
    garde = undefined;
  }
  const [l] = await db()
    .select({
      debloqueLe: schema.stories.debloqueLe,
      fait: schema.vocals.createdAt,
      /* L’audio ne voyage que s’il n’est pas déjà gardé, à la même version (la même date) */
      chiffre: sql<Buffer | null>`case when date_trunc('milliseconds', ${schema.vocals.createdAt}) = ${garde ? new Date(garde.fait).toISOString() : null} then null else ${schema.vocals.audio} end`,
    })
    .from(schema.stories)
    .leftJoin(schema.vocals, eq(schema.vocals.storyId, schema.stories.id))
    .where(PREDICATS.convDuCompte(storyId, compte.id));
  if (!l) return null;
  if (!rapportOuvert(l, compte)) {
    const verdict = await donneesVerdict(storyId);
    if (!verdict || !ouvertureDu(false, verdict.sortie).ouvert) return "acces";
  }
  if (!l.fait) return { audio: null };
  const chiffre = l.chiffre ?? garde?.chiffre;
  if (!chiffre) return { audio: null };
  garder(storyId, l.fait.getTime(), chiffre);
  return { audio: coffre.lireAudio(chiffre) };
}

/** Note un moment de l’écoute (pour comparer les deux voix). Sans vocal, rien. */
export async function noterEcoute(storyId: string, evenement: EvenementEcoute, positionMs: number): Promise<void> {
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
  return lignes.map((l) => ({
    ...l,
    vocaux: Number(l.vocaux),
    ecoutes: Number(l.ecoutes),
    finis: Number(l.finis),
    reecoutes: Number(l.reecoutes),
    jusqua: l.jusqua == null ? null : Number(l.jusqua),
  }));
}
