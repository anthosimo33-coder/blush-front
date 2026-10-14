import "server-only";
import { and, desc, eq, gt, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { alerter } from "./alertes";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { rapportOuvertEnBase } from "./droits";
import { DUREES_MS } from "./avancement";
import { GENRES_CHAINE, type Genre } from "./db/enums";
import { avecEcheance, DUREE_FONCTION_S, echeancePour, tempsRestant } from "./echeance";
import { ARRETS_DU_BUDGET, codeImprevu, ErreurTache, estBudget, estBudgetVoix, estRefus, type ArretDuBudget } from "./erreurs";
import type { Ligne, LigneComplete } from "./histoires";
import { voixDisponible } from "./ia/voix";
import { auMieux, journal, journalErreur } from "./journal";
import { passerLaMain } from "./relais";
import { aRelancer, battre, clore, echouer, ESSAIS_MAX, etatDesTaches, finir, occupee, PERIME_S, planifier, prendre, type Tache } from "./taches";
import { donneesMemoire } from "./depot";
import type { DonneesMemoire, DonneesVerdict } from "./stockage/types";
import { suite, type EtatChaine } from "./chaine";
import { DEBUT_DU_JOUR, pause } from "./temps";
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

const analyse = () => import("./analyse");
const etapes = async () => (await analyse()).ETAPES;

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

/** Le rapport de l’histoire est-il ouvert (débloqué, ou un compte de l’équipe : src/server/droits.ts), lu en base ? */
const aAcces = (story: Pick<Ligne, "id" | "userId">) => (story.userId ? rapportOuvertEnBase(story.id) : Promise.resolve(false));

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
 * L’accès est celui du compte de l’histoire, lu en base comme à la fin de chaque étape (aAcces) : jamais celui que
 * croit l’appelant. Il n’est lu que s’il change ce qui reste à lancer : le rapport ouvert, sondé toutes les 2 s pendant
 * qu’il s’écrit, ne paie pas une requête de plus à chaque sondage. `etat` : celui déjà lu par l’appelant (le rapport le
 * lit une fois pour tout). Vrai si une tâche vient d’être lancée. Une étape qui attend encore repart aussi après la
 * réponse, sans rien changer à ce qu’on montre (faux).
 */
export async function reparerLaChaine(story: Pick<Ligne, "id" | "userId">, etat?: EtatChaine): Promise<boolean> {
  /*
   * Ce que le budget de l’IA a arrêté avant minuit repart d’abord : la chaîne le reprend, comme une étape planifiée.
   * Tenté seulement si l’état déjà lu montre une étape arrêtée par lui : sinon, l’ouverture du rapport ne paie pas une
   * requête de plus. Les mises à jour de la mémoire arrêtées (hors de la chaîne) repartent au suivi (cloreLesAbandons)
   */
  const lu = etat ?? (await lireEtat(story.id));
  const arretee = Object.values(lu.taches).some((t) => t?.status === "echec" && (estBudget(t.error) || estBudgetVoix(t.error)));
  if (arretee && (await reprendreApresMinuit(story.id))) {
    relancerApres(story.id);
    return true;
  }
  const [sans, avec] = [suite(lu, false), suite(lu, true)];
  const genres = sans.join() === avec.join() ? sans : (await aAcces(story)) ? avec : sans;
  /* La mémoire en échec repart, si elle peut (relancerLaMemoire) : lu seulement quand l’état la montre en échec */
  const memoireRelancee = lu.taches.memoire?.status === "echec" && lu.conv && (await relancerLaMemoire(story.id));
  if (!genres.length && !memoireRelancee) {
    /*
     * Rien de neuf, mais une étape planifiée attend encore (la fonction qui écrivait le rapport arrivait à son échéance :
     * la mémoire n’a pas eu le temps de commencer) : elle repart après la réponse. Le suivi de l’écriture la reprenait,
     * mais il s’arrête avec le rapport écrit : sans ceci, elle attendait pour de bon (la fiche vide, le chat sur sa
     * mémoire de secours). Une étape en cours est à l’exécution qui l’écrit (coupée, le suivi et la fiche la reprennent).
     */
    if (Object.values(lu.taches).some((t) => t?.status === "attente")) relancerApres(story.id);
    return false;
  }
  for (const g of genres) await planifier(story.id, g);
  relancerApres(story.id);
  return true;
}

/* ———— La mémoire, coûte que coûte ———— */

/** Une mémoire en échec repart après cette pause (une panne passagère : une limite de débit, une surcharge)… */
const PAUSE_AVANT_RELANCE_MEMOIRE_MS = 30 * 60_000;
/** … et au plus ce nombre de fois : chaque relance refait jusqu’à ESSAIS_MAX essais, un appel au modèle chacun. */
export const RELANCES_MEMOIRE_MAX = 2;

/**
 * La vraie mémoire en échec repart, et remplacera celle de secours que le chat lit en attendant : seulement après une
 * panne (pas un refus du modèle, qui reviendrait ; pas le budget du jour, qui a sa reprise), passé la pause, tant qu’il
 * reste des relances et la conv brute (elle s’efface au bout de 30 jours). Planifiée ici, la chaîne la reprend. À
 * l’ouverture du rapport (reparerLaChaine), et à chaque message du chat tant qu’il répond sur la mémoire de secours.
 */
async function relancerLaMemoire(storyId: string): Promise<boolean> {
  const [faites, [story]] = await Promise.all([
    db()
      .select({ status: schema.tasks.status, error: schema.tasks.error, updatedAt: schema.tasks.updatedAt })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire")))
      .orderBy(desc(schema.tasks.createdAt)),
    db()
      .select({ conv: sql<boolean>`${schema.stories.conv} is not null` })
      .from(schema.stories)
      .where(eq(schema.stories.id, storyId)),
  ]);
  const [derniere] = faites;
  if (!derniere || derniere.status !== "echec" || !story?.conv || estRefus(derniere.error) || estBudget(derniere.error)) return false;
  if (faites.length > RELANCES_MEMOIRE_MAX || Date.now() - derniere.updatedAt.getTime() < PAUSE_AVANT_RELANCE_MEMOIRE_MS) return false;
  await planifier(storyId, "memoire");
  journal("mémoire relancée", { histoire: storyId, relance: faites.length });
  return true;
}

/**
 * La mémoire que lit le chat (et l’ajout à sa fiche) : la vraie, ou, faute d’elle, une mémoire de secours tirée du
 * verdict et du rapport, écrite à l’instant (garderUneMemoireDeSecours, src/server/analyse.ts). Null seulement sans
 * verdict, ou sans rapport écrit ni débloqué. Tant qu’elle est de secours, la vraie repart si elle peut, après la réponse.
 */
export async function memoireAssuree(story: Pick<Ligne, "id" | "userId">): Promise<DonneesMemoire | null> {
  const m = (await donneesMemoire(story.id)) ?? (await (await analyse()).garderUneMemoireDeSecours(story.id));
  if (m?.secours) await auMieux(() => reparerLaChaine(story), "chaîne non réparée", { histoire: story.id });
  return m;
}

/**
 * Après l’échec pour de bon de la vraie mémoire : celle de secours s’écrit, pour que le chat réponde quand même. Vrai si
 * l’histoire a une mémoire ensuite. Ne lève jamais : l’échec, lui, doit encore être dit à l’équipe.
 */
async function secoursApresEchec(storyId: string): Promise<boolean> {
  try {
    return !!(await (await analyse()).garderUneMemoireDeSecours(storyId));
  } catch (e) {
    journalErreur("mémoire de secours non écrite", e, { histoire: storyId });
    return false;
  }
}

/** Ce que l’alerte d’une mémoire en échec ajoute quand celle de secours a pris le relais : et si la vraie repartira. */
async function ligneDuSecours(t: Tache, erreur: string): Promise<string> {
  const secours = "Le chat répond sur une mémoire de secours (tirée du verdict et du rapport).";
  if (estRefus(erreur)) return `${secours} La vraie ne repart pas, le modèle refuserait encore.`;
  const [faites] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, t.storyId), eq(schema.tasks.kind, "memoire")));
  const reste = RELANCES_MEMOIRE_MAX + 1 - (faites?.n ?? 1);
  return reste > 0
    ? `${secours} La vraie repart à la prochaine ouverture du rapport ou au prochain message, dans 30 min au moins (encore ${reste} fois au plus).`
    : `${secours} La vraie ne repartira plus d’elle-même.`;
}

/** L’alerte d’une étape en échec pour de bon, et, pour la mémoire, la mémoire de secours d’abord. */
async function echecPourDeBon(t: Tache, erreur: string): Promise<void> {
  const secours = t.kind === "memoire" && (await secoursApresEchec(t.storyId));
  const suite = secours ? await ligneDuSecours(t, erreur).catch(() => "Le chat répond sur une mémoire de secours.") : null;
  await alerterEchec(t, erreur, suite ? [suite] : []);
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
async function suspendre(t: Tache, code: ArretDuBudget = "budget"): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ status: "echec", error: code, attempts: sql`greatest(${schema.tasks.attempts} - 1, 0)`, updatedAt: new Date() })
    .where(eq(schema.tasks.id, t.id));
}

/*
 * Une étape de la chaîne ne repart que si elle est la dernière de son genre, et qu’aucune autre du même genre n’attend
 * ni ne tourne : une lecture relancée le jour même (POST /api/analyse) a pu laisser deux verdicts arrêtés par le budget,
 * et l’index unique des étapes en cours (tasks_une_par_etape) refuserait d’en remettre deux en attente. Les mises à jour
 * de la mémoire (memoire_maj), elles, repartent toutes : chacune porte son échange, et l’index ne les compte pas. La
 * chaîne les reprend dans l’ordre où elles sont arrivées (aRelancer), une nouvelle planifiée depuis après elles.
 */
const repartPourDeBon = or(
  notInArray(schema.tasks.kind, [...GENRES_CHAINE]),
  sql`not exists (select 1 from ${schema.tasks} as "autre" where "autre"."story_id" = ${schema.tasks.storyId} and "autre"."kind" = ${schema.tasks.kind} and "autre"."id" <> ${schema.tasks.id} and ("autre"."status" in ('attente', 'en_cours') or "autre"."created_at" > ${schema.tasks.createdAt}))`,
);

/**
 * Les étapes de l’histoire arrêtées par le budget d’un jour passé (avant minuit, heure de Paris), celui de l’IA ou celui
 * de la voix (le vocal du rapport : un nouveau jour rend ses caractères au compte), repartent en attente,
 * avec les essais qu’elles avaient. Renvoie leur nombre. Au suivi de la lecture et du rapport (cloreLesAbandons), et à
 * l’ouverture du rapport (reparerLaChaine) : une lecture arrêtée hier reprend quand on revient.
 */
async function reprendreApresMinuit(storyId: string): Promise<number> {
  const reprises = await db()
    .update(schema.tasks)
    .set({ status: "attente", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.storyId, storyId),
        eq(schema.tasks.status, "echec"),
        inArray(schema.tasks.error, [...ARRETS_DU_BUDGET]),
        lt(schema.tasks.updatedAt, DEBUT_DU_JOUR),
        repartPourDeBon,
      ),
    )
    .returning({ id: schema.tasks.id });
  return reprises.length;
}

/* ———— Une tâche ———— */

/**
 * Ce que devient une tâche exécutée : finie, en échec (elle repartira, sauf au dernier essai), arrêtée par le budget de
 * l’IA du jour (la chaîne s’arrête : les étapes suivantes l’attendraient aussi), ou reportée par celui de la voix (le
 * vocal du rapport : la chaîne continue, la mémoire ne l’attend pas).
 */
type Issue = "finie" | "echec" | "budget" | "reportee";

/** Les échecs de ces étapes touchent ce qu’on a promis (la lecture, le rapport, le chat) : leur alerte est importante (S-19). */
const ALERTE_IMPORTANTE: ReadonlySet<Genre> = new Set(["verdict", "rapport_plan", "rapport_chapitres", "memoire"]);

/** L’alerte à l’équipe d’une étape en échec pour de bon : son genre, la tâche, le code, jamais de contenu ; `suite` : ce qui a pris le relais. */
const alerterEchec = (t: Tache, erreur: string, suite: string[] = []) =>
  alerter(`${t.kind} en échec`, [`Tâche ${t.kind} (${t.id})`, `Histoire ${t.storyId}`, `Erreur : ${erreur}`, `Essais : ${t.attempts}`, ...suite], {
    importante: ALERTE_IMPORTANTE.has(t.kind),
  });

/** Exécute une tâche, puis planifie la suite. */
async function executer(t: Tache): Promise<Issue> {
  /* Un battement raté se rattrape au suivant : le journal ne le dit qu’à partir du deuxième d’affilée */
  let rates = 0;
  const coeur = setInterval(
    () =>
      void battre(t.id).then(
        () => void (rates = 0),
        (e: unknown) => {
          if (++rates >= 2) journalErreur("battement de cœur perdu", e, { tache: t.id, rates });
        },
      ),
    BATTEMENT_MS,
  );
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
    /* Le budget de la voix : ni alerte ni essai usé, le vocal repart après minuit (reprendreApresMinuit) */
    if (e instanceof ErreurTache && estBudgetVoix(e)) {
      journal("vocal reporté par le budget de la voix", { genre: t.kind, tache: t.id });
      await suspendre(t, "voix_budget");
      return "reportee";
    }
    const code = e instanceof ErreurTache ? e.code : codeImprevu(e);
    /* Jamais de contenu dans les logs : le code, l’identifiant de la tâche (d’une erreur imprévue : son nom, le statut et le type d’une erreur du prestataire, jamais son message) */
    if (e instanceof ErreurTache) journal("tâche en échec", { genre: t.kind, tache: t.id, code }, "erreur");
    else journalErreur("tâche en échec", e, { genre: t.kind, tache: t.id });
    /* Un refus du modèle (ses règles, ou les filtres d’Anthropic) revient à chaque essai : on ne le relance pas */
    const definitif = estRefus(code);
    await echouer(t, code, definitif);
    /* Le dernier essai a échoué : l’équipe est prévenue (le code et la tâche, jamais de contenu) */
    if (definitif || t.attempts >= ESSAIS_MAX) await echecPourDeBon(t, code);
    return "echec";
  } finally {
    clearInterval(coeur);
  }
}

/**
 * Enchaîne les tâches d’une histoire tant qu’il en reste, et tant que la suivante a le temps de finir avant l’échéance ;
 * sinon, elle passe la main à une nouvelle fonction, qui la reprend aussitôt (passerLaMain, src/server/relais.ts ;
 * `relais` : combien de fois d’affilée elle l’a déjà fait). Deux appels en même temps ne font jamais deux fois la même
 * tâche : `prendre` est atomique. Le budget de l’IA atteint arrête la chaîne : les étapes suivantes l’attendraient aussi.
 */
export async function executerChaine(storyId: string, { relais = 0 }: { relais?: number } = {}): Promise<void> {
  await cloreLesAbandons(storyId);
  if (await occupee(storyId)) return;
  await avecEcheance(ECHEANCE_CHAINE_MS, async () => {
    for (;;) {
      const [t] = await aRelancer(storyId);
      if (!t) return;
      /* Plus le temps de la commencer ici (la mémoire, après le rapport) : une fonction neuve la reprend tout de suite */
      if (tempsRestant() < tempsPourCommencer(t.kind)) {
        await passerLaMain(storyId, relais + 1);
        return;
      }
      const pris = await prendre(t.id);
      if (!pris) return;
      const issue = await executer(pris);
      if (issue === "budget") return;
      if (issue === "echec") await pause(PAUSE_APRES_ECHEC_MS * pris.attempts);
    }
  });
}

/**
 * La chaîne relancée sans que l’appelant en attende l’issue : un échec (la base qui tombe pendant cloreLesAbandons ou
 * aRelancer) laisse une ligne au journal, son nom et son code, jamais son message (une erreur SQL cite ses paramètres).
 * Ne rejette jamais. executerChaine, elle, rejette : les tests et la tâche de nuit voient ses erreurs.
 */
export function relancerChaine(storyId: string, options: { relais?: number } = {}): Promise<void> {
  return auMieux(() => executerChaine(storyId, options), "chaîne non relancée", { histoire: storyId });
}

/* ———— La veille ———— */

/** Ce que la veille reprend au plus à chaque passage : autant de fonctions lancées d’un coup. */
const CHAINES_PAR_VEILLE = 20;
/** Une étape en attente depuis plus que ça, sans exécution qui la tienne, est restée en plan (un relais raté). */
const EN_PLAN_APRES_S = 300;

/** Un rapport payé arrêté par le budget d’un jour passé : repris par le cron jusqu’à une semaine après (au-delà, à la visite). */
const REPRISE_DU_BUDGET_S = 7 * 86400;

/**
 * Les chaînes restées en plan : une étape en attente depuis plus de 5 minutes qu’un essai peut encore faire ; une étape
 * abandonnée (son battement de cœur perdu), même à son dernier essai : la chaîne relancée la clôt et prévient l’équipe
 * (cloreLesAbandons), sans attendre qu’un écran revienne ; et, pour un rapport payé, une étape arrêtée par le budget
 * d’un jour passé (la chaîne relancée la remet en attente, reprendreApresMinuit) : le rapport s’écrit et son mail part
 * sans que la personne revienne. Le passage des 5 minutes (GET /api/cron/relances) les reprend, chacune dans sa propre
 * fonction (passerLaMain) : le filet du relais, qu’un réseau coupé ou un déploiement peut rater. Les plus récemment
 * arrêtées d’abord (celles qu’on attend sans doute encore). Rend le nombre de chaînes reprises.
 */
export async function reprendreLesChainesEnPlan(): Promise<number> {
  const t = schema.tasks;
  const lignes = await db()
    .select({ storyId: t.storyId })
    .from(t)
    .where(
      or(
        and(lt(t.attempts, ESSAIS_MAX), eq(t.status, "attente"), lt(t.updatedAt, sql`now() - make_interval(secs => ${EN_PLAN_APRES_S})`)),
        and(eq(t.status, "en_cours"), lt(t.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`)),
        and(
          eq(t.status, "echec"),
          inArray(t.error, [...ARRETS_DU_BUDGET]),
          lt(t.updatedAt, DEBUT_DU_JOUR),
          gt(t.updatedAt, sql`now() - make_interval(secs => ${REPRISE_DU_BUDGET_S})`),
          repartPourDeBon,
          sql`exists (select 1 from ${schema.stories} where ${schema.stories.id} = ${t.storyId} and ${schema.stories.debloqueLe} is not null)`,
        ),
      ),
    )
    .groupBy(t.storyId)
    .orderBy(desc(sql`max(${t.updatedAt})`))
    .limit(CHAINES_PAR_VEILLE);
  const reprises = await Promise.all(lignes.map((l) => passerLaMain(l.storyId, 1)));
  return reprises.filter(Boolean).length;
}

/**
 * La chaîne relancée après la réponse (after) : la seule façon de le faire depuis une route. Sans relancerChaine, Next
 * écrirait l’erreur entière dans les logs, message compris.
 */
export function relancerApres(storyId: string): void {
  after(() => relancerChaine(storyId));
}

/**
 * Les tâches coupées à leur dernier essai passent en échec (voir `clore`), et l’équipe est prévenue comme pour un autre
 * échec. Celles que le budget de l’IA a arrêtées avant minuit repartent (reprendreApresMinuit) : la chaîne les relance.
 * Les deux requêtes partent ensemble (elles ne touchent pas les mêmes tâches : en cours, ou en échec) : le suivi de la
 * lecture, chaque seconde, n’attend pas l’une après l’autre.
 */
export async function cloreLesAbandons(storyId: string): Promise<void> {
  const [, coupees] = await Promise.all([reprendreApresMinuit(storyId), clore(storyId)]);
  for (const t of coupees) await echecPourDeBon(t, "coupée à chaque essai (délai dépassé)");
}
