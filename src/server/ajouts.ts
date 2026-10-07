import "server-only";
import { eq, sql } from "drizzle-orm";
import { messagesDeLExport, messagesDesCaptures, numeroter, type Ajout } from "@prompts/lib/ajouts";
import type { Message } from "@prompts/lib/conv";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import type { ExportLu } from "@prompts/lib/export";
import type { Echange } from "@prompts/lib/memoire";
import { Sortie01 } from "@prompts/lib/schemas";
import type { FicheUpdate } from "@/types";
import { attendreTache, type DonneesMemoire } from "./analyse";
import { ficheDe } from "./donnees";
import { planifier } from "./taches";
import { chiffrer } from "./chiffrement";
import { db, schema } from "./db";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { appeler } from "./ia/claude";
import { aujourdhuiParis } from "./temps";

/*
 * Ce qu’il envoie après l’import, dans le chat ou pour sa fiche : un nouvel export de leur conv, ou des captures
 * (leur conv, ou son profil). On en garde ce qui est nouveau, numéroté à la suite de la conv.
 */

/** Rien d’utilisable : un fichier illisible, une autre conv, des captures sans rien à lire, ou rien de neuf. */
export class ErreurAjout extends Error {
  constructor(readonly code: "fichier" | "autre_conv" | "capture" | "rien_de_neuf") {
    super(code);
  }
}

/** Au-delà, les plus anciens des nouveaux messages ne sont pas gardés (un export des mois après l’import). */
const MESSAGES_MAX = 400;

/** Le dernier message déjà lu. Avant qu’on le garde à la seconde près : la fin de la journée du dernier message. */
const curseurDe = (story: Ligne) => {
  const c = contexteDe(story);
  if (!c) throw new ErreurAjout("rien_de_neuf");
  return c.dernier ?? Date.parse(`${c.fin}T23:59:59Z`);
};

/** Réserve `n` numéros d’un coup (deux envois en même temps n’ont jamais le même) : renvoie le premier. */
async function reserver(storyId: string, n: number, depart: number): Promise<number> {
  const [r] = await db()
    .update(schema.stories)
    .set({ nextMessage: sql`greatest(coalesce(${schema.stories.nextMessage}, 0), ${depart}) + ${n}` })
    .where(eq(schema.stories.id, storyId))
    .returning({ suivant: schema.stories.nextMessage });
  return r.suivant! - n;
}

/** Le curseur avance jusqu’au dernier message lu : le prochain export repart de là. */
async function avancer(storyId: string, dernier: number | null) {
  if (dernier == null) return;
  const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, storyId));
  const c = contexteDe(story);
  if (!c || (c.dernier ?? 0) >= dernier) return;
  await db().update(schema.stories).set({ context: chiffrer({ ...c, dernier }), updatedAt: new Date() }).where(eq(schema.stories.id, storyId));
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

/** Des captures, lues par le prompt 01 : les nouveaux messages de leur conv, et ce qu’on lit sur son profil. */
export async function depuisCaptures(story: Ligne, memoire: DonneesMemoire, images: Image[]): Promise<Ajout> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const j = aujourdhuiParis();
  const a = await appeler(requeteCaptures({ prenom: h.utilisateur.prenom, autre: h.autre.prenom, appli: meta.appli, aujourdhui: j.t, images }), Sortie01, { storyId: story.id, etiquette: "captures" });
  if (!a.sortie) throw new ErreurAjout("capture");
  const profil = a.sortie.profil.map((p) => p.trim()).filter(Boolean);
  const lus = a.sortie.blocs.some((b) => b.messages.length);
  if (!lus && !profil.length) throw new ErreurAjout("capture");
  const messages = lus ? messagesDesCaptures(a.sortie, h, { aujourdhui: j.iso, apres: curseurDe(story) }) : [];
  return garder(story, memoire, messages, profil);
}

/** Ce que l’historique du chat affiche à la place des fichiers : « 3 captures », « ton export (12 nouveaux messages) ». */
export function resumeAjout(a: Ajout, source: "captures" | "export", n: number): string {
  const quoi = source === "export" ? "ton export" : n > 1 ? `${n} captures` : "ta capture";
  const detail = [a.messages ? `${a.messages} nouveau${a.messages > 1 ? "x" : ""} message${a.messages > 1 ? "s" : ""}` : "", a.profil ? "son profil" : ""].filter(Boolean).join(", ");
  return `(${quoi}${detail ? ` : ${detail}` : ""})`;
}

/**
 * Pour sa fiche : la mémoire se met à jour tout de suite avec ce qui vient d’arriver, et on renvoie la fiche avec
 * les infos nouvelles. Si la mise à jour n’a pas fini à temps, la fiche revient telle quelle (elle finira après).
 */
export async function ajouterALaFiche(story: Ligne, avant: Set<string>, ajout: Ajout): Promise<FicheUpdate> {
  const echange: Echange = { date: aujourdhuiParis().iso, lignes: ajout.lignes, dit: "(il ajoute ça à sa fiche)" };
  await attendreTache(story.id, await planifier(story.id, "memoire_maj", echange));
  const fiche = await ficheDe(story);
  return { fiche, added: fiche.facts.filter((f) => !avant.has(f.text)), confirmed: [] };
}
