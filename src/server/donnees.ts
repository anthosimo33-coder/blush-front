import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { SUBSCRIPTIONS } from "@/mocks/daily";
import type { Account, ReportPayload } from "@/services/api";
import type { AnalysisProgress, Chapter, Fiche, Plan, Story } from "@/types";
import { executerChaine, type DonneesMemoire, type DonneesRapport, type DonneesVerdict } from "./analyse";
import { utilisateurDeSession, type Utilisateur } from "./auth";
import { dechiffrer } from "./chiffrement";
import { lireBrouillon, lireSession } from "./cookies";
import { db, schema } from "./db";
import { contexteDe, histoireOuverte, metaDe, storyAffichee, type Ligne } from "./histoires";
import { aRelancer, etatDesTaches } from "./taches";
import { faitsAffiches, verdictAffiche } from "@prompts/lib/front";

/*
 * Les données des écrans, dans les types du front. Utilisées par les pages serveur et par les routes /api.
 */

export async function contexteRequete(): Promise<{ utilisateur: Utilisateur | null; story: Ligne | null }> {
  const utilisateur = await utilisateurDeSession(await lireSession());
  const story = await histoireOuverte(utilisateur, await lireBrouillon());
  return { utilisateur, story };
}

export async function storyCourante(): Promise<Story | null> {
  const { story } = await contexteRequete();
  return story ? storyAffichee(story.id, metaDe(story)) : null;
}

/** Relance, après la réponse, les tâches en attente ou abandonnées de l’histoire. */
export async function relancer(storyId: string): Promise<void> {
  if ((await aRelancer(storyId)).length) after(() => executerChaine(storyId));
}

/** La lecture (le verdict) : sa progression, estimée sur le temps écoulé tant qu’elle tourne. */
export async function progression(story: Ligne): Promise<AnalysisProgress> {
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  const total = story.messageCount;
  const fini = verdict?.status === "fini";
  const echec = verdict?.status === "echec";
  const ecoule = verdict ? (Date.now() - verdict.createdAt.getTime()) / 1000 : 0;
  const p = fini ? 1 : Math.min(0.95, ecoule / 50);
  return { progress: p, messagesRead: Math.round(p * total), stepsDone: Math.min(4, Math.floor(p * 4.4)), discoveries: decouvertes(story, p), done: fini, ...(echec ? { failed: true } : {}) };
}

/** Pendant la lecture : les mots qui reviennent le plus, calculés par le code (« « libanais » ×9 »). */
function decouvertes(story: Ligne, p: number): string[] {
  const ctx = contexteDe(story);
  const ligne = ctx?.chiffres.split("\n").find((l) => l.startsWith("mots qui reviennent"));
  const mots = [...(ligne?.matchAll(/« ([^»]{5,}) » ×(\d+)/g) ?? [])].map((m) => `« ${m[1]} » × ${m[2]}`);
  return mots.slice(0, Math.min(3, Math.floor(p * 4)));
}

const ROLES = ["Le moment où tout a basculé", "Votre histoire, en actes", "Ce qui coince", "", "Toi", "Votre duo", "Ton prochain pas"];

/** Le rapport tel que l’affiche le front. Sans accès : le verdict et les chapitres verrouillés. */
export async function rapportDe(story: Ligne, utilisateur: Utilisateur | null): Promise<(ReportPayload & { generating: boolean }) | null> {
  const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id));
  if (!v) return null;
  const { sortie, scores } = dechiffrer<DonneesVerdict>(v.data);
  const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, story.id));
  const donnees = r?.data ? dechiffrer<DonneesRapport>(r.data) : null;
  const access: Plan = (utilisateur?.plan as Plan) ?? "gratuit";
  const meta = metaDe(story);
  const autre = meta.participants[1 - (meta.moi ?? 0)].prenom;
  const ouvert = access !== "gratuit" || sortie.mode_sobre;

  const verdictLibre: Chapter = {
    number: 1,
    title: "Le verdict",
    tocTitle: "Le verdict",
    free: true,
    blocks: [
      ...(sortie.sous_titre ? [{ kind: "lead" as const, text: sortie.sous_titre }] : []),
      { kind: "scores", rows: scores },
      ...(sortie.devinette ? [{ kind: "meaning" as const, text: sortie.devinette }] : []),
      ...(sortie.confiance ? [{ kind: "confidence" as const, level: sortie.confiance === "a_verifier" ? ("verifier" as const) : sortie.confiance, text: sortie.confiance_texte ?? "" }] : []),
    ],
  };
  const verrouilles: Chapter[] = ROLES.map((titre, k) => ({ number: k + 2, title: titre || autre, tocTitle: titre || autre, free: false, locked: true, blocks: [] }));
  const chapters = ouvert && donnees ? donnees.chapitres : [verdictLibre, ...verrouilles];

  return {
    report: {
      storyId: story.id,
      verdict: verdictAffiche(sortie),
      chapters,
      readingTime: donnees?.lecture ?? { free: "1 min", full: "9 min" },
      level: sortie.niveau ?? "parle",
      trend: sortie.tendance ?? "",
      nextStep: `Ton prochain pas : ${sortie.prochain_pas ?? ""}`,
    },
    sober: ouvert ? (donnees?.sobre ?? null) : null,
    access,
    /* Le rapport s’écrit (accès débloqué, pas encore fini) : le front affiche l’attente */
    generating: ouvert && !donnees,
  };
}

export function compteDe(utilisateur: Utilisateur, story: Ligne | null): Account {
  const plan = utilisateur.plan as Plan;
  return { email: utilisateur.email, subscription: { ...SUBSCRIPTIONS[plan], paused: utilisateur.paused }, storyDeleted: !story };
}

/** La mémoire de l’histoire (après le rapport), ou null. */
export async function memoireDe(storyId: string): Promise<DonneesMemoire | null> {
  const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, storyId));
  return m ? dechiffrer<DonneesMemoire>(m.data) : null;
}

/** Sa fiche, remplie par la mémoire. Avant la mémoire : vide, avec son prénom. */
export async function ficheDe(story: Ligne): Promise<Fiche> {
  const meta = metaDe(story);
  const autre = meta.participants[1 - (meta.moi ?? 0)];
  const person = { id: "p-autre", name: autre.prenom, initial: autre.prenom[0]?.toUpperCase() ?? "?", pronoun: meta.pronom === "elle" ? ("il" as const) : ("elle" as const) };
  const m = await memoireDe(story.id);
  const fiche = m?.etat.fiche;
  if (!m || !fiche) return { person, portrait: "", updatedLabel: "pas encore remplie", facts: [], summary: "", summaryShort: "" };
  const portrait = fiche.portrait.replace(/^\p{Ll}/u, (l) => l.toUpperCase());
  return { person, portrait, updatedLabel: "mise à jour aujourd’hui", facts: faitsAffiches(m.etat, new Map(m.lignes)), summary: fiche.phrase, summaryShort: fiche.phrase_courte };
}

/** Les 4 idées de questions de la mémoire. */
export async function questionsDe(storyId: string): Promise<string[]> {
  return (await memoireDe(storyId))?.etat.questions ?? [];
}
