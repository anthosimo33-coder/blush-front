import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { pronomOppose } from "@/lib/pronom";
import type { Account, ReportPayload } from "@/types/api";
import type { AnalysisProgress, ConvSummary, Fiche } from "@/types";
import { ENTETE_CONV } from "@/services/session";
import { utilisateurDeSession, type Utilisateur } from "./auth";
import { etapeDeLecture, LECTURE_ATTENTE, LECTURE_DEPART, LECTURE_MAX, LECTURE_RYTHME_S, NB_ETAPES_DE_LECTURE, VERDICT_REFLEXION } from "./avancement";
import * as coffre from "./coffre";
import { donneesMemoire, donneesVerdict, ligneRapport } from "./depot";
import { compteAffiche, rapportOuvert } from "./droits";
import { echecDe } from "./erreurs";
import { ficheAffichee } from "./ecrans/fiche";
import { verdictAffiche } from "./ecrans/rapport";
import { lireBrouillon, lireChoisie, lireSession } from "./cookies";
import { db, schema } from "./db";
import { GENRES_CHAINE } from "./db/enums";
import { aSaConv, contexteDe, histoireOuverte, histoiresDuCompte, metaDe, personnesDe, type Ligne, type LigneComplete, type LigneEcran } from "./histoires";
import { initialeDe } from "./conv-affichee";
import { cloreLesAbandons, etatDepuis, reparerLaChaine, relancerApres } from "./pipeline";
import type { EtatChaine } from "./chaine";
import { assemblerRapport, enTete, ouvertureDu, type EnTete, type RapportLu } from "./presentation/rapport";
import { aRelancer, etatDesTaches } from "./taches";
import { voixDisponible } from "./ia/voix";
import { vocalLu } from "./vocal";
import { jourRelatif } from "./temps";

/*
 * Les données des écrans, dans les types du front. Utilisées par les pages serveur et par les routes /api. Ici, ce qui
 * lit la requête et la base ; le rapport lu s’assemble sans effet dans src/server/presentation/rapport.ts.
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
  if ((await aRelancer(storyId)).length) relancerApres(storyId);
}

/**
 * La lecture (le verdict) : sa vraie progression, écrite par le verdict pendant que le modèle répond (réflexion
 * jusqu’à 70 %, puis l’écriture du verdict). Avant ses premiers mots, le modèle lit la conv : on avance doucement
 * jusqu’à 15 %. Les étapes affichées suivent ces phases ; le compteur de messages est plein quand l’écriture commence.
 */
export async function progression(story: Ligne): Promise<AnalysisProgress> {
  const total = story.messageCount;
  const { verdict } = await etatDesTaches(story.id, ["verdict"]);
  /* Le paywall d’abord : la conv attend son paiement, le modèle n’a rien lu. Ce que le code a vu (les trouvailles) se montre déjà */
  if (verdict?.status === "paiement") return { progress: 1, messagesRead: total, stepsDone: NB_ETAPES_DE_LECTURE, discoveries: decouvertes(story, 1), done: false, paiement: true };
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
    /* Une prise du mode tournage : sa lecture, recopiée (src/server/tournage.ts), est finie ; l’écran qui vient de la lancer la déroule lui-même */
    ...(story.tournageLe ? { rejouee: true } : {}),
  };
}

/** Pendant la lecture : les trouvailles calculées par le code (ecrans/trouvailles.ts), une de plus tous les 20 %. */
function decouvertes(story: Ligne, p: number): string[] {
  return (contexteDe(story)?.trouvailles ?? []).slice(0, Math.min(3, Math.floor(p * 5)));
}

/** Les étapes du rapport (et la mémoire qui le suit) : celles qu’une relance peut reprendre. */
export const ETAPES_DU_RAPPORT = ["rapport_plan", "rapport_chapitres", "memoire"] as const;

/**
 * Ce que l’accueil montre du rapport (la fiche de contact) : le verdict seul, sans lire ni déchiffrer le rapport, ni
 * lancer sa suite (le rapport s’en charge à son ouverture). null tant que la lecture n’est pas finie.
 */
export async function contactDe(storyId: string): Promise<EnTete | null> {
  const v = await donneesVerdict(storyId);
  return v ? enTete(v.sortie) : null;
}

/** Le rapport tel que l’affiche le front, et `generating` : il s’écrit encore. */
type RapportAffiche = ReportPayload & { generating: boolean };

/**
 * Le rapport lu, prêt à assembler (`lu`, pour assemblerRapport), et de quoi lancer ce qui lui manque sans tout relire :
 * l’état de sa chaîne (`etat`), quand le rapport est ouvert (l’accès, ou le mode sobre). Tout est
 * lu d’un coup, pas l’un après l’autre : le verdict, le rapport, et avec l’accès (ou en mode sobre) l’état des tâches,
 * lu une fois pour tout, et le vocal.
 */
async function lireLeRapport(story: LigneEcran | LigneComplete, utilisateur: Utilisateur | null): Promise<{ lu: RapportLu; etat: EtatChaine | null } | null> {
  const aLeRapport = rapportOuvert(story, utilisateur);
  const [verdict, r, tachesLues, vocalLuAvant] = await Promise.all([
    donneesVerdict(story.id),
    ligneRapport(story.id),
    aLeRapport ? etatDesTaches(story.id, [...GENRES_CHAINE]) : null,
    aLeRapport ? vocalLu(story.id) : null,
  ]);
  if (!verdict) return null;
  const donnees = r?.data ? coffre.lire("reports.data", r.data) : null;
  const { ouvert } = ouvertureDu(aLeRapport, verdict.sortie);
  /* Un rapport sobre offert, sans l’accès : ce qui n’a pas été lu d’avance */
  const [taches, vocal] = ouvert && !tachesLues ? await Promise.all([etatDesTaches(story.id, [...GENRES_CHAINE]), vocalLu(story.id)]) : [tachesLues ?? {}, vocalLuAvant];
  /* Le plan et les chapitres finis ne sont lus (et déchiffrés) qu’avec l’accès, pendant l’écriture ; assemblerRapport les ignore sans lui */
  const enEcriture = aLeRapport && !donnees;
  const lu: RapportLu = {
    storyId: story.id,
    autre: personnesDe(metaDe(story)).autre.prenom,
    debloque: aLeRapport,
    verdict,
    donnees,
    plan: enEcriture && r?.plan ? coffre.lire("reports.plan", r.plan) : null,
    partiels: enEcriture && r?.partiel ? coffre.lire("reports.partiel", r.partiel) : [],
    taches,
    vocal,
    voix: voixDisponible(),
    maintenant: Date.now(),
  };
  return { lu, etat: ouvert ? etatDepuis({ conv: aSaConv(story), verdict, rapport: r, vocal, taches }) : null };
}

/**
 * Le rapport tel que l’affiche le front : lu, puis assemblé sans effet (assemblerRapport), ou null tant que la lecture
 * n’est pas finie. Une lecture seule : elle ne lance rien, même ce qui manque (ouvrirLeRapport le fait). Le rapport se
 * relit toutes les 2 s pendant son écriture.
 */
export async function rapportDe(story: LigneEcran | LigneComplete, utilisateur: Utilisateur | null): Promise<RapportAffiche | null> {
  const lecture = await lireLeRapport(story, utilisateur);
  return lecture ? assemblerRapport(lecture.lu) : null;
}

/**
 * Le rapport qu’on ouvre (GET /api/rapport, les pages du rapport par getReport, src/services/serveur.ts) : lu comme par
 * rapportDe, après avoir lancé ce qui devait partir et ne l’a jamais été (reparerLaChaine, pipeline.ts : le rapport d’un
 * accès donné après coup, la mémoire d’un rapport sobre offert, un vocal d’une ancienne version). La seule lecture du
 * rapport qui planifie des tâches payantes, et elle le dit par son nom. Ce qui part ne change que l’état des tâches :
 * lui seul est relu, pour montrer l’écriture (le verdict, le rapport et le vocal, déjà lus, ne bougent pas).
 */
export async function ouvrirLeRapport(story: LigneEcran | LigneComplete, utilisateur: Utilisateur | null): Promise<RapportAffiche | null> {
  const lecture = await lireLeRapport(story, utilisateur);
  if (!lecture) return null;
  const { lu, etat } = lecture;
  if (!etat || !(await reparerLaChaine(story, etat))) return assemblerRapport(lu);
  return assemblerRapport({ ...lu, taches: await etatDesTaches(story.id, [...GENRES_CHAINE]), maintenant: Date.now() });
}

/** Le compte tel que l’écran le lit : son email, ses bulles, ses droits (compteAffiche, src/server/droits.ts). */
export const compteDe = (utilisateur: Utilisateur, story: Ligne | null): Promise<Account> => compteAffiche(utilisateur, { storyDeleted: !story });

/**
 * La mémoire de l’histoire (après le rapport), ou null. Mémorisée le temps d’un rendu : l’accueil la lit pour la fiche
 * et pour les questions. (Une route /api la relit à chaque appel : `cache` n’y garde rien.)
 */
export const memoireDe = cache(donneesMemoire);

/**
 * Sa fiche, remplie par la mémoire. Avant la mémoire, et sur une mémoire de secours (src/server/secours.ts, sa fiche
 * reste vide) tant qu’il n’y a rien ajouté : vide, avec son prénom.
 */
export async function ficheDe(story: Ligne): Promise<Fiche> {
  const meta = metaDe(story);
  const { autre } = personnesDe(meta);
  const person = { id: "p-autre", name: autre.prenom, initial: initialeDe(autre.prenom), pronoun: pronomOppose(meta.pronom) };
  const m = await memoireDe(story.id);
  if (!m || (m.secours && !m.etat.fiche.faits.length)) return { person, portrait: "", updatedLabel: "pas encore remplie", facts: [], summary: "", summaryShort: "" };
  return ficheAffichee(person, m.etat, new Map(m.lignes));
}

/** Les 4 idées de questions de la mémoire. */
export async function questionsDe(storyId: string): Promise<string[]> {
  return (await memoireDe(storyId))?.etat.questions ?? [];
}
