import "server-only";
import type { BlushAnswer, ConvSummary, Fiche, QuestionAnswer, Story } from "@/types";
import type { Account, ReportPayload } from "./api";
import { BACKEND } from "./mode";
import { cookies } from "next/headers";
import { historique } from "@/server/historique";
import { compteDe, contactDe, contexteRequete, convsDe, ficheDe, finDeLecture, questionsDe, rapportDe, storyCourante, utilisateurCourant } from "@/server/donnees";
import { histoiresDuCompte, metaDe, quiRempli, storyAffichee } from "@/server/histoires";
import { currentStoryId } from "./session.server";
import { connexionPuis } from "@/lib/suite";

/*
 * Les données de démo (les mocks, le vocal de démo) ne se chargent qu’en mode démo : avec le back-end, jamais. Les
 * branches démo d’api.ts, appelées directement : elles lisent l’état de démo avant leur premier await (avecEtat)
 */
const demo = () => import("./demo");
const mocks = () => import("@/mocks/story");

/*
 * Démo : l’état du faux back-end (le plan, le verdict, le compte, la question posée), recopié par le navigateur dans un
 * cookie (src/mocks/server.ts). Les pages se rendent ainsi comme le navigateur les relira, sans sauter ensuite. Son email
 * et sa question à lui n’y sont pas : leur ligne est rendue, leur texte arrive à la relecture du navigateur.
 */
async function avecEtatDemo<T>(lire: (d: Awaited<ReturnType<typeof demo>>) => Promise<T>): Promise<T> {
  const [d, { DEMO_COOKIE, avecEtat, etatDuCookie }, jar] = await Promise.all([demo(), import("@/mocks/server"), cookies()]);
  return avecEtat(etatDuCookie(jar.get(DEMO_COOKIE)?.value), () => lire(d));
}

/*
 * Les données des pages serveur. Avec le back-end, elles viennent de la base, d’après les cookies de la requête ;
 * sans, des mocks (comme avant). null : rien à montrer (pas d’histoire, pas connecté, pas encore prêt).
 */

/** `parcours` : les écrans de l’import, qui montrent la conv en train d’être importée (voir histoireOuverte). */
export async function getStory(storyId?: string, { parcours = false } = {}): Promise<Story | null> {
  return BACKEND ? storyCourante(parcours) : (await demo()).getStory(storyId);
}

/**
 * La conv ouverte attend encore « Qui es-tu ? » : importée, puis laissée avant (et ouverte par une connexion, par
 * exemple). Sa lecture ne peut pas partir sans : l’écran de lecture renvoie à /qui. Démo : jamais.
 */
export async function quiAttendu(): Promise<boolean> {
  if (!BACKEND) return false;
  const { story } = await contexteRequete();
  return !!story && !quiRempli(metaDe(story));
}

/**
 * Rien à montrer sur une page d’une conv (accueil, rapport…) : sans compte connecté (le lien du mail ouvert dans un autre
 * navigateur, une session expirée), la connexion, qui ramène ensuite à `suite`. Connecté sans conv : commencer.
 */
export async function sansHistoire(suite: string): Promise<string> {
  return BACKEND && !(await contexteRequete()).utilisateur ? connexionPuis(suite) : "/commencer";
}

/** Déjà connecté : une nouvelle conv passe alors de « Qui es-tu ? » à la lecture, sans l’écran email. Démo : non. */
export async function estConnecte(): Promise<boolean> {
  return BACKEND && !!(await utilisateurCourant());
}

export async function getReport(storyId?: string): Promise<ReportPayload | null> {
  if (!BACKEND) return avecEtatDemo((d) => d.getReport(storyId));
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? rapportDe(story, utilisateur) : null;
}

/**
 * La lecture est finie (le verdict est écrit) : getReport ne sera pas null. La garde de /rapport, dans son layout, qui
 * se rend aussi à chaque préchargement du lien : sans lire le rapport, que getReport déchiffre en lançant sa suite.
 * Démo : toujours.
 */
export async function verdictEcrit(): Promise<boolean> {
  if (!BACKEND) return true;
  const { utilisateur, story } = await contexteRequete();
  return !!utilisateur && !!story && (await finDeLecture(story.id)) != null;
}

/**
 * Ce que l’accueil montre du rapport : le verdict, où vous en êtes, ton prochain pas. Sans lire le rapport entier
 * (getReport le déchiffre, avec le vocal et l’état des tâches). null : pas encore de verdict.
 */
export async function getContact(storyId?: string): Promise<Pick<ReportPayload["report"], "verdict" | "level" | "trend" | "nextStep"> | null> {
  if (!BACKEND) {
    const { verdict, level, trend, nextStep } = (await avecEtatDemo((d) => d.getReport(storyId))).report;
    return { verdict, level, trend, nextStep };
  }
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? contactDe(story.id) : null;
}

export async function getFiche(storyId?: string): Promise<Fiche | null> {
  if (!BACKEND) return (await demo()).getFiche(storyId);
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? ficheDe(story) : null;
}

export async function getQuickQuestions(storyId?: string): Promise<string[]> {
  if (!BACKEND) return (await demo()).getQuickQuestions(storyId);
  const { story } = await contexteRequete();
  return story ? questionsDe(story.id) : [];
}

export async function getQuestionIdeas(storyId?: string): Promise<string[]> {
  if (!BACKEND) return (await demo()).getQuestionIdeas(storyId);
  const { story } = await contexteRequete();
  return story ? questionsDe(story.id) : [];
}

/**
 * Les échanges déjà eus avec BLUSH, à réafficher sur l’accueil, et l’heure de l’intro (quand la lecture s’est finie,
 * l’heure du verdict). Rien en démo.
 */
export async function getChat(): Promise<{ echanges: { id: number; mine: string; answer: BlushAnswer; at: number }[]; plus: boolean; modeVocal?: boolean; introAt?: number }> {
  if (!BACKEND) return { echanges: [], plus: false };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return { echanges: [], plus: false };
  /* Le mode vocal est déjà dans la ligne de l’histoire : historique() ne le relit pas */
  const [h, introAt] = await Promise.all([historique(story.id, { modeVocal: !!story.chatVocal }), finDeLecture(story.id)]);
  return { ...h, ...(introAt ? { introAt } : {}) };
}

/** Toi et elle, pour « Mon compte ». Démo : Hugo et Sophie. */
export async function getNomsDuCompte(): Promise<{ me: Story["participants"][number]; other: Story["participants"][number]; period: string } | null> {
  if (!BACKEND) {
    const { PEOPLE, STORY } = await mocks();
    return { me: PEOPLE.hugo, other: PEOPLE.sophie, period: STORY.period };
  }
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return null;
  const meta = metaDe(story);
  const affichee = storyAffichee(story.id, meta);
  const moi = meta.moi ?? 0;
  return { me: affichee.participants[moi], other: affichee.participants[1 - moi], period: affichee.period };
}

/**
 * Sur la landing, qui revient : connecté, avec une histoire (null sinon), le prénom de l’autre, et où mène « Retrouver ma
 * conv » : « Qui es-tu ? » s’il n’est pas rempli, la lecture tant qu’elle n’est pas finie, sinon son accueil. Sans les
 * redirections en chaîne (/app → /rapport → /lecture → /qui), un aller-retour et un rendu serveur par saut. Démo : Sophie.
 */
export async function getRetour(): Promise<{ autre: string | null; destination: string } | null> {
  if (!BACKEND) return { autre: (await mocks()).PEOPLE.sophie.name, destination: "/app" };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return null;
  const meta = metaDe(story);
  const autre = meta.moi == null ? null : meta.participants[1 - meta.moi].prenom;
  if (!quiRempli(meta)) return { autre, destination: "/qui" };
  return { autre, destination: (await finDeLecture(story.id)) ? "/app" : "/lecture" };
}

/** Le compte, pour « Mon compte » : son email et son abonnement, dès le rendu serveur. null : pas connecté. */
export async function getCompte(): Promise<Account | null> {
  if (!BACKEND) return avecEtatDemo((d) => d.getAccount());
  const { utilisateur, story } = await contexteRequete();
  return utilisateur ? compteDe(utilisateur, story) : null;
}

/** La question du rapport déjà posée, et sa réponse. Back-end : null (elle passe par le chat). Démo : d’après le cookie. */
export async function getQuestion(storyId?: string): Promise<QuestionAnswer | null> {
  return BACKEND ? null : avecEtatDemo((d) => d.getQuestion(storyId));
}

/**
 * Les convs du compte, pour la liste « Tes convs ». Une seule : pas de liste, l’accueil reste comme avant.
 * Démo : Sophie, Inès et Camille avec ?convs=plusieurs (`demande`, le paramètre de l’adresse, compte dès le premier
 * rendu ; ensuite, c’est le cookie posé par DemoParams).
 */
export async function getConvs(demande?: string | string[]): Promise<ConvSummary[]> {
  if (BACKEND) {
    const { utilisateur, story } = await contexteRequete();
    return utilisateur ? convsDe(utilisateur, story) : [];
  }
  const [{ CONVS_COOKIE }, { demoConvs }] = await Promise.all([import("@/mocks/convs"), import("@/mocks/stories")]);
  const plusieurs = demande === "plusieurs" || (demande !== "une" && (await cookies()).get(CONVS_COOKIE)?.value === "plusieurs");
  return plusieurs ? demoConvs(await currentStoryId()) : [];
}

/**
 * Combien de convs compterait getConvs, sans les lire (ni leurs verdicts, ni leurs derniers messages) : la garde de
 * « Tes convs », dans son layout, qui se rend aussi à chaque préchargement du lien. Démo : d’après le cookie seul.
 */
export async function nombreDeConvs(): Promise<number> {
  if (!BACKEND) return (await getConvs()).length;
  const { utilisateur } = await contexteRequete();
  return utilisateur ? (await histoiresDuCompte(utilisateur.id)).length : 0;
}
