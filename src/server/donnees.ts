import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { headers } from "next/headers";
import { cache } from "react";
import { CHAPITRES_PAYANTS, estOffert, titreDAttente } from "@/contenu/chapitres";
import { SUBSCRIPTIONS } from "@/contenu/offres";
import { peut } from "@/lib/acces";
import { pronomOppose } from "@/lib/pronom";
import type { Account, EcritureRapport, EtatChapitre, ReportPayload } from "@/types/api";
import type { ChapitreAffiche } from "@prompts/lib/front";
import type { Plan as PlanDuRapport, Verdict as Verdict04 } from "@prompts/lib/schemas";
import type { AnalysisProgress, Chapter, ConvSummary, Echec, Fiche, Plan, Story, VocalRapport } from "@/types";
import { ENTETE_CONV } from "@/services/session";
import { utilisateurDeSession, type Utilisateur } from "./auth";
import { ECRITURE_MAX, etapeDeLecture, LECTURE_ATTENTE, LECTURE_DEPART, LECTURE_MAX, LECTURE_RYTHME_S, NB_ETAPES_DE_LECTURE, PART_DU_PLAN, RYTHME_FIABLE, VERDICT_REFLEXION } from "./avancement";
import * as coffre from "./coffre";
import { echecDe } from "./erreurs";
import { lireBrouillon, lireChoisie, lireSession } from "./cookies";
import { db, schema } from "./db";
import { GENRES_CHAINE } from "./db/enums";
import { aSaConv, contexteDe, histoireOuverte, histoiresDuCompte, initialeDe, metaDe, personnesDe, storyAffichee, type Ligne, type LigneComplete, type LigneEcran } from "./histoires";
import { cloreLesAbandons, DUREES_MS, executerChaine, reparerLaChaine, type EtatTaches } from "./pipeline";
import type { DonneesMemoire, DonneesRapport, DonneesVerdict } from "./stockage/types";
import { aRelancer, etatDesTaches } from "./taches";
import { voixDisponible } from "./ia/voix";
import { vocalLu } from "./vocal";
import { jourRelatif } from "./temps";
import { faitsAffiches, verdictAffiche } from "@prompts/lib/front";

/*
 * Les données des écrans, dans les types du front. Utilisées par les pages serveur et par les routes /api.
 */

/** Le compte de la requête (sa session), ou null. Mémorisé le temps d’un rendu, comme contexteRequete. */
export const utilisateurCourant = cache(async (): Promise<Utilisateur | null> => utilisateurDeSession(await lireSession()));

/*
 * `cache` de React se repère aux arguments : contexteRequete(), contexteRequete(false) et contexteRequete(true)
 * seraient trois entrées. On passe toujours un booléen explicite, et le compte est lu une fois pour toutes.
 */
const contexteMemo = cache(async (parcours: boolean): Promise<{ utilisateur: Utilisateur | null; story: LigneEcran | null }> => {
  const utilisateur = await utilisateurCourant();
  /* Un appel du navigateur désigne la conv de sa page (src/services/session.ts) ; une page qui se rend n’a pas cet en-tête */
  const affichee = (await headers()).get(ENTETE_CONV);
  const story = await histoireOuverte(utilisateur, { brouillon: await lireBrouillon(), choisie: await lireChoisie(), affichee }, { parcours });
  return { utilisateur, story };
});

/**
 * Qui fait la requête, et son histoire ouverte (voir histoireOuverte), sans la conv brute. `parcours` : les écrans et
 * routes de l’import, qui suivent d’abord la conv en train d’être importée. Mémorisé le temps d’un rendu : une page
 * qui lit plusieurs données (l’accueil en lit six) ne refait pas ces requêtes à chaque fois.
 */
export const contexteRequete = (parcours = false) => contexteMemo(!!parcours);

export async function storyCourante(parcours = false): Promise<Story | null> {
  const { story } = await contexteRequete(parcours);
  return story ? storyAffichee(story.id, metaDe(story)) : null;
}

/**
 * Les convs du compte, pour « Tes convs » : l’autre personne, où vous en êtes (une fois le verdict écrit), et quand
 * BLUSH en a parlé pour la dernière fois. La plus active d’abord. `ouverte` : celle que montre l’accueil.
 */
export async function convsDe(utilisateur: Utilisateur, ouverte: Ligne | null): Promise<ConvSummary[]> {
  const lignes = await histoiresDuCompte(utilisateur.id);
  if (!lignes.length) return [];
  const ids = lignes.map((l) => l.id);
  /*
   * Le dernier message de chaque conv : le plus grand id, trouvé dans l’index (story_id, id) sans lire les autres.
   * Un max(created_at) lisait tous les messages de chaque conv.
   */
  const dernier = sql<Date | null>`(select "m"."created_at" from ${schema.chatMessages} as "m" where "m"."story_id" = "stories"."id" order by "m"."id" desc limit 1)`;
  const [verdicts, derniers] = await Promise.all([
    db().select().from(schema.verdicts).where(inArray(schema.verdicts.storyId, ids)),
    db()
      .select({ storyId: schema.stories.id, at: dernier.mapWith(schema.chatMessages.createdAt) })
      .from(schema.stories)
      .where(inArray(schema.stories.id, ids)),
  ]);
  const sortieDe = new Map(verdicts.map((v) => [v.storyId, coffre.lire("verdicts.data", v.data).sortie]));
  const parleDe = new Map(derniers.map((d) => [d.storyId, d.at]));
  const maintenant = new Date();
  return lignes
    .map((l) => {
      const meta = metaDe(l);
      const autre = personnesDe(meta).autre.prenom;
      const sortie = sortieDe.get(l.id);
      const verdict = sortie ? verdictAffiche(sortie) : null;
      const parle = parleDe.get(l.id);
      const quand = parle && parle > l.createdAt ? parle : l.createdAt;
      const conv: ConvSummary = {
        storyId: l.id,
        person: { id: "p-autre", name: autre, initial: initialeDe(autre) },
        verdict: verdict ? { emoji: verdict.emoji, title: verdict.title } : null,
        level: sortie?.niveau ?? null,
        trend: sortie?.tendance ?? "",
        lastLabel: jourRelatif(quand, maintenant),
        current: l.id === ouverte?.id,
      };
      return { quand, conv };
    })
    .sort((a, b) => b.quand.getTime() - a.quand.getTime())
    .map((x) => x.conv);
}

/** Quand la lecture s’est finie (l’heure du verdict), en millisecondes : l’heure de l’intro de BLUSH sur l’accueil. Mémorisé le temps d’un rendu. */
export const finDeLecture = cache(async (storyId: string): Promise<number | null> => {
  const [v] = await db().select({ at: schema.verdicts.createdAt }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  return v?.at.getTime() ?? null;
});

/** Relance, après la réponse, les tâches en attente ou abandonnées de l’histoire. Celles coupées à leur dernier essai passent en échec. */
export async function relancer(storyId: string): Promise<void> {
  await cloreLesAbandons(storyId);
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
  const lecture = verdict?.status === "en_cours" ? Math.min(LECTURE_MAX, LECTURE_DEPART + ecoule / LECTURE_RYTHME_S) : LECTURE_ATTENTE;
  const p = fini ? 1 : Math.max(lecture, (verdict?.progress ?? 0) / 100);
  return {
    progress: p,
    messagesRead: Math.round(Math.min(1, p / (VERDICT_REFLEXION / 100)) * total),
    stepsDone: fini ? NB_ETAPES_DE_LECTURE : etapeDeLecture(p),
    discoveries: decouvertes(story, p),
    done: fini,
    ...(echec ? { failed: true, failReason: echecDe(verdict?.error) } : {}),
  };
}

/** Pendant la lecture : les trouvailles calculées par le code (lib/trouvailles.ts), une de plus tous les 20 %. */
function decouvertes(story: Ligne, p: number): string[] {
  return (contexteDe(story)?.trouvailles ?? []).slice(0, Math.min(3, Math.floor(p * 5)));
}

const duree = (s: number) => (s < 50 ? `${Math.max(10, Math.ceil(s / 10) * 10)}\u00a0s` : `${Math.max(1, Math.round(s / 60))}\u00a0min`);

/* Les durées habituelles des étapes (pipeline.ts), en secondes : le plan, puis les deux moitiés en même temps */
const PLAN_S = DUREES_MS.rapport_plan / 1000;
const CHAPITRES_S = DUREES_MS.rapport_chapitres / 1000;

/**
 * Pendant que le rapport s’écrit : la vraie avancée (le plan compte pour 35 %, les deux moitiés pour 65 %), l’état
 * de chaque chapitre, et le temps qui reste, estimé sur le rythme depuis le début. `titres` : ceux du plan, une fois
 * fait. `maintenant` : l’heure de la lecture, en millisecondes.
 */
function ecritureDe(taches: EtatTaches, titres: Map<number, string>, autre: string, prets: Set<number>, maintenant: number): EcritureRapport | undefined {
  const { rapport_plan: tp, rapport_chapitres: tc } = taches;
  if (!tp) return undefined;
  const pPlan = tp.status === "fini" ? 1 : tp.progress / 100;
  const detail = tc?.detail ?? null;
  const fini = tc?.status === "fini";
  const pChap = fini ? 1 : detail ? (detail.a.progres + detail.b.progres) / 2 : 0;
  const progres = Math.min(ECRITURE_MAX, PART_DU_PLAN * pPlan + (1 - PART_DU_PLAN) * pChap);
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
  const enCoursDepuis = tc?.status === "en_cours" ? (maintenant - tc.updatedAt.getTime()) / 1000 : 0;
  const restant =
    tp.status !== "fini" ? (1 - pPlan) * PLAN_S + CHAPITRES_S : pChap > RYTHME_FIABLE && enCoursDepuis > 0 ? (enCoursDepuis * (1 - pChap)) / pChap : (1 - pChap) * CHAPITRES_S;
  return {
    etape: tp.status === "fini" ? "chapitres" : "plan",
    progres,
    restant: duree(restant),
    chapitres: CHAPITRES_PAYANTS.map((n) => ({ number: n, title: titres.get(n) ?? titreDAttente(n, autre), etat: etat(n) })),
  };
}

/*
 * Avec l’accès, ce qui doit s’écrire et n’a jamais été lancé (le rapport d’un accès donné après coup, la mémoire d’un
 * rapport sobre offert) : reparerLaChaine (pipeline.ts). Repris ici sous son ancien nom pour POST /api/debloquer, qui
 * passera par pipeline.ts au lot 3a.
 */
export { reparerLaChaine as assurerLaSuite } from "./pipeline";

/** Les étapes du rapport (et la mémoire qui le suit) : celles qu’une relance peut reprendre. */
export const ETAPES_DU_RAPPORT = ["rapport_plan", "rapport_chapitres", "memoire"] as const;

/** L’écriture du rapport a-t-elle échoué pour de bon ? `refus` : le modèle refuse, une relance n’y changerait rien. */
function echecDuRapport({ rapport_plan, rapport_chapitres }: EtatTaches): Echec | undefined {
  const t = [rapport_plan, rapport_chapitres].find((x) => x?.status === "echec");
  if (!t) return undefined;
  return echecDe(t.error);
}

/** Ce que le verdict dit en tête du rapport, et sur l’accueil : son verdict, où vous en êtes, ton prochain pas. */
type EnTete = Pick<ReportPayload["report"], "verdict" | "level" | "trend" | "nextStep">;
const enTete = (sortie: Verdict04): EnTete => ({
  verdict: verdictAffiche(sortie),
  level: sortie.niveau ?? "parle",
  trend: sortie.tendance ?? "",
  nextStep: `Ton prochain pas\u00a0: ${sortie.prochain_pas ?? ""}`,
});

/**
 * Ce que l’accueil montre du rapport (la fiche de contact) : le verdict seul, sans lire ni déchiffrer le rapport, ni
 * lancer sa suite (le rapport s’en charge à son ouverture). null tant que la lecture n’est pas finie.
 */
export async function contactDe(storyId: string): Promise<EnTete | null> {
  const [v] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  return v ? enTete(coffre.lire("verdicts.data", v.data).sortie) : null;
}

/** Le vocal de l’histoire, tel que vocalLu le rend (src/server/vocal.ts), ou null. */
type VocalLu = Awaited<ReturnType<typeof vocalLu>>;

/** Ce que le rapport lit en base, déchiffré : de quoi l’assembler (assemblerRapport) sans rien relire. */
export type RapportLu = {
  storyId: string;
  /** Le prénom de l’autre : les titres d’attente des chapitres. */
  autre: string;
  /** Le plan du compte. */
  access: Plan;
  verdict: DonneesVerdict;
  /** Le rapport gardé, ou null tant qu’il s’écrit (ou qu’il n’a pas commencé). */
  donnees: DonneesRapport | null;
  /** Le plan du rapport, pendant l’écriture : ses vrais titres. Lu seulement avec l’accès. */
  plan: PlanDuRapport | null;
  /** Les chapitres déjà finis, pendant l’écriture. Lus seulement avec l’accès. */
  partiels: ChapitreAffiche[];
  /** La dernière tâche de chaque genre de la chaîne (vide quand le rapport est fermé : rien n’est regardé). */
  taches: EtatTaches;
  vocal: VocalLu;
  /** Une voix est configurée (voixDisponible). */
  voix: boolean;
  /** L’heure de la lecture, en millisecondes : le temps qui reste de l’écriture en dépend. */
  maintenant: number;
};

/**
 * Le rapport tel que l’affiche le front, assemblé d’après ce qui est lu (rapportDe), sans rien lire, écrire ni
 * planifier. Sans accès : le chapitre offert (le verdict, src/contenu/chapitres.ts) et les chapitres payants,
 * verrouillés et vides. Le mode sobre (une alerte) ouvre sans accès sa partie sobre, et elle seule (S-25).
 */
export function assemblerRapport(lu: RapportLu): ReportPayload & { generating: boolean } {
  const { access, autre, donnees, taches } = lu;
  const { sortie, scores } = lu.verdict;
  /* Le rapport entier (src/lib/acces.ts) ; sans, le chapitre offert */
  const aLeRapport = peut(access, "rapport");
  const ouvert = aLeRapport || sortie.mode_sobre;

  const verdictLibre: Chapter = {
    number: 1,
    title: titreDAttente(1, autre),
    tocTitle: titreDAttente(1, autre),
    free: estOffert(1),
    /* Le sous-titre est déjà sous le titre du verdict (en-tête du chapitre) : pas une seconde fois ici */
    blocks: [
      { kind: "scores", rows: scores },
      ...(sortie.devinette ? [{ kind: "meaning" as const, text: sortie.devinette }] : []),
      ...(sortie.confiance ? [{ kind: "confidence" as const, level: sortie.confiance === "a_verifier" ? ("verifier" as const) : sortie.confiance, text: sortie.confiance_texte ?? "" }] : []),
    ],
  };
  /* Le plan fait (le rapport s’écrit) : ses vrais titres remplacent ceux d’attente */
  const titres = new Map((lu.plan?.chapitres ?? []).map((c) => [c.numero, c.titre_court || c.titre]));
  const verrouilles: Chapter[] = CHAPITRES_PAYANTS.map((n) => {
    const t = titres.get(n) ?? titreDAttente(n, autre);
    return { number: n, title: t, tocTitle: t, free: estOffert(n), locked: true, blocks: [] };
  });
  /*
   * Pendant l’écriture, les chapitres déjà finis se lisent tout de suite, dans l’ordre : un chapitre prêt en avance
   * attend (dans la liste, « Prêt ») que ceux d’avant le soient aussi. Le chapitre 1 complet remplace le verdict seul.
   */
  const partiels = new Map(lu.partiels.map((c) => [c.number, c]));
  let suite = true;
  const enEcriture: Chapter[] = [partiels.get(1) ? { ...partiels.get(1)!, free: estOffert(1), locked: false } : verdictLibre];
  for (const c of verrouilles) {
    const pret = partiels.get(c.number);
    suite = suite && !!pret;
    enEcriture.push(pret && suite ? { ...pret, free: estOffert(c.number), locked: false } : c);
  }
  /* Les chapitres ne s’ouvrent qu’avec l’accès : le rapport sobre offert n’en montre aucun, même s’il en garde (S-25) */
  const chapters = !aLeRapport ? [verdictLibre, ...verrouilles] : donnees ? donnees.chapitres : enEcriture;
  const echec = ouvert && !donnees ? echecDuRapport(taches) : undefined;
  const ecriture = ouvert && !donnees && !echec ? ecritureDe(taches, titres, autre, new Set(partiels.keys()), lu.maintenant) : undefined;
  const vocal = ouvert ? vocalAffiche(lu.vocal, sortie, taches, lu.voix) : undefined;

  return {
    report: {
      storyId: lu.storyId,
      ...enTete(sortie),
      chapters,
      readingTime: donnees?.lecture ?? { free: "1 min", full: "9 min" },
    },
    sober: ouvert ? (donnees?.sobre ?? null) : null,
    access,
    /* Le rapport s’écrit (accès débloqué, pas encore fini) : le front affiche l’attente, et où en est l’écriture */
    generating: ouvert && !donnees && !echec,
    ...(echec ? { echec } : {}),
    ...(ecriture ? { ecriture } : {}),
    ...(vocal ? { vocal } : {}),
  };
}

/**
 * Le rapport tel que l’affiche le front : lu, réparé, puis assemblé (assemblerRapport). Tout est lu d’un coup, pas
 * l’un après l’autre : le verdict, le rapport, et avec l’accès (ou en mode sobre) l’état des tâches, lu une fois pour
 * tout, et le vocal. Le rapport se relit toutes les 2 s pendant son écriture.
 * La réparation (reparerLaChaine, pipeline.ts) lance ce qui devait partir et n’a jamais été lancé : une lecture qui
 * planifie des tâches payantes, le temps que les routes s’en chargent elles-mêmes (lot 3a).
 */
export async function rapportDe(story: LigneEcran | LigneComplete, utilisateur: Utilisateur | null): Promise<(ReportPayload & { generating: boolean }) | null> {
  const access: Plan = utilisateur?.plan ?? "gratuit";
  const aLeRapport = peut(access, "rapport");
  const [[v], [r], tachesLues, vocalLuAvant] = await Promise.all([
    db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id)),
    db().select().from(schema.reports).where(eq(schema.reports.storyId, story.id)),
    aLeRapport ? etatDesTaches(story.id, [...GENRES_CHAINE]) : null,
    aLeRapport ? vocalLu(story.id) : null,
  ]);
  if (!v) return null;
  const verdict = coffre.lire("verdicts.data", v.data);
  const donnees = r?.data ? coffre.lire("reports.data", r.data) : null;
  const ouvert = aLeRapport || verdict.sortie.mode_sobre;
  /* Un rapport sobre offert, sans l’accès : ce qui n’a pas été lu d’avance */
  const [tachesOuvertes, vocal] = ouvert && !tachesLues ? await Promise.all([etatDesTaches(story.id, [...GENRES_CHAINE]), vocalLu(story.id)]) : [tachesLues ?? {}, vocalLuAvant];
  let taches = tachesOuvertes;
  /* Ce qui n’a jamais été lancé part maintenant ; l’état des tâches est alors relu, pour montrer l’écriture tout de suite */
  const etat = { conv: aSaConv(story), voix: voixDisponible(), verdict: verdict.sortie, plan: !!r?.plan, rapport: !!donnees, vocal, taches };
  if (ouvert && (await reparerLaChaine(story, aLeRapport, etat))) taches = await etatDesTaches(story.id, [...GENRES_CHAINE]);
  /* Le plan et les chapitres finis ne se lisent qu’avec l’accès, pendant l’écriture */
  const enEcriture = aLeRapport && !donnees;
  return assemblerRapport({
    storyId: story.id,
    autre: personnesDe(metaDe(story)).autre.prenom,
    access,
    verdict,
    donnees,
    plan: enEcriture && r?.plan ? coffre.lire("reports.plan", r.plan) : null,
    partiels: enEcriture && r?.partiel ? coffre.lire("reports.partiel", r.partiel) : [],
    taches,
    vocal,
    voix: voixDisponible(),
    maintenant: Date.now(),
  });
}

/**
 * Le vocal du rapport : prêt, en train de s’enregistrer (sa tâche attend ou tourne, ou le rapport s’écrit encore), ou
 * rien (pas de voix configurée, une alerte, un échec). Un rapport écrit avant le vocal reçoit le sien à son ouverture,
 * et un vocal d’une ancienne version du script se refait, une fois (si ça échoue, l’ancien reste) : la réparation
 * (rapportDe) a déjà planifié sa tâche, qui attend.
 */
function vocalAffiche(v: VocalLu, verdict: Verdict04, taches: EtatTaches, voix: boolean): VocalRapport | undefined {
  if (v?.aJour) return v.pret;
  if (!voix || verdict.alerte) return v?.pret;
  /* La dernière tâche « vocal » : celle qui tourne, ou la dernière tentative */
  const { vocal: t } = taches;
  if (t?.status === "attente" || t?.status === "en_cours") return { etat: "en_cours" };
  const tenteDepuis = !!t && (!v || t.createdAt > v.fait);
  if (tenteDepuis) return v?.pret;
  /* Rien de tenté depuis le dernier vocal : il se fera pendant l’écriture du rapport (sa tâche part avec le plan) */
  return { etat: "en_cours" };
}

export function compteDe(utilisateur: Utilisateur, story: Ligne | null): Account {
  return { email: utilisateur.email, subscription: { ...SUBSCRIPTIONS[utilisateur.plan], paused: utilisateur.paused }, storyDeleted: !story };
}

/**
 * La mémoire de l’histoire (après le rapport), ou null. Mémorisée le temps d’un rendu : l’accueil la lit pour la fiche
 * et pour les questions. (Une route /api la relit à chaque appel : `cache` n’y garde rien.)
 */
export const memoireDe = cache(async (storyId: string): Promise<DonneesMemoire | null> => {
  const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, storyId));
  return m ? coffre.lire("memories.data", m.data) : null;
});

/** Sa fiche, remplie par la mémoire. Avant la mémoire : vide, avec son prénom. */
export async function ficheDe(story: Ligne): Promise<Fiche> {
  const meta = metaDe(story);
  const { autre } = personnesDe(meta);
  const person = { id: "p-autre", name: autre.prenom, initial: initialeDe(autre.prenom), pronoun: pronomOppose(meta.pronom) };
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
