import "server-only";
import type { BlushAnswer, ConvSummary, Fiche, Story } from "@/types";
import * as demo from "./api";
import type { ReportPayload } from "./api";
import { BACKEND } from "./mode";
import { cookies } from "next/headers";
import { CONVS_COOKIE } from "@/mocks/convs";
import { demoConvs } from "@/mocks/stories";
import { PEOPLE, STORY } from "@/mocks/story";
import { historique } from "@/server/chat";
import { contexteRequete, convsDe, ficheDe, finDeLecture, questionsDe, rapportDe, storyCourante } from "@/server/donnees";
import { metaDe, quiRempli, storyAffichee } from "@/server/histoires";
import { currentStoryId } from "./session.server";
import { connexionPuis } from "@/lib/suite";

/*
 * Les données des pages serveur. Avec le back-end, elles viennent de la base, d’après les cookies de la requête ;
 * sans, des mocks (comme avant). null : rien à montrer (pas d’histoire, pas connecté, pas encore prêt).
 */

/** `parcours` : les écrans de l’import, qui montrent la conv en train d’être importée (voir histoireOuverte). */
export async function getStory(storyId?: string, { parcours = false } = {}): Promise<Story | null> {
  return BACKEND ? storyCourante(parcours) : demo.getStory(storyId);
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
  return BACKEND && !!(await contexteRequete(true)).utilisateur;
}

export async function getReport(storyId?: string): Promise<ReportPayload | null> {
  if (!BACKEND) return demo.getReport(storyId);
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? rapportDe(story, utilisateur) : null;
}

export async function getFiche(storyId?: string): Promise<Fiche | null> {
  if (!BACKEND) return demo.getFiche(storyId);
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? ficheDe(story) : null;
}

export async function getQuickQuestions(storyId?: string): Promise<string[]> {
  if (!BACKEND) return demo.getQuickQuestions(storyId);
  const { story } = await contexteRequete();
  return story ? questionsDe(story.id) : [];
}

export async function getQuestionIdeas(storyId?: string): Promise<string[]> {
  if (!BACKEND) return demo.getQuestionIdeas(storyId);
  const { story } = await contexteRequete();
  return story ? questionsDe(story.id) : [];
}

/**
 * Les échanges déjà eus avec BLUSH, à réafficher sur l’accueil, et l’heure de l’intro (quand la lecture s’est finie,
 * l’heure du verdict). Rien en démo.
 */
export async function getChat(): Promise<{ echanges: { id: number; mine: string; answer: BlushAnswer; at: number }[]; plus: boolean; introAt?: number }> {
  if (!BACKEND) return { echanges: [], plus: false };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return { echanges: [], plus: false };
  const [h, introAt] = await Promise.all([historique(story.id), finDeLecture(story.id)]);
  return { ...h, ...(introAt ? { introAt } : {}) };
}

/** Toi et elle, pour « Mon compte ». Démo : Hugo et Sophie. */
export async function getNomsDuCompte(): Promise<{ me: Story["participants"][number]; other: Story["participants"][number]; period: string } | null> {
  if (!BACKEND) return { me: PEOPLE.hugo, other: PEOPLE.sophie, period: STORY.period };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return null;
  const meta = metaDe(story);
  const affichee = storyAffichee(story.id, meta);
  const moi = meta.moi ?? 0;
  return { me: affichee.participants[moi], other: affichee.participants[1 - moi], period: affichee.period };
}

/** Sur la landing, qui revient : connecté, avec une histoire (null sinon), et le prénom de l’autre. Démo : Sophie. */
export async function getRetour(): Promise<{ autre: string | null } | null> {
  if (!BACKEND) return { autre: PEOPLE.sophie.name };
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur || !story) return null;
  const meta = metaDe(story);
  return { autre: meta.moi == null ? null : meta.participants[1 - meta.moi].prenom };
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
  const plusieurs = demande === "plusieurs" || (demande !== "une" && (await cookies()).get(CONVS_COOKIE)?.value === "plusieurs");
  return plusieurs ? demoConvs(await currentStoryId()) : [];
}
