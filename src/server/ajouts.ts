import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { messagesDeLExport, messagesDesCaptures, numeroter, type Ajout } from "@prompts/lib/ajouts";
import type { Message } from "@prompts/lib/conv";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import type { ExportLu } from "@prompts/lib/export";
import { lireLigne } from "@prompts/lib/ligne";
import type { Echange } from "@prompts/lib/memoire";
import { Sortie01 } from "@prompts/lib/schemas";
import type { Fiche, FicheUpdate } from "@/types";
import type { CodeErreur } from "@/types/erreurs-api";
import * as coffre from "./coffre";
import { ficheDe } from "./donnees";
import { ErreurPublique } from "./erreurs";
import { planifier } from "./taches";
import { db, schema, uneLigne } from "./db";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { relancerApres } from "./pipeline";
import type { DonneesMemoire } from "./stockage/types";
import { exigerSortie } from "./ia/appel-verifie";
import { appeler } from "./ia/claude";
import { aujourdhuiParis } from "./temps";

/*
 * Ce qu’il envoie après l’import, dans le chat ou pour sa fiche : un nouvel export de leur conv, ou des captures
 * (leur conv, ou son profil). On en garde ce qui est nouveau, numéroté à la suite de la conv.
 */

/** Rien d’utilisable : un fichier illisible, une autre conv, des captures sans rien à lire, ou rien de neuf. */
export class ErreurAjout extends ErreurPublique<Extract<CodeErreur, "fichier" | "autre_conv" | "capture" | "rien_de_neuf">> {}

/** Au-delà, les plus anciens des nouveaux messages ne sont pas gardés (un export des mois après l’import). */
const MESSAGES_MAX = 400;

/** Le dernier message déjà lu. Avant qu’on le garde à la seconde près : la fin de la journée du dernier message (le coffre la remplit). */
const curseurDe = (story: Ligne) => {
  const c = contexteDe(story);
  if (!c) throw new ErreurAjout("rien_de_neuf");
  return c.dernier;
};

/** Réserve `n` numéros d’un coup (deux envois en même temps n’ont jamais le même) : renvoie le premier. */
async function reserver(storyId: string, n: number, depart: number): Promise<number> {
  const r = uneLigne(
    await db()
      .update(schema.stories)
      .set({ nextMessage: sql`greatest(coalesce(${schema.stories.nextMessage}, 0), ${depart}) + ${n}` })
      .where(eq(schema.stories.id, storyId))
      .returning({ suivant: schema.stories.nextMessage }),
    "stories:numeros_reserves",
  );
  return r.suivant! - n;
}

/** Le curseur avance jusqu’au dernier message lu : le prochain export repart de là. */
async function avancer(storyId: string, dernier: number | null) {
  if (dernier == null) return;
  const story = uneLigne(await db().select().from(schema.stories).where(eq(schema.stories.id, storyId)), "stories:curseur");
  const c = contexteDe(story);
  if (!c || c.dernier >= dernier) return;
  await db()
    .update(schema.stories)
    .set({ context: coffre.ecrire("stories.context", { ...c, dernier }), updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));
}

async function garder(story: Ligne, memoire: DonneesMemoire, messages: Message[], profil: string[]): Promise<Ajout> {
  const recents = messages.slice(-MESSAGES_MAX);
  if (!recents.length && !profil.length) throw new ErreurAjout("rien_de_neuf");
  const h = histoireDe(metaDe(story));
  const debut = await reserver(story.id, recents.length + profil.length, memoire.suivant);
  const ajout = numeroter(recents, profil, h, { debut, aujourdhui: aujourdhuiParis().iso });
  await avancer(story.id, ajout.dernier);
  return ajout;
}

/** Un nouvel export de leur conv (déjà lu par lib/export) : les messages arrivés depuis le dernier lu. */
export async function depuisExport(story: Ligne, memoire: DonneesMemoire, lu: ExportLu): Promise<Ajout> {
  const h = histoireDe(metaDe(story));
  const messages = messagesDeLExport(lu.texte, h, curseurDe(story));
  if (typeof messages === "string") throw new ErreurAjout(messages);
  return garder(story, memoire, messages, []);
}

/**
 * Des captures, lues par le prompt 01 : les nouveaux messages de leur conv, et ce qu’on lit sur son profil. Rien de
 * lisible : « capture » ; un refus du modèle : « refus » (exigerSortie), que le chat et la fiche savent dire.
 */
export async function depuisCaptures(story: Ligne, memoire: DonneesMemoire, images: Image[]): Promise<Ajout> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const j = aujourdhuiParis();
  const a = await appeler(requeteCaptures({ prenom: h.utilisateur.prenom, autre: h.autre.prenom, appli: meta.appli, aujourdhui: j.t, images }), Sortie01, {
    storyId: story.id,
    etiquette: "captures",
  });
  const lues = exigerSortie(a, () => new ErreurAjout("capture"));
  const profil = lues.profil.map((p) => p.trim()).filter(Boolean);
  const lus = lues.blocs.some((b) => b.messages.length);
  if (!lus && !profil.length) throw new ErreurAjout("capture");
  const messages = lus ? messagesDesCaptures(lues, h, { aujourdhui: j.iso, apres: curseurDe(story) }) : [];
  return garder(story, memoire, messages, profil);
}

/** Ce que l’historique du chat affiche à la place des fichiers : « 3 captures », « ton export (12 nouveaux messages) ». */
export function resumeAjout(a: Ajout, source: "captures" | "export", n: number): string {
  const quoi = source === "export" ? "ton export" : n > 1 ? `${n} captures` : "ta capture";
  const detail = [a.messages ? `${a.messages} nouveau${a.messages > 1 ? "x" : ""} message${a.messages > 1 ? "s" : ""}` : "", a.profil ? "son profil" : ""]
    .filter(Boolean)
    .join(", ");
  return `(${quoi}${detail ? `\u00a0: ${detail}` : ""})`;
}

/** Ce qu’on a lu sur son profil, tel quel : la fin des lignes « profil de … » de l’ajout. */
const profilLu = (a: Ajout) =>
  a.lignes.flatMap((l) => {
    const lue = lireLigne(l);
    return lue?.profil ? [lue.texte.replaceAll(" ⏎ ", " ")] : [];
  });

/**
 * Pour sa fiche : on répond tout de suite avec ce qui a été lu (son profil, le nombre de nouveaux messages), et la
 * mémoire se met à jour après la réponse (20 à 60 s ; attendre la gardait jusqu’à 2 min devant le chargement). La
 * fiche dit qu’une mise à jour tourne (`updating`) : l’écran la relit jusqu’à ce qu’elle ait fini (GET /api/fiche).
 */
export async function ajouterALaFiche(story: Ligne, ajout: Ajout): Promise<FicheUpdate & { confirmed: [] }> {
  const echange: Echange = { date: aujourdhuiParis().iso, lignes: ajout.lignes, dit: "(il ajoute ça à sa fiche)" };
  const [, fiche] = await Promise.all([planifier(story.id, "memoire_maj", echange), ficheDe(story)]);
  relancerApres(story.id);
  /*
   * `confirmed` (toujours vide, le front ne le lit plus) reste dans la réponse le temps d’une mise en production : un
   * onglet ouvert avant elle garde l’ancien code, qui le lit sans vérifier (sa fiche planterait). À retirer au lot suivant.
   */
  return { fiche: { ...fiche, updating: true }, added: [], confirmed: [], pending: { profile: profilLu(ajout), messages: ajout.messages } };
}

/** Une mise à jour de la mémoire est-elle en attente ou en cours (un ajout à sa fiche, un échange du chat) ? */
export async function majEnCours(storyId: string): Promise<boolean> {
  const [t] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire_maj"), inArray(schema.tasks.status, ["attente", "en_cours"])))
    .limit(1);
  return !!t;
}

/**
 * Sa fiche, et si une mise à jour de la mémoire est en attente ou en cours (`updating`) : l’écran la relit toutes les
 * 3 s jusqu’à ce qu’elle ait fini. Une mise à jour restée en plan (l’instance arrêtée, ou plus le temps de la commencer
 * après la lecture des captures) repart après la réponse ; si une autre la tient, executerChaine la laisse faire.
 * La même pour GET et PUT /api/fiche et pour la page rendue par le serveur (getFiche) : une fiche rendue à l’instant,
 * que l’écran ne relit pas au montage (Q63), dit déjà qu’une mise à jour tourne.
 */
export async function ficheEtMaj(story: Ligne): Promise<Fiche> {
  const [fiche, enCours] = await Promise.all([ficheDe(story), majEnCours(story.id)]);
  if (!enCours) return fiche;
  relancerApres(story.id);
  return { ...fiche, updating: true };
}
