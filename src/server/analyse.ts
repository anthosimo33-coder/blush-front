import "server-only";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { chiffrer as chiffresDe, lire, rendre } from "@prompts/lib/conv";
import { DEMANDE_PLAN, demandeMoitie, requeteMemoireCreation, requeteMemoireMaj, requeteRapport, requeteVerdict, type Requete } from "@prompts/lib/contextes";
import { chapitresAffiches, messagesAffiches, scores, sobreAffiche, tempsDeLecture, type ChapitreAffiche, type LigneScore, type SobreAffiche } from "@prompts/lib/front";
import { appliquerMaj, citees, rendreNouveau, type EditionsFiche, type Echange } from "@prompts/lib/memoire";
import { introuvables, preuvesChapitres, preuvesMaj, preuvesMemoire, preuvesPlan, preuvesRapport, preuvesVerdict } from "@prompts/lib/preuves";
import { Etape05, Maj07, Sortie04, Sortie05, Sortie07, type Memoire, type Plan, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { trouvailles } from "@prompts/lib/trouvailles";
import { chiffrer, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";
import { contexteDe, convDe, histoireDe, metaDe, type Contexte, type Ligne } from "./histoires";
import { ErreurTache } from "./erreurs";
import { aujourdhuiParis } from "./temps";
import { appeler, type Avance } from "./ia/claude";
import { alerter } from "./alertes";
import { aRelancer, battre, echouer, entreeDe, ESSAIS_MAX, finir, occupee, planifier, prendre, statutDe, type Genre, type Tache } from "./taches";

/* ———— Ce qu’on garde, chiffré ———— */

export type DonneesVerdict = { sortie: Verdict; scores: LigneScore[] };
export type DonneesRapport = { sortie: Rapport; chapitres: ChapitreAffiche[]; sobre: SobreAffiche | null; lecture: { free: string; full: string } };
/**
 * La mémoire, sa banque de messages (les lignes citées), le prochain identifiant libre pour les messages ajoutés,
 * et ce que l’utilisateur a corrigé lui-même dans sa fiche.
 */
export type DonneesMemoire = { etat: Memoire; lignes: [string, string][]; suivant: number; editions?: EditionsFiche };


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
async function appelVerifie<S extends z.ZodType>(
  req: Requete,
  format: S,
  ids: (s: z.infer<S>) => string[],
  lignes: Map<string, string>,
  storyId: string,
  etiquette: string,
  surAvance?: (a: Avance) => void,
): Promise<z.infer<S>> {
  for (let essai = 0; essai < 2; essai++) {
    const a = await appeler(req, format, { storyId, etiquette, surAvance });
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

/**
 * L’avancée du verdict (0 à 100) d’après ce que le modèle a déjà écrit : sa réflexion (sa longueur varie : on s’en
 * approche sans l’atteindre, jusqu’à 70), puis le verdict lui-même (environ 700 caractères), jusqu’à 98.
 */
export const avanceVerdict = (a: Avance) => Math.min(98, Math.round(a.texte > 0 ? 70 + 28 * Math.min(1, a.texte / 700) : 15 + 55 * (1 - Math.exp(-a.reflexion / 2500))));

/** Les chapitres déjà commencés dans ce que le modèle a écrit (chaque chapitre de sa réponse commence par son numéro). */
export const chapitresCommences = (ecrit: string) => [...ecrit.matchAll(/"numero"\s*:\s*(\d+)/g)].map((m) => +m[1]);

/** Le plan du rapport (0 à 100) : sa réflexion jusqu’à 50, puis ses huit chapitres, un par un, jusqu’à 98. */
export const avancePlan = (a: Avance) =>
  Math.min(98, Math.round(a.texte > 0 ? 50 + 48 * Math.min(1, chapitresCommences(a.ecrit).length / 8) : 50 * (1 - Math.exp(-a.reflexion / 2500))));

/** Une moitié du rapport (chapitres 1 à 4, ou 5 à 8) : où elle en est (0 à 1), ses chapitres écrits, celui en cours. */
export type AvanceMoitie = { progres: number; ecrits: number[]; enCours: number | null };
export function avanceMoitie(a: Avance, premier: 1 | 5): AvanceMoitie {
  const nums = chapitresCommences(a.ecrit).filter((n) => n >= premier && n < premier + 4);
  /* Avant le premier chapitre, il réfléchit : on s’approche de 45 % sans l’atteindre */
  if (!nums.length) return { progres: 0.45 * (1 - Math.exp(-a.reflexion / 3000)), ecrits: [], enCours: a.texte > 0 ? premier : null };
  /* Un chapitre fait environ 2 000 caractères : on avance dans celui en cours, sans jamais le finir avant le suivant */
  const dansLeChapitre = a.ecrit.length - a.ecrit.lastIndexOf('"numero"');
  return { progres: Math.min(0.98, 0.45 + (0.55 * (nums.length - 1 + Math.min(0.95, dansLeChapitre / 2000))) / 4), ecrits: nums.slice(0, -1), enCours: nums.at(-1)! };
}

/** Écrit l’avancée d’une tâche en base (et son détail), au plus une fois par seconde, sans jamais reculer. */
function ecrireAvance(tacheId: string): (progres: number, detail?: unknown) => void {
  let derniere = 0;
  let ecrite = -1;
  return (p, detail) => {
    if (p <= ecrite || Date.now() - derniere < 1000) return;
    derniere = Date.now();
    ecrite = p;
    void db()
      .update(schema.tasks)
      .set({ progress: sql`greatest(${schema.tasks.progress}, ${p})`, ...(detail === undefined ? {} : { detail }) })
      .where(eq(schema.tasks.id, tacheId))
      .catch(() => {});
  };
}
const suivreAvance = (tacheId: string, calcul: (a: Avance) => number) => {
  const ecrire = ecrireAvance(tacheId);
  return (a: Avance) => ecrire(calcul(a));
};

async function verdict(story: Ligne, t: Tache) {
  const { h, lu, rendu } = relire(story);
  const chiffres = chiffresDe(h, lu.messages);
  /* Ce que le code sait déjà, gardé avant l’appel : les trouvailles s’affichent pendant que le modèle lit */
  const contexte: Contexte = { chiffres: rendu.chiffres, style: profil(h, lu.messages).bloc, fin: rendu.fin, dernier: lu.messages.at(-1)!.t, trouvailles: trouvailles(chiffres, h, lu.messages) };
  await db().update(schema.stories).set({ context: chiffrer(contexte), updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  const sortie = await appelVerifie(requeteVerdict(rendu), Sortie04, preuvesVerdict, rendu.lignes, story.id, "verdict", suivreAvance(t.id, avanceVerdict));
  const donnees: DonneesVerdict = { sortie, scores: scores(chiffres) };
  await db()
    .insert(schema.verdicts)
    .values({ storyId: story.id, data: chiffrer(donnees) })
    .onConflictDoUpdate({ target: schema.verdicts.storyId, set: { data: chiffrer(donnees), createdAt: new Date() } });
  await db().update(schema.stories).set({ context: chiffrer(contexte), status: "prete", updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  /* Le rapport s’écrit dès qu’on a l’accès. Un verdict dur (mode sobre) a sa version douce, offerte : on ne fait pas payer une mauvaise nouvelle */
  if (sortie.mode_sobre || (await aAcces(story))) await planifier(story.id, "rapport_plan");
}

/** Le rapport, étape 1 : le plan. En mode sobre, le rapport entier en un appel. */
async function rapportPlan(story: Ligne, t: Tache) {
  const { rendu } = relire(story);
  const v = await lireVerdict(story.id);
  if (!v) throw new ErreurTache("verdict_absent");
  if (v.sortie.mode_sobre) {
    const r = await appelVerifie(requeteRapport(rendu, v.sortie, null), Sortie05, preuvesRapport, rendu.lignes, story.id, "rapport");
    await garderRapport(story, r, rendu.lignes, v.scores);
    if (await aAcces(story)) await planifier(story.id, "memoire");
    return;
  }
  const etape = await appelVerifie(
    requeteRapport(rendu, v.sortie, DEMANDE_PLAN),
    Etape05,
    (e) => (e.plan ? preuvesPlan(e.plan) : []),
    rendu.lignes,
    story.id,
    "rapport_plan",
    suivreAvance(t.id, avancePlan),
  );
  if (!etape.plan) throw new ErreurTache("plan_vide");
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, plan: chiffrer(etape.plan) })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { plan: chiffrer(etape.plan), updatedAt: new Date() } });
  await planifier(story.id, "rapport_chapitres");
}

/** Le rapport, étape 2 : les chapitres 1 à 4 et 5 à 8, écrits en même temps d’après le plan. */
async function rapportChapitres(story: Ligne, t: Tache) {
  const { rendu } = relire(story);
  const v = await lireVerdict(story.id);
  const ligne = await lireRapport(story.id);
  if (!v || !ligne?.plan) throw new ErreurTache("plan_absent");
  const plan = dechiffrer<Plan>(ligne.plan);
  /* Les deux moitiés s’écrivent en même temps : on suit chacune, chapitre par chapitre (la lecture du rapport l’affiche) */
  const detail: { a: AvanceMoitie; b: AvanceMoitie } = { a: { progres: 0, ecrits: [], enCours: null }, b: { progres: 0, ecrits: [], enCours: null } };
  const ecrire = ecrireAvance(t.id);
  const moitie = (quels: "1 à 4" | "5 à 8") =>
    appelVerifie(requeteRapport(rendu, v.sortie, demandeMoitie(plan, quels)), Etape05, (e) => preuvesChapitres(e.chapitres), rendu.lignes, story.id, "rapport_chapitres", (av) => {
      detail[quels === "1 à 4" ? "a" : "b"] = avanceMoitie(av, quels === "1 à 4" ? 1 : 5);
      ecrire(Math.round(50 * (detail.a.progres + detail.b.progres)), detail);
    });
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

/** Après un échange qui apporte du neuf : la mémoire se met à jour (ou dit « rien de neuf », le cas le plus fréquent). */
async function memoireMaj(story: Ligne, t: Tache) {
  const ech = entreeDe<Echange>(t);
  const [ligne] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, story.id));
  if (!ech || !ligne) throw new ErreurTache("memoire_absente");
  const avant = dechiffrer<DonneesMemoire>(ligne.data);
  const h = histoireDe(metaDe(story));
  const lignes = new Map(avant.lignes);
  const suivant = { n: avant.suivant };
  const nouveau = rendreNouveau(ech, h, lignes, suivant);
  const req = requeteMemoireMaj(h, aujourdhuiParis().t, avant.etat, lignes, nouveau, avant.editions);
  /* La mise à jour ne renvoie que ce qui change ; le code l’applique à la mémoire */
  const maj = await appelVerifie(req, Maj07, (m) => (m.rien_de_neuf ? [] : preuvesMaj(m)), lignes, story.id, "memoire_maj");
  if (maj.rien_de_neuf) return;
  const etat = appliquerMaj(avant.etat, maj);
  const gardees = [...new Set(citees(etat))].filter((id) => lignes.has(id)).map((id) => [id, lignes.get(id)!] as [string, string]);
  const donnees: DonneesMemoire = { etat, lignes: gardees, suivant: suivant.n, ...(avant.editions ? { editions: avant.editions } : {}) };
  await db()
    .update(schema.memories)
    .set({ data: chiffrer(donnees), version: ligne.version + 1, updatedAt: new Date() })
    .where(eq(schema.memories.storyId, story.id));
}

const ETAPES: Partial<Record<Genre, (story: Ligne, t: Tache) => Promise<void>>> = {
  verdict,
  rapport_plan: rapportPlan,
  rapport_chapitres: rapportChapitres,
  memoire,
  memoire_maj: memoireMaj,
};

/** Une étape a-t-elle encore l’accès au rapport ? (Sans paiement en v1 : le plan du compte.) */
async function aAcces(story: Ligne): Promise<boolean> {
  if (!story.userId) return false;
  const [u] = await db().select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, story.userId));
  return !!u && u.plan !== "gratuit";
}

/* ———— L’exécution ———— */

/**
 * Une fonction Vercel vit 5 minutes au plus (plan gratuit) et une étape tient sous 3 minutes : on ne commence pas
 * d’étape après 100 secondes, pour qu’elle finisse avant d’être coupée.
 */
export const BUDGET_CHAINE_MS = 100_000;

/** Exécute une tâche. Renvoie false si elle a échoué (elle repartira, sauf au dernier essai). */
async function executer(t: Tache): Promise<boolean> {
  const coeur = setInterval(() => void battre(t.id).catch(() => {}), 20_000);
  try {
    const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, t.storyId));
    const etape = ETAPES[t.kind as Genre];
    if (!story || !etape) throw new ErreurTache("tache_inconnue");
    await etape(story, t);
    await finir(t.id);
    return true;
  } catch (e) {
    const code = e instanceof ErreurTache ? e.message : `erreur:${(e as Error).name}`;
    /* Jamais de contenu dans les logs : le code, l’identifiant de la tâche */
    console.error(`tâche ${t.kind} ${t.id} : ${code}`, e instanceof ErreurTache ? "" : (e as Error).message?.slice(0, 200));
    await echouer(t, code);
    /* Le dernier essai a échoué : l’équipe est prévenue (le code et la tâche, jamais de contenu) */
    if (t.attempts >= ESSAIS_MAX) await alerter(`${t.kind} en échec`, [`Tâche ${t.kind} (${t.id})`, `Histoire ${t.storyId}`, `Erreur : ${code}`, `Essais : ${t.attempts}`]);
    return false;
  } finally {
    clearInterval(coeur);
  }
}

/**
 * Enchaîne les tâches d’une histoire tant qu’il en reste, dans le temps imparti (le reste repart au prochain passage :
 * le suivi de la lecture et du rapport relance la chaîne). Deux appels en même temps ne font jamais deux fois la même
 * tâche : `prendre` est atomique.
 */
export async function executerChaine(storyId: string, budgetMs = BUDGET_CHAINE_MS): Promise<void> {
  if (await occupee(storyId)) return;
  const debut = Date.now();
  while (Date.now() - debut < budgetMs) {
    const [t] = await aRelancer(storyId);
    if (!t) return;
    const pris = await prendre(t.id);
    if (!pris) return;
    /* Un échec (l’API surchargée, une coupure) : on laisse passer quelques secondes avant de réessayer */
    if (!(await executer(pris))) await new Promise((r) => setTimeout(r, 3000 * pris.attempts));
  }
}

/**
 * Attend qu’une tâche soit finie, en faisant tourner la chaîne (ou en laissant finir celle qui tourne déjà).
 * Renvoie son statut, ou null si le délai est passé (elle finira au prochain passage).
 */
export async function attendreTache(storyId: string, tacheId: string, delaiMs = 200_000): Promise<string | null> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    await executerChaine(storyId, Math.min(BUDGET_CHAINE_MS, fin - Date.now()));
    const statut = await statutDe(tacheId);
    if (statut !== "attente" && statut !== "en_cours") return statut;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
