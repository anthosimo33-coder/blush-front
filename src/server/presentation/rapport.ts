import { CHAPITRES_PAYANTS, estOffert, titreDAttente } from "@/contenu/chapitres";
import { peut } from "@/lib/acces";
import type { EcritureRapport, EtatChapitre, ReportPayload } from "@/types/api";
import type { Chapter, Echec, Plan, VocalRapport } from "@/types";
import { verdictAffiche, type ChapitreAffiche } from "@prompts/lib/front";
import type { Plan as PlanDuRapport, Verdict } from "@prompts/lib/schemas";
import { avanceChapitres, CHAPITRES_PAR_MOITIE, DUREES_MS, ECRITURE_MAX, PART_DU_PLAN, RYTHME_FIABLE } from "../avancement";
import { echecDe } from "../erreurs";
import type { DonneesRapport, DonneesVerdict } from "../stockage/types";
import { enMarche, vocalTente, type EtatTaches } from "../chaine";
import type { vocalLu } from "../vocal";

/*
 * Le rapport tel que l’affiche le front, assemblé d’après ce qui est lu en base (rapportDe, src/server/donnees.ts) :
 * sans rien lire, écrire ni planifier. Ni base, ni requête, ni modèle : testé seul (tests/unit/assembler-rapport.test.ts).
 */

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
  /** Le plan du rapport, pendant l’écriture : ses vrais titres. Ignoré sans l’accès. */
  plan: PlanDuRapport | null;
  /** Les chapitres déjà finis, pendant l’écriture. Ignorés sans l’accès. */
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
 * Ce que le compte voit du rapport : `entier`, tous ses chapitres (l’accès, src/lib/acces.ts) ; `ouvert`, son écriture,
 * son vocal et sa partie sobre, avec l’accès ou en mode sobre (une alerte : le rapport doux, offert).
 */
export const ouvertureDu = (access: Plan, verdict: Pick<Verdict, "mode_sobre">) => {
  const entier = peut(access, "rapport");
  return { entier, ouvert: entier || verdict.mode_sobre };
};

/** Ce que le verdict dit en tête du rapport, et sur l’accueil : son verdict, où vous en êtes, ton prochain pas. */
export type EnTete = Pick<ReportPayload["report"], "verdict" | "level" | "trend" | "nextStep">;
export const enTete = (sortie: Verdict): EnTete => ({
  verdict: verdictAffiche(sortie),
  level: sortie.niveau ?? "parle",
  trend: sortie.tendance ?? "",
  nextStep: `Ton prochain pas\u00a0: ${sortie.prochain_pas ?? ""}`,
});

/** L’écriture du rapport a-t-elle échoué pour de bon ? `refus` : le modèle refuse, une relance n’y changerait rien. */
function echecDuRapport({ rapport_plan, rapport_chapitres }: EtatTaches): Echec | undefined {
  const t = [rapport_plan, rapport_chapitres].find((x) => x?.status === "echec");
  if (!t) return undefined;
  return echecDe(t.error);
}

const duree = (s: number) => (s < 50 ? `${Math.max(10, Math.ceil(s / 10) * 10)}\u00a0s` : `${Math.max(1, Math.round(s / 60))}\u00a0min`);

/* Les durées habituelles des étapes (avancement.ts), en secondes : le plan, puis les deux moitiés en même temps */
const PLAN_S = DUREES_MS.rapport_plan / 1000;
const CHAPITRES_S = DUREES_MS.rapport_chapitres / 1000;

/**
 * Pendant que le rapport s’écrit : la vraie avancée (le plan compte pour PART_DU_PLAN, les deux moitiés pour le reste),
 * l’état de chaque chapitre, et le temps qui reste, estimé sur le rythme depuis le début. `titres` : ceux du plan, une
 * fois fait. `maintenant` : l’heure de la lecture, en millisecondes.
 */
function ecritureDe(taches: EtatTaches, titres: Map<number, string>, autre: string, prets: Set<number>, maintenant: number): EcritureRapport | undefined {
  const { rapport_plan: tp, rapport_chapitres: tc } = taches;
  if (!tp) return undefined;
  const pPlan = tp.status === "fini" ? 1 : tp.progress / 100;
  const detail = tc?.detail ?? null;
  const fini = tc?.status === "fini";
  const pChap = fini ? 1 : avanceChapitres(detail);
  const progres = Math.min(ECRITURE_MAX, PART_DU_PLAN * pPlan + (1 - PART_DU_PLAN) * pChap);
  const etat = (n: number): EtatChapitre => {
    if (fini || prets.has(n)) return "ecrit";
    const m = n <= CHAPITRES_PAR_MOITIE ? detail?.a : detail?.b;
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

/**
 * Le vocal du rapport : prêt, en train de s’enregistrer (sa tâche attend ou tourne, ou le rapport s’écrit encore), ou
 * rien (pas de voix configurée, une alerte, un échec). Un rapport écrit avant le vocal reçoit le sien à son ouverture,
 * et un vocal d’une ancienne version du script se refait, une fois (si ça échoue, l’ancien reste) : la réparation
 * (rapportDe) a déjà planifié sa tâche, qui attend. La même règle que la chaîne (vocalTente, src/server/chaine.ts).
 */
function vocalAffiche(v: VocalLu, verdict: Verdict, taches: EtatTaches, voix: boolean): VocalRapport | undefined {
  if (v?.aJour) return v.pret;
  if (!voix || verdict.alerte) return v?.pret;
  /* La dernière tâche « vocal » : celle qui tourne, ou la dernière tentative */
  const { vocal: t } = taches;
  if (enMarche(t)) return { etat: "en_cours" };
  if (vocalTente(t, v)) return v?.pret;
  /* Rien de tenté depuis le dernier vocal : il se fera pendant l’écriture du rapport (sa tâche part avec le plan) */
  return { etat: "en_cours" };
}

/**
 * Le rapport tel que l’affiche le front, assemblé d’après ce qui est lu (rapportDe), sans rien lire, écrire ni
 * planifier. Sans accès : le chapitre offert (le verdict, src/contenu/chapitres.ts) et les chapitres payants,
 * verrouillés, vides, sous leurs titres d’attente : ni le plan ni les chapitres finis ne servent, même si la lecture
 * en apportait. Le mode sobre (une alerte) ouvre sans accès sa partie sobre, et elle seule (S-25).
 */
export function assemblerRapport(lu: RapportLu): ReportPayload & { generating: boolean } {
  const { access, autre, donnees, taches } = lu;
  const { sortie, scores } = lu.verdict;
  const { entier, ouvert } = ouvertureDu(access, sortie);
  /* Le plan et les chapitres finis ne comptent qu’avec l’accès (S-25) */
  const plan = entier ? lu.plan : null;
  const lusPartiels = entier ? lu.partiels : [];

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
  const titres = new Map((plan?.chapitres ?? []).map((c) => [c.numero, c.titre_court || c.titre]));
  const verrouilles: Chapter[] = CHAPITRES_PAYANTS.map((n) => {
    const t = titres.get(n) ?? titreDAttente(n, autre);
    return { number: n, title: t, tocTitle: t, free: estOffert(n), locked: true, blocks: [] };
  });
  /*
   * Pendant l’écriture, les chapitres déjà finis se lisent tout de suite, dans l’ordre : un chapitre prêt en avance
   * attend (dans la liste, « Prêt ») que ceux d’avant le soient aussi. Le chapitre 1 complet remplace le verdict seul.
   */
  const partiels = new Map(lusPartiels.map((c) => [c.number, c]));
  let suite = true;
  const enEcriture: Chapter[] = [partiels.get(1) ? { ...partiels.get(1)!, free: estOffert(1), locked: false } : verdictLibre];
  for (const c of verrouilles) {
    const pret = partiels.get(c.number);
    suite = suite && !!pret;
    enEcriture.push(pret && suite ? { ...pret, free: estOffert(c.number), locked: false } : c);
  }
  /* Les chapitres ne s’ouvrent qu’avec l’accès : le rapport sobre offert n’en montre aucun, même s’il en garde (S-25) */
  const chapters = !entier ? [verdictLibre, ...verrouilles] : donnees ? donnees.chapitres : enEcriture;
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
