import "server-only";
import type { BlushAnswer, Fiche, Story } from "@/types";
import * as demo from "./api";
import type { ReportPayload } from "./api";
import { BACKEND } from "./mode";
import { PEOPLE, STORY } from "@/mocks/story";
import { historique } from "@/server/chat";
import { contexteRequete, ficheDe, questionsDe, rapportDe, storyCourante } from "@/server/donnees";
import { metaDe, storyAffichee } from "@/server/histoires";

/*
 * Les données des pages serveur. Avec le back-end, elles viennent de la base, d’après les cookies de la requête ;
 * sans, des mocks (comme avant). null : rien à montrer (pas d’histoire, pas connecté, pas encore prêt).
 */

export async function getStory(storyId?: string): Promise<Story | null> {
  return BACKEND ? storyCourante() : demo.getStory(storyId);
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

/** Les échanges déjà eus avec BLUSH, à réafficher sur l’accueil. Rien en démo. */
export async function getChat(): Promise<{ mine: string; answer: BlushAnswer; at: number }[]> {
  if (!BACKEND) return [];
  const { utilisateur, story } = await contexteRequete();
  return utilisateur && story ? historique(story.id) : [];
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
