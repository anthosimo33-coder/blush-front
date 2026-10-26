import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Image } from "@prompts/lib/contextes";
import type { Captures } from "@prompts/lib/schemas";
import type { RaisonDAbandon } from "@/types/api";
import { empreinte } from "./chiffrement";
import { ecrire, lire } from "./coffre";
import { db, schema } from "./db";
import { tempsRestant } from "./echeance";
import { ErreurPublique } from "./erreurs";
import type { Avance } from "./ia/claude";
import { reprendreLeLot } from "./imports";
import { auMieux, journalErreur } from "./journal";
import { compteDe, compter, rendre } from "./limites";

/*
 * Les lots d’un enregistrement d’écran (POST /api/captures/lot), jamais payés deux fois :
 * - Un lot déjà lu ne se relit pas. Son empreinte (empreinteDuLot : ses images, son appli, le jour de Paris) garde sa
 *   lecture dix minutes (GARDE_MS) : en mémoire de l’instance (un nouvel essai du même lot la retrouve, ou rejoint la
 *   lecture encore en cours) et en base, chiffrée (lectures_des_lots : un nouvel essai arrivé sur une autre instance la
 *   retrouve, ou attend la fin de sa lecture là-bas, lectureAilleurs), sans rappeler le modèle ni recompter les
 *   plafonds. Un échec n’est jamais gardé. Seule la lecture (le texte) est gardée, jamais les images (le navigateur
 *   garde aussi les siennes, src/services/preparer-video.ts). Un lot repris par un autre envoi que le sien (un nouvel
 *   essai de l’enregistrement, sous une nouvelle clé) passe son coût sous lui (reprendreLeLot, src/server/imports.ts).
 * - Le premier lot d’un envoi part seul : les autres attendent que sa réponse commence (premierLot, attendreLePremier),
 *   quelques secondes au plus (ATTENTE_DU_PREMIER_MS). Le texte système du prompt 01 est alors en cache : il ne s’écrit
 *   qu’une fois par enregistrement, au lieu d’une fois par lot du premier tour. Le navigateur envoie tout en même temps,
 *   et marque le premier (`ordre`) ; l’attente se fait ici, par l’instance (en mémoire) ou par la base (rate_limits).
 * - Un envoi abandonné par le navigateur (POST /api/captures/lot/abandon) : pour de bon (« echec » : un lot a encore
 *   échoué après son nouvel essai), ses lectures s’arrêtent, celles de l’instance tout de suite (leur appel au modèle
 *   s’arrête chez le prestataire), celles des autres à leur prochain coup d’œil (VERIFICATION_MS, pendant leur flux), et
 *   aucun de ses lots ne part plus. La page fermée (« page » : un rechargement, l’onglet fermé) n’arrête que ses lots qui
 *   n’ont pas encore commencé chez le prestataire (ceux qui attendent le premier, ou la lecture d’une autre instance) :
 *   l’entrée d’un lot déjà parti est payée, il va au bout, et le nouvel essai de la page rechargée le retrouve. Une
 *   requête coupée seule (le réseau, Safari en arrière-plan) n’arrête pas sa lecture : le nouvel essai du navigateur la
 *   retrouve ici, au lieu de la payer deux fois.
 * Un envoi se désigne par l’empreinte de sa clé (envoiDe, src/server/imports.ts), la même que la mesure des imports.
 */

/** Un lot abandonné (l’envoi arrêté par le navigateur, abandonnerLEnvoi) : il n’est pas lu, ou plus. */
export class ErreurLot extends ErreurPublique<"abandon"> {}

/* ———— Un lot lu une seule fois ———— */

/**
 * L’empreinte d’un lot : ses images (leur type et leurs octets, dans l’ordre), son appli et le jour de Paris (AAAA-MM-JJ :
 * la lecture date « hier » et « lundi » d’après lui). Jamais son seul numéro dans l’envoi. Ce que lit le modèle pour ce
 * lot est alors le même : sa lecture peut resservir. Passée par la clé du serveur (empreinte) : gardée en base
 * (lectures_des_lots, ai_usage.lot), elle ne permet pas de reconnaître des images connues.
 */
export function empreinteDuLot(images: Image[], appli: string, jour: string): string {
  const h = createHash("sha256").update(`lot:${appli}:${jour}`);
  for (const i of images) h.update(`|${i.media}:`).update(i.base64);
  return empreinte(`lot:${h.digest("base64url")}`);
}

/**
 * Une lecture de lot, en cours ou faite : son envoi (pour l’abandon), de quoi l’arrêter, si son appel au modèle est
 * parti (`etat.parti` : la page fermée ne l’arrête plus) et jusqu’à quand on la garde.
 */
type Lecture = { lecture: Promise<Captures>; envoi: string | null; arret: AbortController; etat: { parti: boolean }; jusqua: number };
/* Les lectures de cette instance, par empreinte de lot. Une Map garde l’ordre d’arrivée : au-delà de LOTS_MAX, les plus anciennes partent */
const LOTS = new Map<string, Lecture>();
const GARDE_MS = 10 * 60e3;
/* Une lecture de lot pèse quelques dizaines de Ko : 300, c’est une vingtaine de longs enregistrements, une dizaine de Mo au plus */
const LOTS_MAX = 300;
/* Pendant le flux d’une lecture, son envoi abandonné se relit en base au plus toutes les 5 secondes (une requête, pas plus de six par lot) */
const VERIFICATION_MS = 5_000;

/**
 * Ce que reçoit la lecture d’un lot : de quoi s’arrêter (l’envoi abandonné), de quoi suivre son flux (le coup d’œil à
 * l’abandon), et `partir`, à appeler juste avant l’appel au modèle : la page fermée ne l’arrête plus.
 */
type Suivi = { signal: AbortSignal; surAvance?: (a: Avance) => void; partir: () => void };

/**
 * Le lot d’empreinte `lot`, lu une seule fois (`lire`) : une lecture faite depuis moins de GARDE_MS, ou en cours, ici ou
 * sur une autre instance, revient telle quelle. Posée avant toute attente : deux envois du même lot arrivés ensemble ne
 * lisent pas deux fois. Un échec ne reste pas (le nouvel essai relit) ; une lecture arrêtée parce que son envoi est
 * abandonné lève ErreurLot.
 */
export async function unSeulLot(lot: string, envoi: string | null, lire: (suivi: Suivi) => Promise<Captures>): Promise<Captures> {
  const maintenant = Date.now();
  for (const [k, l] of LOTS) if (l.jusqua < maintenant) LOTS.delete(k);
  const deja = LOTS.get(lot);
  if (deja) {
    if (deja.envoi === envoi) return deja.lecture;
    /*
     * La lecture d’un autre envoi (un nouvel essai de l’enregistrement, sous une autre clé) : son coût passe sous
     * celui-ci. Arrêtée parce que l’autre envoi est abandonné : le lot se lit pour celui-ci (son entrée est déjà retirée)
     */
    return deja.lecture.then(
      async (lu) => {
        await reprise(lot, envoi);
        return lu;
      },
      (e: unknown) => {
        if (e instanceof ErreurLot) return unSeulLot(lot, envoi, lire);
        throw e;
      },
    );
  }
  for (const k of LOTS.keys()) {
    if (LOTS.size < LOTS_MAX) break;
    LOTS.delete(k);
  }
  const arret = new AbortController();
  const etat = { parti: false };
  const lecture = lireUneFois(lot, envoi, arret, etat, lire).catch((e: unknown) => {
    if (LOTS.get(lot)?.lecture === lecture) LOTS.delete(lot);
    throw arret.signal.aborted ? new ErreurLot("abandon") : e;
  });
  LOTS.set(lot, { lecture, envoi, arret, etat, jusqua: maintenant + GARDE_MS });
  return lecture;
}

/** Un lot repris par un autre envoi que celui qui l’a payé : son coût passe sous lui (sans envoi, rien à mesurer). */
async function reprise(lot: string, envoi: string | null): Promise<void> {
  if (envoi) await reprendreLeLot(lot, envoi);
}

/**
 * La lecture d’un lot que l’instance n’a pas en mémoire : gardée en base (lue sur une autre instance), attendue (en cours
 * ailleurs), sinon faite ici (`lire`), puis gardée. La marque du lot en cours se retire à la fin, réussi ou non.
 */
async function lireUneFois(lot: string, envoi: string | null, arret: AbortController, etat: { parti: boolean }, lire: (suivi: Suivi) => Promise<Captures>): Promise<Captures> {
  const ailleurs = await lectureAilleurs(lot, arret.signal);
  if (ailleurs.lue) {
    if (ailleurs.lue.envoi !== envoi) await reprise(lot, envoi);
    return ailleurs.lue.lu;
  }
  try {
    if (arret.signal.aborted) throw new ErreurLot("abandon");
    const partir = () => {
      etat.parti = true;
    };
    const lu = await lire({ signal: arret.signal, partir, ...(envoi ? { surAvance: coupDOeil(envoi, arret) } : {}) });
    await auMieux(() => garderLaLecture(lot, envoi, lu), "lecture du lot non gardée");
    return lu;
  } finally {
    if (ailleurs.marque) await auMieux(() => rendre(cleEnCours(lot)), "marque du lot en cours non retirée");
  }
}

/** Pendant le flux d’une lecture : son envoi abandonné ailleurs (une autre instance) l’arrête, relu au plus toutes les VERIFICATION_MS. */
function coupDOeil(envoi: string, arret: AbortController): () => void {
  let vu = Date.now();
  return () => {
    if (arret.signal.aborted || Date.now() - vu < VERIFICATION_MS) return;
    vu = Date.now();
    void envoiAbandonne(envoi).then(
      (abandonne) => abandonne && arret.abort(),
      () => {},
    );
  };
}

/* ———— Un lot lu sur une autre instance ———— */

/*
 * Pendant sa lecture, un lot porte une marque en base (rate_limits, une seule à la fois) : un nouvel essai du même lot
 * arrivé sur une autre instance attend sa lecture au lieu de la payer une seconde fois. La marque tient le temps de la
 * route au plus (180 s, maxDuration) : une instance coupée net la laisse partir d’elle-même.
 */
const FENETRE_EN_COURS = { fenetreS: 180 };
const cleEnCours = (lot: string) => `lots:en-cours:${lot}`;
/* Au plus, ce qu’un lot attend sa lecture sur une autre instance : celle d’un lot de douze écrans (25 à 30 s d’habitude, 90 au pire) */
const ATTENTE_D_UNE_AUTRE_MS = 90_000;
/* Ce que l’attente laisse avant l’échéance de la route : de quoi lire le lot ici si l’autre instance échoue */
const TEMPS_POUR_LIRE_MS = 100_000;
/* Pendant cette attente, la base se relit toutes les secondes */
const SONDAGE_AILLEURS_MS = 1_000;

/** Une lecture gardée en base : le texte lu, et l’envoi qui l’a payée. */
type LectureGardee = { lu: Captures; envoi: string | null };
/** Ce que la base dit d’un lot : sa lecture déjà faite, ou à faire ici (`marque` : sa marque posée par nous, à retirer après). */
type Ailleurs = { lue: LectureGardee; marque: false } | { lue: null; marque: boolean };

/**
 * Le lot est-il lu, ou en train de l’être, sur une autre instance ? Sa lecture gardée revient ; en cours ailleurs, on
 * l’attend (tant que sa marque tient, au plus ATTENTE_D_UNE_AUTRE_MS, et jamais au point de ne plus pouvoir le lire ici) ;
 * sinon, on pose la marque et on le lit. La base qui ne répond pas : on le lit, sans marque. Ne lève jamais.
 */
async function lectureAilleurs(lot: string, signal: AbortSignal): Promise<Ailleurs> {
  const fin = Date.now() + Math.max(0, Math.min(ATTENTE_D_UNE_AUTRE_MS, tempsRestant() - TEMPS_POUR_LIRE_MS));
  for (;;) {
    const lue = await lectureGardee(lot);
    if (lue) return { lue, marque: false };
    const n = await compter(cleEnCours(lot), FENETRE_EN_COURS).catch(() => null);
    if (n === null || n === 1) return { lue: null, marque: n === 1 };
    /* Lu ailleurs en ce moment : on rend notre passage, puis on attend sa lecture tant que sa marque tient */
    await auMieux(() => rendre(cleEnCours(lot)), "marque du lot en cours non retirée");
    do {
      if (signal.aborted || Date.now() >= fin) return { lue: null, marque: false };
      await attente(Math.min(SONDAGE_AILLEURS_MS, fin - Date.now()), signal);
    } while ((await compteDe(cleEnCours(lot), FENETRE_EN_COURS).catch(() => 0)) > 0 && !(await lectureGardee(lot)));
  }
}

/** La lecture de ce lot gardée en base, encore fraîche, ou null (une ligne illisible aussi : le lot se relit). */
async function lectureGardee(lot: string): Promise<LectureGardee | null> {
  const t = schema.lecturesDesLots;
  try {
    const [l] = await db()
      .select({ lu: t.lu, envoi: t.envoi })
      .from(t)
      .where(and(eq(t.lot, lot), gt(t.expireLe, new Date())));
    return l ? { lu: lire("lectures_des_lots.lu", l.lu), envoi: l.envoi } : null;
  } catch (e) {
    journalErreur("lecture du lot gardée illisible", e);
    return null;
  }
}

/** Garde la lecture d’un lot dix minutes en base, chiffrée, avec l’envoi qui l’a payée. */
async function garderLaLecture(lot: string, envoi: string | null, lu: Captures): Promise<void> {
  const t = schema.lecturesDesLots;
  const ligne = { envoi, lu: ecrire("lectures_des_lots.lu", lu), expireLe: new Date(Date.now() + GARDE_MS) };
  await db()
    .insert(t)
    .values({ lot, ...ligne })
    .onConflictDoUpdate({ target: t.lot, set: ligne });
}

/**
 * Efface les lectures de lots dont les dix minutes sont passées (la purge des 5 minutes, GET /api/cron/relances, et celle
 * de la nuit) : rend combien. Leur texte ne reste pas plus longtemps en base, à 5 minutes près.
 */
export async function purgerLesLecturesDesLots(maintenant = new Date()): Promise<number> {
  const t = schema.lecturesDesLots;
  return (await db().delete(t).where(lt(t.expireLe, maintenant)).returning({ lot: t.lot })).length;
}

/** Une vraie attente (pas `pause`, qui ne dort pas sous vitest), écourtée quand `signal` s’arrête. Elle retire son écoute en partant. */
function attente(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok) => {
    const fini = () => {
      clearTimeout(minuterie);
      signal.removeEventListener("abort", fini);
      ok();
    };
    const minuterie = setTimeout(fini, Math.max(0, ms));
    signal.addEventListener("abort", fini, { once: true });
  });
}

/* ———— Le premier lot d’abord ———— */

/**
 * Au plus, ce qu’un lot attend le début du premier (attendreLePremier) : le temps que le prestataire lise une demande de
 * douze écrans et commence à répondre (3 à 6 secondes : l’attente acceptée avant le paywall, le 26 octobre). Au-delà (le
 * premier lent à arriver, ou jamais arrivé), le lot part quand même : il écrira le texte système en cache lui aussi,
 * comme avant.
 */
const ATTENTE_DU_PREMIER_MS = 6_000;
/* Le lot qui attend relit la base toutes les 400 ms (le premier peut tourner sur une autre instance) */
const SONDAGE_MS = 400;
/* Les marques d’un envoi en base (son premier lot commencé, son abandon, sa page fermée) : le temps de lire un long enregistrement, largement */
const FENETRE_ENVOI = { fenetreS: 15 * 60 };
const cleDuDebut = (envoi: string) => `lots:debut:${envoi}`;
const cleDeLAbandon = (envoi: string) => `lots:abandon:${envoi}`;
const cleDeLaFermeture = (envoi: string) => `lots:page-fermee:${envoi}`;

/** Le début du premier lot d’un envoi, sur cette instance : la promesse qu’attendent les autres, et ce qui la tient. */
type Debut = { commence: Promise<void>; dire: () => void; jusqua: number };
const DEBUTS = new Map<string, Debut>();

function debutDe(envoi: string): Debut {
  const maintenant = Date.now();
  for (const [k, d] of DEBUTS) if (d.jusqua < maintenant) DEBUTS.delete(k);
  let d = DEBUTS.get(envoi);
  if (!d) {
    let dire = () => {};
    const commence = new Promise<void>((ok) => (dire = ok));
    d = { commence, dire, jusqua: maintenant + FENETRE_ENVOI.fenetreS * 1000 };
    DEBUTS.set(envoi, d);
  }
  return d;
}

/**
 * Le premier lot d’un envoi : ce qu’il appelle quand sa réponse commence (auDebut, src/server/ia/claude.ts), ou quand il
 * a fini (lu, retrouvé, refusé ou en échec) : les lots qui l’attendent partent, sur cette instance et sur les autres (une
 * marque en base, une fois). Sans effet la deuxième fois.
 */
export function premierLot(envoi: string): () => void {
  const d = debutDe(envoi);
  let dit = false;
  return () => {
    if (dit) return;
    dit = true;
    d.dire();
    void auMieux(compter(cleDuDebut(envoi), FENETRE_ENVOI), "début du premier lot non noté");
  };
}

/**
 * Un lot de la suite d’un envoi : attend que la réponse du premier commence (sur cette instance, ou ailleurs : la marque
 * en base), au plus `max` (ATTENTE_DU_PREMIER_MS). S’arrête aussi quand l’envoi est abandonné (`signal`). Ne lève jamais :
 * au pire, le lot part sans attendre plus.
 */
export async function attendreLePremier(envoi: string, signal: AbortSignal, max = ATTENTE_DU_PREMIER_MS): Promise<void> {
  const { commence } = debutDe(envoi);
  let fini = false;
  void commence.then(() => {
    fini = true;
  });
  const fin = Date.now() + max;
  while (!fini && !signal.aborted && Date.now() < fin) {
    /* La base qui ne répond pas : on n’attend pas plus (le lot part, comme sans premier) */
    if ((await compteDe(cleDuDebut(envoi), FENETRE_ENVOI).catch(() => 1)) > 0) return;
    /* Le premier lot tourne pendant ce temps */
    await Promise.race([commence, attente(Math.min(SONDAGE_MS, fin - Date.now()), signal)]);
  }
}

/* ———— L’envoi abandonné ———— */

/**
 * Le navigateur abandonne l’envoi. Pour de bon (« echec », un de ses lots a échoué) : ses lectures en cours sur cette
 * instance s’arrêtent (leur appel au modèle aussi), et la marque en base arrête les autres instances (envoiAbandonne).
 * Sa page fermée (« page ») : seules celles qui n’ont pas encore appelé le modèle s’arrêtent, les autres vont au bout
 * (leur entrée est déjà payée : le nouvel essai les retrouve). Dans les deux cas, ses lots qui attendent le premier
 * n’attendent plus, et aucun ne part plus (envoiArrete). Les lectures déjà faites restent gardées.
 */
export async function abandonnerLEnvoi(envoi: string, raison: RaisonDAbandon): Promise<void> {
  for (const l of LOTS.values()) if (l.envoi === envoi && (raison === "echec" || !l.etat.parti)) l.arret.abort();
  await compter(raison === "echec" ? cleDeLAbandon(envoi) : cleDeLaFermeture(envoi), FENETRE_ENVOI);
  DEBUTS.get(envoi)?.dire();
}

/** L’envoi a-t-il été abandonné pour de bon par le navigateur (« echec », sur n’importe quelle instance) ? Ses lectures en cours s’arrêtent. */
async function envoiAbandonne(envoi: string): Promise<boolean> {
  return (await compteDe(cleDeLAbandon(envoi), FENETRE_ENVOI)) > 0;
}

/** Un lot de cet envoi peut-il encore appeler le modèle ? Non s’il est abandonné, pour de bon ou sa page fermée. */
export async function envoiArrete(envoi: string): Promise<boolean> {
  const [abandon, fermee] = await Promise.all([compteDe(cleDeLAbandon(envoi), FENETRE_ENVOI), compteDe(cleDeLaFermeture(envoi), FENETRE_ENVOI)]);
  return abandon + fermee > 0;
}

/** Pour les tests : oublie ce que l’instance garde (ses lectures, les débuts attendus), comme une autre instance. */
export function oublierLesLots(): void {
  LOTS.clear();
  DEBUTS.clear();
}
