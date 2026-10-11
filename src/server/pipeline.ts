import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { after } from "next/server";
import { peut } from "@/lib/acces";
import { alerter } from "./alertes";
import { DEBUT_DU_JOUR } from "./budget";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { DUREES_MS } from "./avancement";
import { GENRES_CHAINE, type Genre } from "./db/enums";
import { avecEcheance, DUREE_FONCTION_S, echeancePour, tempsRestant } from "./echeance";
import { ErreurTache, estBudget, estRefus } from "./erreurs";
import type { Ligne, LigneComplete } from "./histoires";
import { voixDisponible } from "./ia/voix";
import { auMieux, journal, journalErreur } from "./journal";
import { aRelancer, battre, clore, echouer, ESSAIS_MAX, etatDesTaches, finir, occupee, planifier, prendre, type Tache } from "./taches";
import type { DonneesVerdict } from "./stockage/types";
import { suite, type EtatChaine } from "./chaine";
import { pause } from "./temps";
import { vocalLu } from "./vocal";

/*
 * Le moteur des tâches : il prend les tâches d’une histoire une à une (executerChaine), fait le travail de chacune
 * (son étape, src/server/analyse.ts), puis décide de la suite. Ce qui vient après une étape ne dépend que de ce qui
 * est écrit en base et des tâches déjà lancées : `suite` (src/server/chaine.ts), une règle pure, le dit, à la fin de
 * chaque étape comme à l’ouverture du rapport (reparerLaChaine). Les étapes ne planifient rien elles-mêmes.
 * Les étapes sont chargées à la demande (le SDK du modèle et les prompts ne servent qu’à elles) : les écrans
 * (donnees.ts) importent ce module sans les charger.
 */

/** Une étape : le travail d’une tâche de ce genre, sur la ligne complète de son histoire (conv brute comprise). */
export type Etape = (story: LigneComplete, t: Tache) => Promise<void>;

const etapes = async () => (await import("./analyse")).ETAPES;

/* ———— La suite ———— */

/** Ce que la chaîne lit d’une histoire, déchiffré : de quoi tirer son état (etatDepuis). */
type LuDeLaChaine = {
  /** La conv brute est encore en base. */
  conv: boolean;
  verdict: DonneesVerdict | null;
  /** La ligne du rapport (reports), ou rien : seul compte ce qui y est gardé. */
  rapport: { plan: unknown; data: unknown } | null | undefined;
  vocal: EtatChaine["vocal"];
  taches: EtatChaine["taches"];
};

/** L’état de la chaîne (suite, src/server/chaine.ts) d’après ce qui est lu : par lireEtat, et par le rapport qui l’a déjà lu. */
export const etatDepuis = ({ conv, verdict, rapport, vocal, taches }: LuDeLaChaine): EtatChaine => ({
  conv,
  voix: voixDisponible(),
  verdict: verdict?.sortie ?? null,
  plan: !!rapport?.plan,
  rapport: !!rapport?.data,
  vocal,
  taches,
});

/** L’état de la chaîne d’une histoire, lu en base (tout d’un coup). */
async function lireEtat(storyId: string): Promise<EtatChaine> {
  const [[s], [v], [r], taches, vocal] = await Promise.all([
    db()
      .select({ conv: sql<boolean>`${schema.stories.conv} is not null` })
      .from(schema.stories)
      .where(eq(schema.stories.id, storyId)),
    db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId)),
    db()
      .select({ plan: sql<boolean>`${schema.reports.plan} is not null`, data: sql<boolean>`${schema.reports.data} is not null` })
      .from(schema.reports)
      .where(eq(schema.reports.storyId, storyId)),
    etatDesTaches(storyId, [...GENRES_CHAINE]),
    vocalLu(storyId),
  ]);
  return etatDepuis({ conv: !!s?.conv, verdict: v ? coffre.lire("verdicts.data", v.data) : null, rapport: r, vocal, taches });
}

/** Le compte de l’histoire a-t-il l’accès au rapport ? (Sans paiement en v1 : le plan du compte.) */
async function aAcces(story: Ligne): Promise<boolean> {
  if (!story.userId) return false;
  const [u] = await db().select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, story.userId));
  return !!u && peut(u.plan, "rapport");
}

/** À la fin d’une étape de la chaîne : planifie la suite (l’étape qui finit compte pour finie). */
async function enchainer(story: Ligne, t: Tache): Promise<void> {
  /* Les mises à jour de la mémoire ne sont pas une étape de la chaîne : elles s’empilent à côté, sans suite */
  if (!(GENRES_CHAINE as readonly Genre[]).includes(t.kind)) return;
  const [etat, acces] = await Promise.all([lireEtat(story.id), aAcces(story)]);
  for (const g of suite({ ...etat, taches: { ...etat.taches, [t.kind]: { ...t, status: "fini" } } }, acces)) await planifier(story.id, g);
}

/**
 * Hors de la chaîne (à l’ouverture du rapport, au déblocage) : planifie ce qui devait partir et n’a jamais été
 * lancé, puis la chaîne repart après la réponse. Le rapport et la mémoire d’un accès donné après coup, la mémoire
 * d’un rapport sobre offert puis débloqué, le vocal d’un rapport écrit avant lui ou d’une ancienne version du script.
 * `etat` : celui déjà lu par l’appelant (le rapport le lit une fois pour tout). Vrai si une tâche vient d’être lancée.
 */
export async function reparerLaChaine(story: Pick<Ligne, "id">, acces: boolean, etat?: EtatChaine): Promise<boolean> {
  /*
   * Ce que le budget de l’IA a arrêté avant minuit repart d’abord : la chaîne le reprend, comme une étape planifiée. Lu
   * seulement s’il y a une étape en échec (l’état déjà lu le dit) : l’ouverture du rapport ne paie pas une requête de plus
   */
  const enEchec = !etat || Object.values(etat.taches).some((t) => t?.status === "echec");
  if (enEchec && (await reprendreApresMinuit(story.id))) {
    after(() => executerChaine(story.id));
    return true;
  }
  const genres = suite(etat ?? (await lireEtat(story.id)), acces);
  if (!genres.length) return false;
  for (const g of genres) await planifier(story.id, g);
  after(() => executerChaine(story.id));
  return true;
}

/* ———— L’échéance et les durées ———— */

/**
 * L’échéance de la chaîne (src/server/echeance.ts) : les appels s’arrêtent avant que Vercel coupe la fonction. Les
 * routes qui la lancent vivent DUREE_FONCTION_S (tests/echeance.test.ts). La durée habituelle de chaque étape
 * (DUREES_MS) est dans src/server/avancement.ts : les écrans en tirent aussi le temps qui reste.
 */
export const ECHEANCE_CHAINE_MS = echeancePour(DUREE_FONCTION_S);

/*
 * Une fonction Vercel vit 5 minutes au plus (plan gratuit) : on ne commence une étape que s’il reste, avant l’échéance,
 * sa durée habituelle et 30 % de marge. Un budget fixe (rien après 100 s) arrêtait la chaîne après le verdict et le
 * plan : les chapitres attendaient qu’un sondage la relance, ce que ne font ni la révélation, ni une appli fermée (et
 * le mail « ton rapport est prêt » avec eux).
 */
const MARGE_ETAPE = 1.3;
/** Le temps qu’il doit rester avant l’échéance pour commencer une étape de ce genre. */
export const tempsPourCommencer = (kind: Genre) => MARGE_ETAPE * DUREES_MS[kind];

/** Un échec : on laisse passer ce temps, par essai déjà fait, avant de réessayer (l’API surchargée, une coupure). */
const PAUSE_APRES_ECHEC_MS = 3000;
/** Le battement de cœur d’une tâche en cours (PERIME_S, src/server/taches.ts, la dit abandonnée sans lui). */
const BATTEMENT_MS = 20_000;

/* ———— L’exécution ———— */

/** Les étapes qui effacent ce qu’elles lisent : rejouées, elles ne trouveraient plus leur entrée. */
const DETRUIT_SON_ENTREE: ReadonlySet<Genre> = new Set(["memoire"]);

/* ———— Le budget de l’IA ———— */

/**
 * Le budget de l’IA du jour a arrêté l’étape avant l’appel (src/server/budget.ts) : elle passe en échec sur « budget »
 * (l’écran dit « BLUSH souffle un peu, réessaie demain »), sans user l’essai que `prendre` venait de compter. Pas
 * d’alerte : l’équipe est prévenue du budget lui-même. Elle repart après minuit (reprendreApresMinuit).
 */
async function suspendre(t: Tache): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ status: "echec", error: "budget", attempts: sql`greatest(${schema.tasks.attempts} - 1, 0)`, updatedAt: new Date() })
    .where(eq(schema.tasks.id, t.id));
}

/*
 * Seule la dernière tâche de son genre repart, et seulement si aucune autre du même genre n’attend ou ne tourne : une
 * lecture relancée le jour même (POST /api/analyse) a pu laisser deux verdicts arrêtés par le budget, et l’index unique
 * des tâches en cours refuserait d’en remettre deux en attente.
 */
const derniereDeSonGenre = sql`not exists (select 1 from ${schema.tasks} as "autre" where "autre"."story_id" = ${schema.tasks.storyId} and "autre"."kind" = ${schema.tasks.kind} and "autre"."id" <> ${schema.tasks.id} and ("autre"."status" in ('attente', 'en_cours') or "autre"."created_at" > ${schema.tasks.createdAt}))`;

/**
 * Les étapes de l’histoire arrêtées par le budget d’un jour passé (avant minuit, heure de Paris) repartent en attente,
 * avec les essais qu’elles avaient. Renvoie leur nombre. Au suivi de la lecture et du rapport (cloreLesAbandons), et à
 * l’ouverture du rapport (reparerLaChaine) : une lecture arrêtée hier reprend quand on revient.
 */
async function reprendreApresMinuit(storyId: string): Promise<number> {
  const reprises = await db()
    .update(schema.tasks)
    .set({ status: "attente", error: null, updatedAt: new Date() })
    .where(
      and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.status, "echec"), eq(schema.tasks.error, "budget"), lt(schema.tasks.updatedAt, DEBUT_DU_JOUR), derniereDeSonGenre),
    )
    .returning({ id: schema.tasks.id });
  return reprises.length;
}

/* ———— Une tâche ———— */

/** Ce que devient une tâche exécutée : finie, en échec (elle repartira, sauf au dernier essai), ou arrêtée par le budget du jour. */
type Issue = "finie" | "echec" | "budget";

/** Exécute une tâche, puis planifie la suite. */
async function executer(t: Tache): Promise<Issue> {
  const coeur = setInterval(() => void auMieux(battre(t.id), "battement de cœur perdu", { tache: t.id }), BATTEMENT_MS);
  try {
    const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, t.storyId));
    /* tasks.kind est un text que la base ne contrôle pas (src/server/db/enums.ts) : un genre sans étape est une tâche inconnue */
    const etape = (await etapes())[t.kind] as Etape | undefined;
    if (!story || !etape) throw new ErreurTache("tache_inconnue");
    await etape(story, t);
    if (DETRUIT_SON_ENTREE.has(t.kind)) {
      /*
       * La mémoire efface la conv brute : rejouée, elle échouerait sur « conv_effacee ». Elle est dite finie d’abord ; une
       * suite qui n’a pas pu être planifiée (seul un vocal peut venir après elle) le sera par la réparation, à l’ouverture.
       */
      await finir(t.id);
      await auMieux(enchainer(story, t), "suite non planifiée", { genre: t.kind, tache: t.id });
      return "finie";
    }
    /* La suite est planifiée avant que l’étape soit dite finie : un échec ici fait rejouer l’étape, rien ne se perd */
    await enchainer(story, t);
    await finir(t.id);
    return "finie";
  } catch (e) {
    if (e instanceof ErreurTache && estBudget(e)) {
      journal("tâche arrêtée par le budget de l’IA", { genre: t.kind, tache: t.id }, "alerte");
      await suspendre(t);
      return "budget";
    }
    const code = e instanceof ErreurTache ? e.code : `erreur:${(e as Error).name}`;
    /* Jamais de contenu dans les logs : le code, l’identifiant de la tâche (le nom d’une erreur imprévue, jamais son message) */
    if (e instanceof ErreurTache) journal("tâche en échec", { genre: t.kind, tache: t.id, code }, "erreur");
    else journalErreur("tâche en échec", e, { genre: t.kind, tache: t.id });
    /* Un refus du modèle (ses règles, ou les filtres d’Anthropic) revient à chaque essai : on ne le relance pas */
    const definitif = estRefus(code);
    await echouer(t, code, definitif);
    /* Le dernier essai a échoué : l’équipe est prévenue (le code et la tâche, jamais de contenu) */
    if (definitif || t.attempts >= ESSAIS_MAX) await alerter(`${t.kind} en échec`, [`Tâche ${t.kind} (${t.id})`, `Histoire ${t.storyId}`, `Erreur : ${code}`, `Essais : ${t.attempts}`]);
    return "echec";
  } finally {
    clearInterval(coeur);
  }
}

/**
 * Enchaîne les tâches d’une histoire tant qu’il en reste, et tant que la suivante a le temps de finir avant l’échéance
 * (sinon elle repart au prochain passage : le suivi de la lecture et du rapport relance la chaîne). Deux appels en même
 * temps ne font jamais deux fois la même tâche : `prendre` est atomique. Le budget de l’IA atteint arrête la chaîne : les
 * étapes suivantes l’attendraient aussi.
 */
export async function executerChaine(storyId: string): Promise<void> {
  await cloreLesAbandons(storyId);
  if (await occupee(storyId)) return;
  await avecEcheance(ECHEANCE_CHAINE_MS, async () => {
    for (;;) {
      const [t] = await aRelancer(storyId);
      if (!t || tempsRestant() < tempsPourCommencer(t.kind)) return;
      const pris = await prendre(t.id);
      if (!pris) return;
      const issue = await executer(pris);
      if (issue === "budget") return;
      if (issue === "echec") await pause(PAUSE_APRES_ECHEC_MS * pris.attempts);
    }
  });
}

/**
 * Les tâches coupées à leur dernier essai passent en échec (voir `clore`), et l’équipe est prévenue comme pour un autre
 * échec. Celles que le budget de l’IA a arrêtées avant minuit repartent (reprendreApresMinuit) : la chaîne les relance.
 */
export async function cloreLesAbandons(storyId: string): Promise<void> {
  await reprendreApresMinuit(storyId);
  for (const t of await clore(storyId)) await alerter(`${t.kind} en échec`, [`Tâche ${t.kind} (${t.id})`, `Histoire ${t.storyId}`, "Erreur : coupée à chaque essai (délai dépassé)", `Essais : ${t.attempts}`]);
}
