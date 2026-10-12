import "server-only";
import type { Route } from "next";
import type { ConvSummary, Fiche, Story } from "@/types";
import type { Account, HistoriqueChat, ReportPayload } from "@/types/api";
import { ficheEtMaj } from "@/server/ajouts";
import { historique } from "@/server/historique";
import { compteDe, contactDe, convsDe, ficheDe, finDeLecture, ouvrirLeRapport, questionsDe, utilisateurCourant } from "@/server/donnees";
import { rapportOuvert } from "@/server/droits";
import { histoiresDuCompte, metaDe, quiRempli } from "@/server/histoires";
import { storyAffichee } from "@/server/conv-affichee";
import { achatDuFauxWhop, achatPaye } from "@/server/paiement/commande";
import { contexte } from "@/server/requete";
import { moiEtAutre } from "@/lib/participants";
import { connexionPuis } from "@/lib/suite";

/*
 * Les données des pages serveur. Elles viennent de la base, d’après les cookies de la requête. null : rien à montrer
 * (pas d’histoire, pas connecté, pas encore prêt).
 */

/** `parcours` : les écrans de l’import, qui montrent la conv en train d’être importée (voir histoireOuverte). */
export async function getStory({ parcours = false } = {}): Promise<Story | null> {
  const { story } = await contexte({ parcours });
  return story ? storyAffichee(story.id, metaDe(story)) : null;
}

/**
 * L’identifiant de la conv que la page montre, telle que le contexte de la requête la résout (le cookie de « Tes
 * convs », sinon la dernière conv du compte : histoireOuverte). C’est la clé de ce que l’accueil et sa fiche gardent
 * pendant la visite : sans cookie (une connexion sans brouillon), elle reste celle de la conv affichée, et ce qu’ils
 * gardent d’une conv ne se fond jamais dans une autre. null : pas de conv.
 */
export async function idDeLaConv(): Promise<string | null> {
  const { story } = await contexte();
  return story?.id ?? null;
}

/**
 * La conv ouverte attend encore « Qui es-tu ? » : importée, puis laissée avant (et ouverte par une connexion, par
 * exemple). Sa lecture ne peut pas partir sans : l’écran de lecture renvoie à /qui.
 */
export async function quiAttendu(): Promise<boolean> {
  const { story } = await contexte();
  return !!story && !quiRempli(metaDe(story));
}

/**
 * Rien à montrer sur une page d’une conv (accueil, rapport…) : sans compte connecté (le lien du mail ouvert dans un autre
 * navigateur, une session expirée), la connexion, qui ramène ensuite à `suite`. Connecté sans conv : commencer.
 */
export async function sansHistoire(suite: string): Promise<Route> {
  return !(await contexte()).utilisateur ? connexionPuis(suite) : "/commencer";
}

/** Déjà connecté : une nouvelle conv passe alors de « Qui es-tu ? » à la lecture, sans l’écran email. */
export async function estConnecte(): Promise<boolean> {
  return !!(await utilisateurCourant());
}

/** Le rapport de la page : ouvert (ouvrirLeRapport), il lance ce qui devait partir et ne l’a jamais été, comme GET /api/rapport. */
export async function getReport(): Promise<ReportPayload | null> {
  const { utilisateur, story } = await contexte();
  return utilisateur && story ? ouvrirLeRapport(story, utilisateur) : null;
}

/**
 * La lecture est finie (le verdict est écrit) : getReport ne sera pas null. La garde de /rapport, dans son layout, qui
 * se rend aussi à chaque préchargement du lien : sans lire le rapport, que getReport déchiffre en lançant ce qui lui manque.
 */
export async function verdictEcrit(): Promise<boolean> {
  const { utilisateur, story } = await contexte();
  return !!utilisateur && !!story && (await finDeLecture(story.id)) != null;
}

/**
 * Ce que l’accueil montre du rapport : le verdict, où vous en êtes, ton prochain pas. Sans lire le rapport entier
 * (getReport le déchiffre, avec le vocal et l’état des tâches). null : pas encore de verdict.
 */
export async function getContact(): Promise<Pick<ReportPayload["report"], "verdict" | "level" | "trend" | "nextStep"> | null> {
  const { utilisateur, story } = await contexte();
  return utilisateur && story ? contactDe(story.id) : null;
}

/** Sa fiche, telle qu’elle est écrite (ce que l’accueil en montre : son prénom, son résumé). */
export async function getFiche(): Promise<Fiche | null> {
  const { utilisateur, story } = await contexte();
  return utilisateur && story ? ficheDe(story) : null;
}

/**
 * Sa fiche pour sa page, comme GET /api/fiche la donne (ficheEtMaj) : avec `updating` si une mise à jour de la mémoire
 * tourne (l’écran, qui ne relit pas une fiche rendue à l’instant, la relit alors dès le montage), et une mise à jour
 * restée en plan relancée après le rendu.
 */
export async function getFicheEtMaj(): Promise<Fiche | null> {
  const { utilisateur, story } = await contexte();
  return utilisateur && story ? ficheEtMaj(story) : null;
}

/** Les questions tirées de la mémoire de la conv : les questions toutes prêtes de l’accueil, les idées de « Ta question ». */
export async function questionsDeLaConv(): Promise<string[]> {
  const { story } = await contexte();
  return story ? questionsDe(story.id) : [];
}

/**
 * Les échanges déjà eus avec BLUSH, à réafficher sur l’accueil, et l’heure de l’intro (quand la lecture s’est finie,
 * l’heure du verdict).
 */
export async function getChat(): Promise<HistoriqueChat & { introAt?: number }> {
  const { utilisateur, story } = await contexte();
  if (!utilisateur || !story) return { echanges: [], plus: false };
  /* Le mode vocal est déjà dans la ligne de l’histoire : historique() ne le relit pas */
  const [h, introAt] = await Promise.all([historique(story.id, { modeVocal: !!story.chatVocal }), finDeLecture(story.id)]);
  return { ...h, ...(introAt ? { introAt } : {}) };
}

/** Toi et elle, pour « Mon compte ». */
export async function getNomsDuCompte(): Promise<{ me: Story["participants"][number]; other: Story["participants"][number]; period: string } | null> {
  const { utilisateur, story } = await contexte();
  if (!utilisateur || !story) return null;
  const affichee = storyAffichee(story.id, metaDe(story));
  const { moi, autre } = moiEtAutre(affichee);
  return { me: moi, other: autre, period: affichee.period };
}

/**
 * Sur la landing, qui revient : connecté, avec une histoire (null sinon), et où mène « Retrouver ma conv » : « Qui es-tu ? »
 * s’il n’est pas rempli, la lecture tant qu’elle n’est pas finie, sinon son accueil. Sans les redirections en chaîne
 * (/app → /rapport → /lecture → /qui), un aller-retour et un rendu serveur par saut. Jamais le prénom de l’autre : la
 * landing s’ouvre à qui tient l’appareil, sans rien toucher.
 */
export async function getRetour(): Promise<{ destination: Route } | null> {
  const { utilisateur, story } = await contexte();
  if (!utilisateur || !story) return null;
  if (!quiRempli(metaDe(story))) return { destination: "/qui" };
  return { destination: (await finDeLecture(story.id)) ? "/app" : "/lecture" };
}

/**
 * Ce que pose toute page d’une conv (src/components/shell/PageDeConv.tsx) : la conv qu’elle montre (ses gestes la
 * désignent, voir ENTETE_CONV dans src/services/session.ts), et le compte, que la coque des écrans lit pour ses droits.
 * Sans requête de plus : le contexte de la requête est déjà lu pour la page (contexte, mémorisé le temps du rendu).
 */
export async function pageDeConv(): Promise<{ id: string | null; compte: Account | null }> {
  const { story } = await contexte();
  return { id: story?.id ?? null, compte: await getCompte() };
}

/**
 * Le rapport de la conv ouverte est-il débloqué (payé, offert, ou un compte de l’équipe) ? Sans requête de plus : la
 * conv et le compte de la requête sont déjà lus (contexte, mémorisé le temps du rendu).
 */
export async function rapportDebloque(): Promise<boolean> {
  const { utilisateur, story } = await contexte();
  return !!story && rapportOuvert(story, utilisateur);
}

/** Le compte, pour « Mon compte » : son email, ses bulles et ses droits, dès le rendu serveur. null : pas connecté. */
export async function getCompte(): Promise<Account | null> {
  const { utilisateur, story } = await contexte();
  return utilisateur ? await compteDe(utilisateur, story) : null;
}

/** Les convs du compte, pour la liste « Tes convs ». Une seule : pas de liste, l’accueil reste comme avant. */
export async function getConvs(): Promise<ConvSummary[]> {
  const { utilisateur, story } = await contexte();
  return utilisateur ? convsDe(utilisateur, story) : [];
}

/**
 * Combien de convs compterait getConvs, sans les lire (ni leurs verdicts, ni leurs derniers messages) : la garde de
 * « Tes convs », dans son layout, qui se rend aussi à chaque préchargement du lien.
 */
export async function nombreDeConvs(): Promise<number> {
  const { utilisateur } = await contexte();
  return utilisateur ? (await histoiresDuCompte(utilisateur.id)).length : 0;
}

/** L’achat payé du compte connecté, pour « C’est débloqué » (`?achat=`) : son offre et ses bulles ; null sinon. */
export async function getAchatPaye(achat: string): Promise<Awaited<ReturnType<typeof achatPaye>>> {
  const u = await utilisateurCourant();
  return u ? achatPaye(u, achat) : null;
}

/** L’achat du compte connecté que montre la page du faux Whop (BLUSH_PAIEMENT_FACTICE seulement) ; null sinon. */
export async function getAchatDuFauxWhop(achat: string): Promise<Awaited<ReturnType<typeof achatDuFauxWhop>>> {
  const u = await utilisateurCourant();
  return u ? achatDuFauxWhop(u, achat) : null;
}
