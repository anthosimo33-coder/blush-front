import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { SUBSCRIPTIONS } from "@/mocks/daily";
import type { Account, EcritureRapport, EtatChapitre, ReportPayload } from "@/services/api";
import type { Plan as Plan05 } from "@prompts/lib/schemas";
import type { AnalysisProgress, Chapter, Fiche, Plan, Story } from "@/types";
import { executerChaine, type AvanceMoitie, type DonneesMemoire, type DonneesRapport, type DonneesVerdict } from "./analyse";
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

/**
 * La lecture (le verdict) : sa vraie progression, écrite par le verdict pendant que le modèle répond (réflexion
 * jusqu’à 70 %, puis l’écriture du verdict). Avant ses premiers mots, le modèle lit la conv : on avance doucement
 * jusqu’à 15 %. Les étapes affichées suivent ces phases ; le compteur de messages est plein quand l’écriture commence.
 */
export async function progression(story: Ligne): Promise<AnalysisProgress> {
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  const total = story.messageCount;
  const fini = verdict?.status === "fini";
  const echec = verdict?.status === "echec";
  /* Le début de l’essai en cours : `prendre` met updatedAt à jour (le battement de cœur ne touche que heartbeatAt) */
  const ecoule = verdict ? (Date.now() - verdict.updatedAt.getTime()) / 1000 : 0;
  const lecture = verdict?.status === "en_cours" ? Math.min(0.15, 0.03 + ecoule / 60) : 0.02;
  const p = fini ? 1 : Math.max(lecture, (verdict?.progress ?? 0) / 100);
  const etape = p < 0.35 ? 0 : p < 0.55 ? 1 : p < 0.7 ? 2 : 3;
  return {
    progress: p,
    messagesRead: Math.round(Math.min(1, p / 0.7) * total),
    stepsDone: fini ? 4 : etape,
    discoveries: decouvertes(story, p),
    done: fini,
    ...(echec ? { failed: true, failReason: verdict?.error?.startsWith("refus") ? ("refus" as const) : ("panne" as const) } : {}),
  };
}

/** Pendant la lecture : les trouvailles calculées par le code (lib/trouvailles.ts), une de plus tous les 20 %. */
function decouvertes(story: Ligne, p: number): string[] {
  return (contexteDe(story)?.trouvailles ?? []).slice(0, Math.min(3, Math.floor(p * 5)));
}

const ROLES = ["Le moment où tout a basculé", "Votre histoire, en actes", "Ce qui coince", "", "Toi", "Votre duo", "Ton prochain pas"];

const duree = (s: number) => (s < 50 ? `${Math.max(10, Math.ceil(s / 10) * 10)}\u00a0s` : `${Math.max(1, Math.round(s / 60))}\u00a0min`);

/**
 * Pendant que le rapport s’écrit : la vraie avancée (le plan compte pour 35 %, les deux moitiés pour 65 %), l’état
 * de chaque chapitre, et le temps qui reste, estimé sur le rythme depuis le début. `titres` : ceux du plan, une fois fait.
 */
/* Les durées habituelles des étapes (mesurées sur les rapports de test) : le plan, puis les deux moitiés en même temps */
const PLAN_S = 55;
const CHAPITRES_S = 100;

async function ecritureDe(storyId: string, titres: Map<number, string>, autre: string, prets: Set<number>): Promise<EcritureRapport | undefined> {
  const { rapport_plan: tp, rapport_chapitres: tc } = await etatDesTaches(storyId, ["rapport_plan", "rapport_chapitres"]);
  if (!tp) return undefined;
  const pPlan = tp.status === "fini" ? 1 : tp.progress / 100;
  const detail = (tc?.detail ?? null) as { a: AvanceMoitie; b: AvanceMoitie } | null;
  const fini = tc?.status === "fini";
  const pChap = fini ? 1 : detail ? (detail.a.progres + detail.b.progres) / 2 : 0;
  const progres = Math.min(0.99, 0.35 * pPlan + 0.65 * pChap);
  const etat = (n: number): EtatChapitre => {
    if (fini || prets.has(n)) return "ecrit";
    const m = n <= 4 ? detail?.a : detail?.b;
    if (!m) return "attente";
    return m.ecrits.includes(n) || (m.enCours != null && n < m.enCours) ? "ecrit" : m.enCours === n ? "en_cours" : "attente";
  };
  /*
   * Le temps qui reste : pendant le plan, sa part restante plus les chapitres ; ensuite, au rythme observé des chapitres
   * une fois qu’ils ont pris un peu d’avance (au début, leur durée habituelle). `updatedAt` : le début de l’essai en cours.
   */
  const enCoursDepuis = tc?.status === "en_cours" ? (Date.now() - tc.updatedAt.getTime()) / 1000 : 0;
  const restant =
    tp.status !== "fini" ? (1 - pPlan) * PLAN_S + CHAPITRES_S : pChap > 0.25 && enCoursDepuis > 0 ? (enCoursDepuis * (1 - pChap)) / pChap : (1 - pChap) * CHAPITRES_S;
  return {
    etape: tp.status === "fini" ? "chapitres" : "plan",
    progres,
    restant: duree(restant),
    chapitres: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ number: n, title: titres.get(n) ?? (ROLES[n - 2] || autre), etat: etat(n) })),
  };
}

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
    /* Le sous-titre est déjà sous le titre du verdict (en-tête du chapitre) : pas une seconde fois ici */
    blocks: [
      { kind: "scores", rows: scores },
      ...(sortie.devinette ? [{ kind: "meaning" as const, text: sortie.devinette }] : []),
      ...(sortie.confiance ? [{ kind: "confidence" as const, level: sortie.confiance === "a_verifier" ? ("verifier" as const) : sortie.confiance, text: sortie.confiance_texte ?? "" }] : []),
    ],
  };
  /* Le plan fait (le rapport s’écrit) : ses vrais titres remplacent ceux d’attente */
  const plan = ouvert && !donnees && r?.plan ? dechiffrer<Plan05>(r.plan) : null;
  const titres = new Map((plan?.chapitres ?? []).map((c) => [c.numero, c.titre_court || c.titre]));
  const verrouilles: Chapter[] = ROLES.map((titre, k) => {
    const t = titres.get(k + 2) ?? (titre || autre);
    return { number: k + 2, title: t, tocTitle: t, free: false, locked: true, blocks: [] };
  });
  /*
   * Pendant l’écriture, les chapitres déjà finis se lisent tout de suite, dans l’ordre : un chapitre prêt en avance
   * attend (dans la liste, « Prêt ») que ceux d’avant le soient aussi. Le chapitre 1 complet remplace le verdict seul.
   */
  const partiels = new Map((ouvert && !donnees && r?.partiel ? dechiffrer<Chapter[]>(r.partiel) : []).map((c) => [c.number, c]));
  let suite = true;
  const enEcriture: Chapter[] = [partiels.get(1) ? { ...partiels.get(1)!, free: true, locked: false } : verdictLibre];
  for (const c of verrouilles) {
    const pret = partiels.get(c.number);
    suite = suite && !!pret;
    enEcriture.push(pret && suite ? { ...pret, free: true, locked: false } : c);
  }
  const chapters = ouvert && donnees ? donnees.chapitres : ouvert ? enEcriture : [verdictLibre, ...verrouilles];
  const ecriture = ouvert && !donnees ? await ecritureDe(story.id, titres, autre, new Set(partiels.keys())) : undefined;

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
    /* Le rapport s’écrit (accès débloqué, pas encore fini) : le front affiche l’attente, et où en est l’écriture */
    generating: ouvert && !donnees,
    ...(ecriture ? { ecriture } : {}),
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
