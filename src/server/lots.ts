import "server-only";
import { createHash } from "node:crypto";
import type { Image } from "@prompts/lib/contextes";
import type { Captures } from "@prompts/lib/schemas";
import { ErreurPublique } from "./erreurs";
import type { Avance } from "./ia/claude";
import { auMieux } from "./journal";
import { compteDe, compter } from "./limites";

/*
 * Les lots d’un enregistrement d’écran (POST /api/captures/lot), jamais payés deux fois :
 * - Un lot déjà lu ne se relit pas. Son empreinte (empreinteDuLot : ses images, son appli, le jour de Paris) garde sa
 *   lecture dix minutes en mémoire de l’instance : un nouvel essai du même lot (le réseau a coupé, la réponse s’est
 *   perdue) la retrouve, ou rejoint la lecture encore en cours, sans rappeler le modèle ni recompter les plafonds. Un
 *   échec n’est jamais gardé. Seule la lecture (le texte) est gardée, jamais les images, et jamais en base : sur une autre
 *   instance, le lot se relit (le navigateur garde aussi les siennes, src/services/preparer-video.ts).
 * - Le premier lot d’un envoi part seul : les autres attendent que sa réponse commence (premierLot, attendreLePremier),
 *   quelques secondes au plus (ATTENTE_DU_PREMIER_MS). Le texte système du prompt 01 est alors en cache : il ne s’écrit
 *   qu’une fois par enregistrement, au lieu d’une fois par lot du premier tour. Le navigateur envoie tout en même temps,
 *   et marque le premier (`ordre`) ; l’attente se fait ici, par l’instance (en mémoire) ou par la base (rate_limits).
 * - Un envoi abandonné par le navigateur (un autre lot a échoué pour de bon, ou la page est fermée pendant la lecture :
 *   POST /api/captures/lot/abandon) arrête ses lectures : celles de l’instance tout de suite (leur appel au modèle
 *   s’arrête chez le prestataire), celles des autres instances à leur prochain coup d’œil (VERIFICATION_MS, pendant leur
 *   flux), et aucun de ses lots ne part plus. Une requête coupée seule (le réseau, Safari en arrière-plan) n’arrête pas
 *   sa lecture : le nouvel essai du navigateur la retrouve ici, au lieu de la payer deux fois.
 * Un envoi se désigne par l’empreinte de sa clé (envoiDe, src/server/imports.ts), la même que la mesure des imports.
 */

/** Un lot abandonné (l’envoi arrêté par le navigateur, abandonnerLEnvoi) : il n’est pas lu, ou plus. */
export class ErreurLot extends ErreurPublique<"abandon"> {}

/* ———— Un lot lu une seule fois ———— */

/**
 * L’empreinte d’un lot : ses images (leur type et leurs octets, dans l’ordre), son appli et le jour de Paris (AAAA-MM-JJ :
 * la lecture date « hier » et « lundi » d’après lui). Jamais son seul numéro dans l’envoi. Ce que lit le modèle pour ce
 * lot est alors le même : sa lecture peut resservir.
 */
export function empreinteDuLot(images: Image[], appli: string, jour: string): string {
  const h = createHash("sha256").update(`lot:${appli}:${jour}`);
  for (const i of images) h.update(`|${i.media}:`).update(i.base64);
  return h.digest("base64url");
}

/** Une lecture de lot, en cours ou faite : son envoi (pour l’abandon), de quoi l’arrêter, et jusqu’à quand on la garde. */
type Lecture = { lecture: Promise<Captures>; envoi: string | null; arret: AbortController; jusqua: number };
/* Les lectures de cette instance, par empreinte de lot. Une Map garde l’ordre d’arrivée : au-delà de LOTS_MAX, les plus anciennes partent */
const LOTS = new Map<string, Lecture>();
const GARDE_MS = 10 * 60e3;
/* Une lecture de lot pèse quelques dizaines de Ko : 300, c’est une vingtaine de longs enregistrements, une dizaine de Mo au plus */
const LOTS_MAX = 300;
/* Pendant le flux d’une lecture, son envoi abandonné se relit en base au plus toutes les 5 secondes (une requête, pas plus de six par lot) */
const VERIFICATION_MS = 5_000;

/** Ce que reçoit la lecture d’un lot : de quoi s’arrêter (l’envoi abandonné), et de quoi suivre son flux (le coup d’œil à l’abandon). */
type Suivi = { signal: AbortSignal; surAvance?: (a: Avance) => void };

/**
 * Le lot d’empreinte `empreinte`, lu une seule fois (`lire`) : une lecture faite depuis moins de GARDE_MS, ou en cours,
 * revient telle quelle. Posée avant toute attente : deux envois du même lot arrivés ensemble ne lisent pas deux fois.
 * Un échec ne reste pas (le nouvel essai relit) ; une lecture arrêtée parce que son envoi est abandonné lève ErreurLot.
 */
export async function unSeulLot(empreinte: string, envoi: string | null, lire: (suivi: Suivi) => Promise<Captures>): Promise<Captures> {
  const maintenant = Date.now();
  for (const [k, l] of LOTS) if (l.jusqua < maintenant) LOTS.delete(k);
  const deja = LOTS.get(empreinte);
  if (deja) return deja.lecture;
  for (const k of LOTS.keys()) {
    if (LOTS.size < LOTS_MAX) break;
    LOTS.delete(k);
  }
  const arret = new AbortController();
  const lecture = lire({ signal: arret.signal, ...(envoi ? { surAvance: coupDOeil(envoi, arret) } : {}) }).catch((e: unknown) => {
    if (LOTS.get(empreinte)?.lecture === lecture) LOTS.delete(empreinte);
    throw arret.signal.aborted ? new ErreurLot("abandon") : e;
  });
  LOTS.set(empreinte, { lecture, envoi, arret, jusqua: maintenant + GARDE_MS });
  return lecture;
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

/* ———— Le premier lot d’abord ———— */

/**
 * Au plus, ce qu’un lot attend le début du premier (attendreLePremier) : le temps que le prestataire lise une demande de
 * douze écrans et commence à répondre (3 à 6 secondes). Au-delà (le premier lent à arriver, ou jamais arrivé), le lot part
 * quand même : il écrira le texte système en cache lui aussi, comme avant.
 */
const ATTENTE_DU_PREMIER_MS = 8_000;
/* Le lot qui attend relit la base toutes les 400 ms (le premier peut tourner sur une autre instance) */
const SONDAGE_MS = 400;
/* Les marques d’un envoi en base (son premier lot commencé, son abandon) : le temps de lire un long enregistrement, largement */
const FENETRE_ENVOI = { fenetreS: 15 * 60 };
const cleDuDebut = (envoi: string) => `lots:debut:${envoi}`;
const cleDeLAbandon = (envoi: string) => `lots:abandon:${envoi}`;

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
  const arrete = new Promise<void>((ok) => signal.addEventListener("abort", () => ok(), { once: true }));
  while (!fini && !signal.aborted && Date.now() < fin) {
    /* La base qui ne répond pas : on n’attend pas plus (le lot part, comme sans premier) */
    if ((await compteDe(cleDuDebut(envoi), FENETRE_ENVOI).catch(() => 1)) > 0) return;
    /* Une vraie attente (pas `pause`, qui ne dort pas sous vitest) : le premier lot tourne pendant ce temps */
    await Promise.race([commence, arrete, new Promise((ok) => setTimeout(ok, Math.min(SONDAGE_MS, Math.max(0, fin - Date.now()))))]);
  }
}

/* ———— L’envoi abandonné ———— */

/**
 * Le navigateur abandonne l’envoi (un de ses lots a échoué pour de bon) : ses lectures en cours sur cette instance
 * s’arrêtent (leur appel au modèle aussi), ses lots qui attendent le premier n’attendent plus, et la marque en base
 * arrête les autres instances (envoiAbandonne). Les lectures déjà faites restent gardées : un nouvel essai de
 * l’enregistrement les retrouve.
 */
export async function abandonnerLEnvoi(envoi: string): Promise<void> {
  for (const l of LOTS.values()) if (l.envoi === envoi) l.arret.abort();
  await compter(cleDeLAbandon(envoi), FENETRE_ENVOI);
  DEBUTS.get(envoi)?.dire();
}

/** L’envoi a-t-il été abandonné par le navigateur (abandonnerLEnvoi, sur n’importe quelle instance) ? */
export async function envoiAbandonne(envoi: string): Promise<boolean> {
  return (await compteDe(cleDeLAbandon(envoi), FENETRE_ENVOI)) > 0;
}
