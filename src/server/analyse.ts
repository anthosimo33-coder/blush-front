import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { chiffrer as chiffresDe, lire, rendre } from "@prompts/lib/conv";
import { DEMANDE_PLAN, demandeMoitie, requeteMemoireCreation, requeteRapport, requeteVerdict, type Requete } from "@prompts/lib/contextes";
import { chapitresAffiches, messagesAffiches, scores, sobreAffiche, tempsDeLecture, type ChapitreAffiche, type LigneScore, type SobreAffiche } from "@prompts/lib/front";
import { citees } from "@prompts/lib/memoire";
import { introuvables, preuvesChapitres, preuvesMemoire, preuvesPlan, preuvesRapport, preuvesVerdict } from "@prompts/lib/preuves";
import { Etape05, Sortie04, Sortie05, Sortie07, type Memoire, type Plan, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { chiffrer, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";
import { contexteDe, convDe, histoireDe, metaDe, type Contexte, type Ligne } from "./histoires";
import { appeler } from "./ia/claude";
import { aRelancer, battre, echouer, finir, planifier, prendre, type Genre, type Tache } from "./taches";

/* ———— Ce qu’on garde, chiffré ———— */

export type DonneesVerdict = { sortie: Verdict; scores: LigneScore[] };
export type DonneesRapport = { sortie: Rapport; chapitres: ChapitreAffiche[]; sobre: SobreAffiche | null; lecture: { free: string; full: string } };
/** La mémoire, sa banque de messages (les lignes citées), et le prochain identifiant libre pour les messages ajoutés. */
export type DonneesMemoire = { etat: Memoire; lignes: [string, string][]; suivant: number };

export class ErreurTache extends Error {}

/* ———— La conv, relue tant qu’elle n’est pas effacée ———— */

function relire(story: Ligne) {
  const conv = convDe(story);
  if (!conv) throw new ErreurTache("conv_effacee");
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const lu = lire(conv, h);
  return { meta, h, lu, rendu: rendre(h, lu) };
}

/**
 * Un appel dont chaque preuve doit exister. Une sortie illisible ou une preuve introuvable : on rejoue une fois.
 * Au second essai, les preuves introuvables sont simplement ignorées à l’affichage.
 */
async function appelVerifie<S extends z.ZodType>(req: Requete, format: S, ids: (s: z.infer<S>) => string[], lignes: Map<string, string>, storyId: string, etiquette: string): Promise<z.infer<S>> {
  for (let essai = 0; essai < 2; essai++) {
    const a = await appeler(req, format, { storyId, etiquette });
    if (a.refus) throw new ErreurTache("refus");
    if (!a.sortie) continue;
    if (!introuvables(ids(a.sortie), lignes).length || essai === 1) return a.sortie;
  }
  throw new ErreurTache("sortie_illisible");
}

const lireVerdict = async (storyId: string) => {
  const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  return v ? dechiffrer<DonneesVerdict>(v.data) : null;
};
const lireRapport = async (storyId: string) => {
  const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, storyId));
  return r ?? null;
};

/* ———— Les étapes ———— */

async function verdict(story: Ligne) {
  const { h, lu, rendu } = relire(story);
  const sortie = await appelVerifie(requeteVerdict(rendu), Sortie04, preuvesVerdict, rendu.lignes, story.id, "verdict");
  const donnees: DonneesVerdict = { sortie, scores: scores(chiffresDe(h, lu.messages)) };
  const contexte: Contexte = { chiffres: rendu.chiffres, style: profil(h, lu.messages).bloc, fin: rendu.fin };
  await db()
    .insert(schema.verdicts)
    .values({ storyId: story.id, data: chiffrer(donnees) })
    .onConflictDoUpdate({ target: schema.verdicts.storyId, set: { data: chiffrer(donnees), createdAt: new Date() } });
  await db().update(schema.stories).set({ context: chiffrer(contexte), status: "prete", updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  /* Le rapport s’écrit dès qu’on a l’accès. Un verdict dur (mode sobre) a sa version douce, offerte : on ne fait pas payer une mauvaise nouvelle */
  if (sortie.mode_sobre || (await aAcces(story))) await planifier(story.id, "rapport_plan");
}

/** Le rapport, étape 1 : le plan. En mode sobre, le rapport entier en un appel. */
async function rapportPlan(story: Ligne) {
  const { rendu } = relire(story);
  const v = await lireVerdict(story.id);
  if (!v) throw new ErreurTache("verdict_absent");
  if (v.sortie.mode_sobre) {
    const r = await appelVerifie(requeteRapport(rendu, v.sortie, null), Sortie05, preuvesRapport, rendu.lignes, story.id, "rapport");
    await garderRapport(story, r, rendu.lignes, v.scores);
    if (await aAcces(story)) await planifier(story.id, "memoire");
    return;
  }
  const etape = await appelVerifie(requeteRapport(rendu, v.sortie, DEMANDE_PLAN), Etape05, (e) => (e.plan ? preuvesPlan(e.plan) : []), rendu.lignes, story.id, "rapport_plan");
  if (!etape.plan) throw new ErreurTache("plan_vide");
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, plan: chiffrer(etape.plan) })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { plan: chiffrer(etape.plan), updatedAt: new Date() } });
  await planifier(story.id, "rapport_chapitres");
}

/** Le rapport, étape 2 : les chapitres 1 à 4 et 5 à 8, écrits en même temps d’après le plan. */
async function rapportChapitres(story: Ligne) {
  const { rendu } = relire(story);
  const v = await lireVerdict(story.id);
  const ligne = await lireRapport(story.id);
  if (!v || !ligne?.plan) throw new ErreurTache("plan_absent");
  const plan = dechiffrer<Plan>(ligne.plan);
  const moitie = (quels: "1 à 4" | "5 à 8") =>
    appelVerifie(requeteRapport(rendu, v.sortie, demandeMoitie(plan, quels)), Etape05, (e) => preuvesChapitres(e.chapitres), rendu.lignes, story.id, "rapport_chapitres");
  const [a, b] = await Promise.all([moitie("1 à 4"), moitie("5 à 8")]);
  if (!a.chapitres || !b.chapitres) throw new ErreurTache("chapitres_vides");
  const r: Rapport = {
    alerte: plan.alerte,
    mode_sobre: plan.mode_sobre,
    decouvertes: plan.decouvertes,
    these: plan.these,
    chapitres: [...a.chapitres, ...b.chapitres].sort((x, y) => x.numero - y.numero),
    sobre: null,
  };
  await garderRapport(story, r, rendu.lignes, v.scores);
  await planifier(story.id, "memoire");
}

async function garderRapport(story: Ligne, r: Rapport, lignes: Map<string, string>, lignesScores: LigneScore[]) {
  const h = histoireDe(metaDe(story));
  const chapitres = chapitresAffiches(r, messagesAffiches(lignes, h.utilisateur.prenom), lignesScores);
  const donnees: DonneesRapport = {
    sortie: r,
    chapitres,
    sobre: sobreAffiche(r),
    lecture: { free: tempsDeLecture(chapitres.filter((c) => c.free)), full: tempsDeLecture(chapitres) },
  };
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, data: chiffrer(donnees) })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { data: chiffrer(donnees), updatedAt: new Date() } });
}

/** La mémoire, créée d’après la conv, le verdict et le rapport. Ensuite, la conv brute est effacée. */
async function memoire(story: Ligne) {
  const { rendu, lu } = relire(story);
  const v = await lireVerdict(story.id);
  const ligne = await lireRapport(story.id);
  if (!v || !ligne?.data) throw new ErreurTache("rapport_absent");
  const r = dechiffrer<DonneesRapport>(ligne.data).sortie;
  const etat = await appelVerifie(requeteMemoireCreation(rendu, v.sortie, r), Sortie07, preuvesMemoire, rendu.lignes, story.id, "memoire");
  if (!etat.memoire || !etat.fiche) throw new ErreurTache("memoire_vide");
  const gardees = [...new Set(citees(etat))].filter((id) => rendu.lignes.has(id)).map((id) => [id, rendu.lignes.get(id)!] as [string, string]);
  const donnees: DonneesMemoire = { etat, lignes: gardees, suivant: lu.messages.length + 1 };
  await db()
    .insert(schema.memories)
    .values({ storyId: story.id, data: chiffrer(donnees) })
    .onConflictDoUpdate({ target: schema.memories.storyId, set: { data: chiffrer(donnees), updatedAt: new Date() } });
  /* Le rapport et la mémoire sont faits : la conv brute n’a plus de raison d’être gardée */
  if (contexteDe(story)) await db().update(schema.stories).set({ conv: null, convPurgedAt: new Date(), updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
}

const ETAPES: Partial<Record<Genre, (story: Ligne, t: Tache) => Promise<void>>> = {
  verdict,
  rapport_plan: rapportPlan,
  rapport_chapitres: rapportChapitres,
  memoire,
};

/** Une étape a-t-elle encore l’accès au rapport ? (Sans paiement en v1 : le plan du compte.) */
async function aAcces(story: Ligne): Promise<boolean> {
  if (!story.userId) return false;
  const [u] = await db().select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, story.userId));
  return !!u && u.plan !== "gratuit";
}

/* ———— L’exécution ———— */

async function executer(t: Tache) {
  const coeur = setInterval(() => void battre(t.id).catch(() => {}), 20_000);
  try {
    const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, t.storyId));
    const etape = ETAPES[t.kind as Genre];
    if (!story || !etape) throw new ErreurTache("tache_inconnue");
    await etape(story, t);
    await finir(t.id);
  } catch (e) {
    const code = e instanceof ErreurTache ? e.message : `erreur:${(e as Error).name}`;
    /* Jamais de contenu dans les logs : le code, l’identifiant de la tâche */
    console.error(`tâche ${t.kind} ${t.id} : ${code}`, e instanceof ErreurTache ? "" : (e as Error).message?.slice(0, 200));
    await echouer(t, code);
  } finally {
    clearInterval(coeur);
  }
}

/**
 * Enchaîne les tâches d’une histoire tant qu’il en reste, dans le temps imparti (le reste repart au prochain passage).
 * Deux appels en même temps ne font jamais deux fois la même tâche : `prendre` est atomique.
 */
export async function executerChaine(storyId: string, budgetMs = 600_000): Promise<void> {
  const debut = Date.now();
  while (Date.now() - debut < budgetMs) {
    const [t] = await aRelancer(storyId);
    if (!t) return;
    const pris = await prendre(t.id);
    if (!pris) return;
    await executer(pris);
  }
}
