import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { inserer, messagesDeLExport, messagesDesCaptures, numeroter, remplacer, type Ajout } from "@prompts/lib/ajouts";
import { cleDuMessage, type Heure, type Lu } from "@prompts/lib/reconnaitre";
import type { Message } from "@prompts/lib/conv";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import type { ExportLu } from "@prompts/lib/export";
import { lireLigne } from "@prompts/lib/ligne";
import type { Echange } from "@prompts/lib/memoire";
import { Sortie01 } from "@prompts/lib/schemas";
import type { Fiche, FicheUpdate } from "@/types";
import type { CodeErreur } from "@/types/erreurs-api";
import { empreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { ficheDe } from "./donnees";
import { ErreurPublique } from "./erreurs";
import { aPrendre } from "./taches";
import { db, schema, uneLigne } from "./db";
import { contexteDe, fuseauDe, histoireDe, metaDe, type Ligne, type Transaction } from "./histoires";
import { majQuiAttend, retenir, sansAttendre } from "./memoire-groupee";
import { relancerApres } from "./pipeline";
import type { Contexte, DonneesMemoire } from "./stockage/types";
import { exigerSortie } from "./ia/appel-verifie";
import { appeler } from "./ia/claude";
import { aujourdhuiDans, heureNaiveDans } from "./temps";

/*
 * Ce qu’il envoie après l’import, dans le chat ou pour sa fiche : un nouvel export de leur conv, ou des captures
 * (leur conv, ou son profil). On en garde ce qui est nouveau, numéroté à la suite de la conv.
 */

/** Rien d’utilisable : un fichier illisible, une autre conv, des captures sans rien à lire, ou rien de neuf. */
export class ErreurAjout extends ErreurPublique<Extract<CodeErreur, "fichier" | "autre_conv" | "capture" | "rien_de_neuf">> {}

const MINUTE = 60_000;
const JOUR = 86_400_000;

/** Au-delà, les plus anciens des nouveaux messages ne sont pas gardés (un export des mois après l’import) : l’écran et le modèle le disent (Ajout.ignores). */
const MESSAGES_MAX = 400;
/** Les derniers messages lus que le contexte garde toujours (Contexte.lus) : de quoi retrouver ce qu’une capture ou un export reprend. */
export const LUS_MAX = 200;
/** Et au plus, avec ceux lus depuis le jour du dernier export (des captures, que le prochain export retrouve ; au-delà, il relit les plus anciennes). */
const LUS_DEPUIS_L_EXPORT_MAX = 1_000;

/**
 * Un ajout lu, prêt à garder : un export dit aussi son dernier message (`curseur`) et les messages lus qu’il reprend
 * (`repris`, à remplacer) ; des captures, le message lu après lequel leurs nouveaux messages prennent place (`ancre`), et
 * si ce qu’il remontre était déjà lu (`revu`).
 */
export type AjoutLu = Ajout & { curseur?: number; repris?: Lu[]; ancre?: Lu | null; revu?: true };

/**
 * La clé d’un message (cleDuMessage), rendue méconnaissable : une empreinte chiffrée, courte, propre à cet usage (`lus:v1`).
 * Le contexte de la conv la garde après l’effacement de sa conv brute : jamais un mot de leurs messages.
 */
export const cleSecrete = (m: Message) => empreinte(`lus:v1|${cleDuMessage(m)}`).slice(0, 12);

/* Ce que vaut une heure, en une lettre (Contexte.lus) */
const LETTRES: Record<Heure, string> = { exacte: "e", repere: "r", jour: "j", auPlusTard: "a" };
const HEURES = Object.fromEntries(Object.entries(LETTRES).map(([h, l]) => [l, h as Heure]));

/**
 * Ce qui est lu, tel que le contexte le garde (Contexte.lus), court : pour chacun, sa clé (12 caractères), ce que vaut
 * son heure (une lettre), puis l’heure à la minute (en base 36), séparés par des espaces. Le contexte se relit à chaque
 * page : 200 messages tiennent en 4 Ko.
 */
export const ecrireLus = (lus: readonly Lu[]) => lus.map((e) => `${e.cle}${LETTRES[e.heure]}${Math.floor(e.t / MINUTE).toString(36)}`).join(" ");

/** Ce qui est lu, relu du contexte (ecrireLus) ; une forme inattendue : rien, comme une conv lue avant le 2 novembre 2026. */
export function lireLus(s: string | undefined): Lu[] | undefined {
  if (s === undefined) return undefined;
  const lus = s
    .split(" ")
    .filter(Boolean)
    .map((x) => ({ cle: x.slice(0, 12), heure: HEURES[x[12] ?? ""], t: parseInt(x.slice(13), 36) * MINUTE }));
  return lus.every((e): e is Lu => e.cle.length === 12 && !!e.heure && Number.isFinite(e.t)) ? lus : undefined;
}

/**
 * Le curseur d’export d’une conv : son `dernier` (avant qu’on le garde à la seconde près, la fin de la journée du dernier
 * message, que le coffre remplit). Une conv lue avant le 2 novembre 2026 (sans `lus`) a pu le voir avancé par des
 * captures d’un jour suivant (l’ancien code, depuis le 7 octobre) : sauf s’il a ses secondes (une capture ne donne que la
 * minute), l’export d’après repart au plus tard de l’heure de son import (son export était fait avant), quitte à relire
 * un export Android déjà ajouté (dit s’il dépasse la borne), plutôt que de perdre ce que les captures ne montraient pas.
 */
const curseurDe = (c: Contexte, story: Pick<Ligne, "createdAt" | "meta">) =>
  lireLus(c.lus) || c.dernier % MINUTE || new Date(c.dernier).toISOString().slice(0, 10) <= c.fin
    ? c.dernier
    : Math.min(c.dernier, heureNaiveDans(fuseauDe(metaDe(story)), story.createdAt));

/**
 * Ce que la conv a déjà lu : le curseur d’un export, le dernier instant lu tout compris (des captures aussi ; jamais
 * après la fin d’`aujourdhui`, son jour : un repère mal lu dans le futur ne fige rien), et ses derniers messages lus,
 * leur empreinte et leur heure (Contexte.lus).
 */
const dejaLu = (story: Ligne, aujourdhui: { t: number }) => {
  const c = contexteDe(story);
  if (!c) throw new ErreurAjout("rien_de_neuf");
  return { apres: curseurDe(c, story), vuJusqua: Math.min(c.vuJusqua ?? c.dernier, aujourdhui.t + JOUR - 1), lus: lireLus(c.lus) ?? [], cle: cleSecrete };
};

/**
 * Ce qui est lu, borné, dans son ordre : les LUS_MAX derniers, et ceux du jour du curseur ou après (des captures, que
 * l’export suivant retrouve), au plus LUS_DEPUIS_L_EXPORT_MAX.
 */
function elaguer(lus: Lu[], curseur: number): Lu[] {
  const jour = Math.floor(curseur / JOUR) * JOUR;
  return lus.filter((e, k) => k >= lus.length - LUS_MAX || e.t >= jour).slice(-LUS_DEPUIS_L_EXPORT_MAX);
}

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

/**
 * Un ajout gardé (sa réponse écrite, la mémoire prévenue : retenir) : le contexte le note. Un export fait avancer le
 * curseur jusqu’à son dernier message, le prochain repart de là ; des captures, partielles et à l’heure près, jamais
 * (H1 : l’export suivant aurait perdu tout ce qu’elles ne montraient pas). Les messages lus de l’un comme de l’autre
 * rejoignent ce qui est lu (Contexte.lus, ceux qu’un export reprend remplacés par les siens, à la minute) et repoussent
 * `vuJusqua` : la même capture renvoyée ne se relit pas, l’export suivant ne relit pas ce que des captures ont apporté.
 * Appelé après la réponse, jamais avant (H2 : après une panne, le même envoi aurait été refusé « je l’ai déjà »), sous le
 * verrou de la conv : celui de retenir (`tx`), sinon le sien.
 */
export async function noterLAjout(storyId: string, ajout: Pick<AjoutLu, "lus" | "dernier" | "curseur" | "repris" | "ancre">, tx?: Transaction): Promise<void> {
  if (!tx) return db().transaction((t) => noterLAjout(storyId, ajout, t));
  const story = uneLigne(await tx.select().from(schema.stories).where(eq(schema.stories.id, storyId)).for("update"), "stories:curseur");
  const c = contexteDe(story);
  if (!c) return;
  /* Le premier ajout d’une conv d’avant le 2 novembre écrit son curseur corrigé (curseurDe) */
  const dernier = Math.max(curseurDe(c, story), ajout.curseur ?? -Infinity);
  const deja = lireLus(c.lus) ?? [];
  const lus = elaguer(ajout.curseur !== undefined ? remplacer(deja, ajout.lus, ajout.repris ?? []) : inserer(deja, ajout.lus, ajout.ancre), dernier);
  const vuJusqua = Math.max(c.vuJusqua ?? c.dernier, ajout.dernier ?? -Infinity, ajout.curseur ?? -Infinity);
  const suite = { ...c, dernier, vuJusqua, lus: ecrireLus(lus) };
  await tx
    .update(schema.stories)
    .set({ context: coffre.ecrire("stories.context", suite), updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));
}

/**
 * Numérote ce qui est lu. Un export de plus de MESSAGES_MAX nouveaux messages n’en garde que les plus récents, et le dit
 * (`ignores`). `curseur` et `repris` (un export) : ce que noterLAjout pose une fois la réponse gardée.
 */
async function garder(
  story: Ligne,
  memoire: DonneesMemoire,
  {
    nouveaux,
    rappel = [],
    profil = [],
    aNoter,
    aujourdhui,
    curseur,
    repris,
  }: { nouveaux: Message[]; rappel?: Message[]; profil?: string[]; aNoter: Lu[]; aujourdhui: string; curseur?: number; repris?: Lu[] },
): Promise<AjoutLu> {
  const recents = nouveaux.slice(-MESSAGES_MAX);
  const remontre = rappel.slice(-MESSAGES_MAX);
  if (!recents.length && !remontre.length && !profil.length) throw new ErreurAjout("rien_de_neuf");
  const h = histoireDe(metaDe(story));
  const debut = await reserver(story.id, remontre.length + recents.length + profil.length, memoire.suivant);
  const ajout = numeroter(recents, profil, h, { debut, aujourdhui, anciens: remontre, ignores: nouveaux.length - recents.length, aNoter });
  return { ...ajout, ...(curseur !== undefined ? { curseur, repris: repris ?? [] } : {}) };
}

/**
 * Un nouvel export de leur conv (déjà lu par lib/export) : les messages arrivés depuis le dernier lu. Sans rien de
 * nouveau, il est quand même noté (son curseur, ses messages à la minute à la place de ceux des captures) : il n’y a ni
 * réponse ni mémoire à attendre.
 */
export async function depuisExport(story: Ligne, memoire: DonneesMemoire, lu: ExportLu): Promise<AjoutLu> {
  const h = histoireDe(metaDe(story));
  const j = aujourdhuiDans(fuseauDe(metaDe(story)));
  const { apres, lus, cle } = dejaLu(story, j);
  const r = messagesDeLExport(lu.texte, h, apres, { lus, cle });
  if (typeof r === "string") throw new ErreurAjout(r);
  if (!r.nouveaux.length) {
    await noterLAjout(story.id, { lus: r.aNoter, dernier: null, curseur: r.fin, repris: r.repris });
    throw new ErreurAjout("rien_de_neuf");
  }
  /* Ce qu’un export trop long ne laisse pas lire n’est pas noté comme lu : une capture qui le remontre le fera lire */
  const ignores = new Set(r.nouveaux.slice(0, -MESSAGES_MAX));
  const aNoter = r.aNoter.filter((_, k) => !ignores.has(r.fenetre[k]!));
  return garder(story, memoire, { nouveaux: r.nouveaux, aNoter, aujourdhui: j.iso, curseur: r.fin, repris: r.repris });
}

/**
 * Des captures, lues par le prompt 01 : les nouveaux messages de leur conv, un échange plus ancien qu’il remontre (H6),
 * et ce qu’on lit sur son profil. Sans rien de nouveau ni de plus ancien, un échange déjà lu ne passe qu’avec une
 * question (`question`, le chat) ; sinon « rien de neuf ». « Aujourd’hui » est le jour de son téléphone (`fuseau`, fuseauSur :
 * à Fort-de-France le soir, Paris est déjà le lendemain) : une date lue après lui ne repousse pas `vuJusqua`. Rien de
 * lisible : « capture » ; un refus du modèle : « refus » (exigerSortie), que le chat et la fiche savent dire.
 */
export async function depuisCaptures(
  story: Ligne,
  memoire: DonneesMemoire,
  images: Image[],
  { fuseau, question = false }: { fuseau?: string; question?: boolean } = {},
): Promise<AjoutLu> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  /* Le jour de son téléphone : celui de l’envoi, sinon celui de la conv */
  const j = aujourdhuiDans(fuseau ?? fuseauDe(meta));
  const a = await appeler(requeteCaptures({ prenom: h.utilisateur.prenom, autre: h.autre.prenom, appli: meta.appli, aujourdhui: j.t, images }), Sortie01, {
    storyId: story.id,
    etiquette: "captures",
  });
  const lues = exigerSortie(a, () => new ErreurAjout("capture"));
  const profil = lues.profil.map((p) => p.trim()).filter(Boolean);
  const lus = lues.blocs.some((b) => b.messages.length);
  if (!lus && !profil.length) throw new ErreurAjout("capture");
  const vu = lus ? messagesDesCaptures(lues, h, { aujourdhui: j.iso, ...dejaLu(story, j) }) : { nouveaux: [], anciens: [], remontres: [], dejaLus: true, aNoter: [], ancre: null };
  const finDuJour = j.t + JOUR - 1;
  const recents = vu.aNoter.slice(-MESSAGES_MAX).map((e) => ({ ...e, t: Math.min(e.t, finDuJour) }));
  /* Un échange plus ancien qu’il remontre passe avant les nouveaux ; sans nouveau, toute la capture, s’il y a du plus ancien ou une question */
  const revu = !vu.nouveaux.length && vu.dejaLus && question && vu.remontres.length > 0;
  const rappel = vu.nouveaux.length ? vu.anciens : vu.anciens.length || question ? vu.remontres : [];
  const ajout = await garder(story, memoire, { nouveaux: vu.nouveaux, rappel, profil, aNoter: recents, aujourdhui: j.iso });
  return { ...ajout, dernier: ajout.dernier === null ? null : Math.min(ajout.dernier, finDuJour), ancre: vu.ancre, ...(revu ? { revu: true as const } : {}) };
}

/**
 * Ce que l’historique du chat affiche à la place des fichiers : « (ta capture : 2 nouveaux messages) », « (ton
 * export : les 400 derniers de tes 1 000 nouveaux messages) », « (3 captures : un échange plus ancien) », « (ta capture :
 * un échange déjà lu) ».
 */
export function resumeAjout(a: Ajout & Pick<AjoutLu, "revu">, source: "captures" | "export", n: number): string {
  const quoi = source === "export" ? "ton export" : n > 1 ? `${n} captures` : "ta capture";
  const nouveaux = (k: number) => `${k} nouveau${k > 1 ? "x" : ""} message${k > 1 ? "s" : ""}`;
  const messages = !a.messages
    ? ""
    : a.ignores
      ? `les ${a.messages} derniers de tes ${(a.messages + a.ignores).toLocaleString("fr-FR").replace(/\s/g, "\u00a0")} nouveaux messages`
      : nouveaux(a.messages);
  const detail = [a.rappel ? (a.revu ? "un échange déjà lu" : "un échange plus ancien") : "", messages, a.profil ? "son profil" : ""].filter(Boolean).join(", ");
  return `(${quoi}${detail ? `\u00a0: ${detail}` : ""})`;
}

/** Ce qu’on a lu sur son profil, tel quel : la fin des lignes « profil de … » de l’ajout. */
const profilLu = (a: Ajout) =>
  a.lignes.flatMap((l) => {
    const lue = lireLigne(l);
    return lue?.profil ? [lue.texte.replaceAll(" ⏎ ", " ")] : [];
  });

/**
 * Ce que la mise à jour de la mémoire reçoit d’un ajout (rendreNouveau) : ses lignes, sans un échange déjà lu qu’il
 * remontre (elle l’a déjà : le relire la ferait partir pour rien) ; un échange plus ancien, et ce qu’un export trop long
 * n’a pas laissé lire, dits comme tels.
 */
export function pourLaMemoireDe(a: AjoutLu): Pick<Echange, "lignes" | "rappel" | "ignores"> {
  const lignes = a.revu ? a.lignes.slice(a.rappel) : a.lignes;
  return { ...(lignes.length ? { lignes } : {}), ...(a.rappel && !a.revu ? { rappel: a.rappel } : {}), ...(a.ignores ? { ignores: a.ignores } : {}) };
}

/**
 * Pour sa fiche : on répond tout de suite avec ce qui a été lu (son profil, le nombre de nouveaux messages), et la
 * mémoire se met à jour après la réponse (20 à 60 s ; attendre la gardait jusqu’à 2 min devant le chargement), sans
 * attendre que le chat se calme : les échanges du chat qui attendaient partent avec (retenir). La fiche dit qu’une mise
 * à jour tourne (`updating`) : l’écran la relit jusqu’à ce qu’elle ait fini (GET /api/fiche).
 */
export async function ajouterALaFiche(story: Ligne, ajout: Ajout & { curseur?: number }): Promise<FicheUpdate & { confirmed: [] }> {
  const echange: Echange = { date: aujourdhuiDans(fuseauDe(metaDe(story))).iso, ...pourLaMemoireDe(ajout), dit: "(il ajoute ça à sa fiche)" };
  /* Retenu, sous le même verrou : le curseur et les messages reconnaissables suivent (noterLAjout) */
  const [, fiche] = await Promise.all([retenir(story.id, echange, { neuf: true, maintenant: true, ensuite: (tx) => noterLAjout(story.id, ajout, tx) }), ficheDe(story)]);
  relancerApres(story.id);
  /*
   * `confirmed` (toujours vide, le front ne le lit plus) reste dans la réponse le temps d’une mise en production : un
   * onglet ouvert avant elle garde l’ancien code, qui le lit sans vérifier (sa fiche planterait). À retirer au lot suivant.
   */
  return {
    fiche: { ...fiche, updating: true },
    added: [],
    confirmed: [],
    pending: { profile: profilLu(ajout), messages: ajout.messages, ...(ajout.ignores ? { ignored: ajout.ignores } : {}), ...(ajout.rappel ? { older: ajout.rappel } : {}) },
  };
}

/**
 * La mémoire s’écrit-elle : la première (après le rapport), ou une mise à jour (un ajout à sa fiche, des échanges du
 * chat), en attente, en cours, ou partie en lot (src/server/memoire-en-lot.ts) ? Pas une mise à jour qui attend que le
 * chat se calme : elle ne s’écrit pas encore.
 */
export async function majEnCours(storyId: string): Promise<boolean> {
  const [t] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.storyId, storyId),
        inArray(schema.tasks.kind, ["memoire", "memoire_maj"]),
        or(and(eq(schema.tasks.status, "attente"), aPrendre()), inArray(schema.tasks.status, ["en_cours", "lot"])),
      ),
    )
    .limit(1);
  return !!t;
}

/**
 * Sa fiche, et si la mémoire s’écrit (`updating`, majEnCours : la première, ou une mise à jour) : l’écran la relit
 * toutes les 3 s jusqu’à ce qu’elle ait fini. Une mise à jour qui attendait que le chat se calme part d’abord
 * (sansAttendre) : il regarde sa fiche, elle doit savoir ce qu’il vient de dire. Une mémoire restée en plan (l’instance
 * arrêtée, ou plus le temps de la commencer après le rapport ou la lecture des captures) repart après la réponse ; si
 * une autre la tient, executerChaine la laisse faire.
 * La même pour GET et PUT /api/fiche et pour la page rendue par le serveur (getFicheEtMaj) : une fiche rendue à
 * l’instant, que l’écran ne relit pas au montage (Q63), dit déjà qu’une mise à jour tourne. `page` : ce rendu-là. L’accueil
 * le précharge en entier (le lien de son avatar), et rien ne distingue ce préchargement d’une visite : la page ne lance
 * pas la mise à jour qui attend, elle dit seulement qu’elle vient (`updating`). L’écran se relit alors (GET /api/fiche),
 * et c’est cette relecture, fiche ouverte pour de bon, qui la lance.
 */
export async function ficheEtMaj(story: Ligne, { page = false }: { page?: boolean } = {}): Promise<Fiche> {
  if (!page) await sansAttendre(story.id);
  const [fiche, enCours, attend] = await Promise.all([ficheDe(story), majEnCours(story.id), page ? majQuiAttend(story.id) : false]);
  if (enCours) relancerApres(story.id);
  return enCours || attend ? { ...fiche, updating: true } : fiche;
}
