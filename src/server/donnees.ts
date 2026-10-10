import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { headers } from "next/headers";
import { cache } from "react";
import { SUBSCRIPTIONS } from "@/contenu/offres";
import type { Account, EcritureRapport, EtatChapitre, ReportPayload } from "@/services/api";
import type { Plan as Plan05, Verdict as Verdict04 } from "@prompts/lib/schemas";
import type { AnalysisProgress, Chapter, ConvSummary, Fiche, Plan, Story, VocalRapport } from "@/types";
import { ENTETE_CONV } from "@/services/session";
/*
 * Seulement des types : la chaîne d’analyse (le SDK du modèle, tous les prompts) ne se charge qu’au moment de la
 * lancer (voir chaine()), pas à chaque première page d’une instance.
 */
import type { AvanceMoitie, DonneesMemoire, DonneesRapport, DonneesVerdict } from "./analyse";
import { utilisateurDeSession, type Utilisateur } from "./auth";
import { dechiffrer } from "./chiffrement";
import { lireBrouillon, lireChoisie, lireSession } from "./cookies";
import { db, schema } from "./db";
import { aSaConv, contexteDe, histoireOuverte, histoiresDuCompte, initialeDe, metaDe, storyAffichee, type Ligne, type LigneComplete, type LigneEcran } from "./histoires";
import { aRelancer, etatDesTaches, planifier, type Genre, type Tache } from "./taches";
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

/** La chaîne d’analyse, chargée à la demande (le SDK du modèle et les prompts ne servent qu’à elle). */
const chaine = () => import("./analyse");

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
  const sortieDe = new Map(verdicts.map((v) => [v.storyId, dechiffrer<DonneesVerdict>(v.data).sortie]));
  const parleDe = new Map(derniers.map((d) => [d.storyId, d.at]));
  const maintenant = new Date();
  return lignes
    .map((l) => {
      const meta = metaDe(l);
      const autre = meta.participants[1 - (meta.moi ?? 0)].prenom;
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
  const { cloreLesAbandons, executerChaine } = await chaine();
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

function ecritureDe(taches: EtatTaches, titres: Map<number, string>, autre: string, prets: Set<number>): EcritureRapport | undefined {
  const { rapport_plan: tp, rapport_chapitres: tc } = taches;
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

/**
 * Avec l’accès, ce qui doit s’écrire et n’a jamais été lancé : le rapport (l’accès donné à la main, ou débloqué depuis
 * une autre conv), la mémoire (après un rapport sobre offert, puis l’accès). Rien sans la conv brute (effacée au bout
 * de 30 jours). La chaîne repart après la réponse. `taches` : l’état déjà lu (le rapport le lit une fois pour tout).
 * Vrai si une tâche vient d’être lancée.
 */
export async function assurerLaSuite(story: LigneEcran | LigneComplete, acces: boolean, taches?: EtatTaches): Promise<boolean> {
  if (!acces || !aSaConv(story)) return false;
  const { verdict, rapport_plan, memoire } = taches ?? (await etatDesTaches(story.id, ["verdict", "rapport_plan", "memoire"]));
  if (verdict?.status !== "fini") return false;
  if (!rapport_plan) await planifier(story.id, "rapport_plan");
  else if (!memoire) {
    const [r] = await db().select({ pret: sql<boolean>`${schema.reports.data} is not null` }).from(schema.reports).where(eq(schema.reports.storyId, story.id));
    if (!r?.pret) return false;
    await planifier(story.id, "memoire");
  } else return false;
  after(async () => (await chaine()).executerChaine(story.id));
  return true;
}

/** Les étapes du rapport (et la mémoire qui le suit) : celles qu’une relance peut reprendre. */
export const ETAPES_DU_RAPPORT = ["rapport_plan", "rapport_chapitres", "memoire"] as const;

/** L’état des tâches d’une histoire (la dernière de chaque genre). */
type EtatTaches = Partial<Record<Genre, Tache>>;
/* Tout ce que le rapport regarde, lu en une requête : la suite à lancer, l’écriture, son échec, le vocal */
const TACHES_DU_RAPPORT: Genre[] = ["verdict", "rapport_plan", "rapport_chapitres", "memoire", "vocal"];

/** L’écriture du rapport a-t-elle échoué pour de bon ? `refus` : le modèle refuse, une relance n’y changerait rien. */
function echecDuRapport({ rapport_plan, rapport_chapitres }: EtatTaches): "panne" | "refus" | undefined {
  const t = [rapport_plan, rapport_chapitres].find((x) => x?.status === "echec");
  if (!t) return undefined;
  return t.error?.startsWith("refus") ? "refus" : "panne";
}

/** Ce que le verdict dit en tête du rapport, et sur l’accueil : son verdict, où vous en êtes, ton prochain pas. */
type EnTete = Pick<ReportPayload["report"], "verdict" | "level" | "trend" | "nextStep">;
const enTete = (sortie: Verdict04): EnTete => ({
  verdict: verdictAffiche(sortie),
  level: sortie.niveau ?? "parle",
  trend: sortie.tendance ?? "",
  nextStep: `Ton prochain pas : ${sortie.prochain_pas ?? ""}`,
});

/**
 * Ce que l’accueil montre du rapport (la fiche de contact) : le verdict seul, sans lire ni déchiffrer le rapport, ni
 * lancer sa suite (le rapport s’en charge à son ouverture). null tant que la lecture n’est pas finie.
 */
export async function contactDe(storyId: string): Promise<EnTete | null> {
  const [v] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  return v ? enTete(dechiffrer<DonneesVerdict>(v.data).sortie) : null;
}

/** Le rapport tel que l’affiche le front. Sans accès : le verdict et les chapitres verrouillés. */
export async function rapportDe(story: LigneEcran | LigneComplete, utilisateur: Utilisateur | null): Promise<(ReportPayload & { generating: boolean }) | null> {
  const access: Plan = (utilisateur?.plan as Plan) ?? "gratuit";
  /*
   * Tout est lu d’un coup, pas l’un après l’autre : le verdict, le rapport, et avec l’accès, l’état des tâches (lu une
   * fois pour toutes les étapes ci-dessous) et le vocal. Le rapport se relit toutes les 2 s pendant son écriture.
   */
  const [[v], [r], tachesLues, vocalLuAvant] = await Promise.all([
    db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id)),
    db().select().from(schema.reports).where(eq(schema.reports.storyId, story.id)),
    access !== "gratuit" ? etatDesTaches(story.id, TACHES_DU_RAPPORT) : null,
    access !== "gratuit" ? vocalLu(story.id) : null,
  ]);
  if (!v) return null;
  const { sortie, scores } = dechiffrer<DonneesVerdict>(v.data);
  const donnees = r?.data ? dechiffrer<DonneesRapport>(r.data) : null;
  const meta = metaDe(story);
  const autre = meta.participants[1 - (meta.moi ?? 0)].prenom;
  const ouvert = access !== "gratuit" || sortie.mode_sobre;
  /* Un rapport sobre offert, sans l’accès : ce qui n’a pas été lu d’avance */
  const [tachesOuvertes, vocalDeLaConv] = ouvert && !tachesLues ? await Promise.all([etatDesTaches(story.id, TACHES_DU_RAPPORT), vocalLu(story.id)]) : [tachesLues ?? {}, vocalLuAvant];
  let taches = tachesOuvertes;

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
  /* L’accès est là, mais le rapport (ou la mémoire d’un rapport sobre) n’a jamais été lancé : il part maintenant (et
     l’état des tâches est relu, pour montrer l’écriture tout de suite) */
  if (access !== "gratuit" && (!donnees || donnees.sobre) && (await assurerLaSuite(story, true, taches))) taches = await etatDesTaches(story.id, TACHES_DU_RAPPORT);
  const chapters = ouvert && donnees ? donnees.chapitres : ouvert ? enEcriture : [verdictLibre, ...verrouilles];
  const echec = ouvert && !donnees ? echecDuRapport(taches) : undefined;
  const ecriture = ouvert && !donnees && !echec ? ecritureDe(taches, titres, autre, new Set(partiels.keys())) : undefined;
  const vocal = ouvert ? await vocalDuRapport(story, sortie, !!donnees, taches, vocalDeLaConv) : undefined;

  return {
    report: {
      storyId: story.id,
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
 * Le vocal du rapport : prêt, en train de s’enregistrer (sa tâche attend ou tourne, ou le rapport s’écrit encore), ou
 * rien (pas de voix configurée, une alerte, un échec). Un rapport écrit avant le vocal reçoit le sien à son ouverture,
 * et un vocal d’une ancienne version du script se refait (une fois : si ça échoue, l’ancien reste).
 */
async function vocalDuRapport(story: Ligne, verdict: Verdict04, rapportFini: boolean, taches: EtatTaches, v: Awaited<ReturnType<typeof vocalLu>>): Promise<VocalRapport | undefined> {
  if (v?.aJour) return v.pret;
  if (!voixDisponible() || verdict.alerte) return v?.pret;
  /* La dernière tâche « vocal » : celle qui tourne, ou la dernière tentative */
  const { vocal: t } = taches;
  if (t?.status === "attente" || t?.status === "en_cours") return { etat: "en_cours" };
  const tenteDepuis = !!t && (!v || t.createdAt > v.fait);
  if (tenteDepuis) return v?.pret;
  if (!rapportFini) return { etat: "en_cours" };
  await planifier(story.id, "vocal");
  after(async () => (await chaine()).executerChaine(story.id));
  return { etat: "en_cours" };
}

export function compteDe(utilisateur: Utilisateur, story: Ligne | null): Account {
  const plan = utilisateur.plan as Plan;
  return { email: utilisateur.email, subscription: { ...SUBSCRIPTIONS[plan], paused: utilisateur.paused }, storyDeleted: !story };
}

/**
 * La mémoire de l’histoire (après le rapport), ou null. Mémorisée le temps d’un rendu : l’accueil la lit pour la fiche
 * et pour les questions. (Une route /api la relit à chaque appel : `cache` n’y garde rien.)
 */
export const memoireDe = cache(async (storyId: string): Promise<DonneesMemoire | null> => {
  const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, storyId));
  return m ? dechiffrer<DonneesMemoire>(m.data) : null;
});

/** Sa fiche, remplie par la mémoire. Avant la mémoire : vide, avec son prénom. */
export async function ficheDe(story: Ligne): Promise<Fiche> {
  const meta = metaDe(story);
  const autre = meta.participants[1 - (meta.moi ?? 0)];
  const person = { id: "p-autre", name: autre.prenom, initial: initialeDe(autre.prenom), pronoun: meta.pronom === "elle" ? ("il" as const) : ("elle" as const) };
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
