import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { versTexteCaptures } from "@prompts/lib/captures";
import type { Image } from "@prompts/lib/contextes";
import { LECTEURS_DE_LOTS } from "@/lib/limites";
import type { IssueDeLaSuite } from "@/types";
import { PAYEUR_DE_LA_SUITE } from "./budget";
import { lireLot } from "./captures";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { tempsRestant } from "./echeance";
import { DUREE_D_UN_LOT_MS } from "./ecrans-gardes";
import { ErreurTache, estBudget, estRefus } from "./erreurs";
import { completerLaConv } from "./histoires";
import { ErreurImport } from "./import";
import { noterLaSuite } from "./imports";
import { journal } from "./journal";
import { pause } from "./temps";
import { fusionnerLots } from "./video";

/*
 * La suite d’une longue vidéo lue en partie avant l’achat (src/server/lecture-partielle.ts), lue après le paiement, juste
 * avant le verdict (src/server/analyse.ts) : ses lots gardés (src/server/ecrans-gardes.ts) lus par le modèle, chaque
 * lecture écrite tout de suite (un nouvel essai ne relit que ceux qui manquent), puis toutes les lectures rassemblées,
 * dans l’ordre de la vidéo, remplacent la conv, comme si elle avait été lue d’un coup, et les écrans s’effacent. Le
 * rapport, la mémoire et le chat lisent alors toute la conv. La mesure (src/server/imports.ts) note ce qu’est devenue
 * chaque suite.
 */

/** Les essais d’un lot de la suite avant que l’étape échoue (et reparte, sur les lots qui manquent). */
const ESSAIS_PAR_LOT = 2;
/** La pause entre ces deux essais (une surcharge, une coupure : elle a souvent passé), comme la chaîne entre deux essais d’une étape. */
const PAUSE_ENTRE_DEUX_ESSAIS_MS = 3000;
/** Au plus, ce que la suite attend le début de son premier lot avant de lancer les autres (comme ATTENTE_DU_PREMIER_MS, src/server/lots.ts). */
const ATTENTE_DU_PREMIER_MS = 6_000;

/* ———— La lecture, avant le verdict ———— */

/** Un lot de la suite, sans ses images (elles se lisent une à une, au moment de lire le lot). */
type LotGarde = { rang: number; medias: string[]; tailles: number[]; lu: Buffer | null; saute: boolean };

/**
 * Avant le verdict d’une conv payée (src/server/analyse.ts) : sa suite lue, puis la conv complétée. Les lots qui n’ont pas
 * encore de lecture se lisent, le premier seul d’abord (le texte système du prompt 01 s’écrit alors une fois en cache),
 * puis les autres, LECTEURS_DE_LOTS à la fois, chacun avec la requête de l’import (le jour de l’import, l’appli, rien de ce qu’on a appris
 * depuis) : le modèle lit chaque écran comme il l’aurait lu à l’import. Chaque lecture s’écrit dès qu’elle arrive : un
 * nouvel essai de l’étape ne paie jamais deux fois un lot. Un lot refusé ou illisible est sauté (un trou dans la conv,
 * « incomplete »). Une panne, deux fois de suite (après une pause) : l’étape échoue avec l’erreur du prestataire telle
 * quelle (son code, « api:529… », est celui d’un échec passager, que le passage des 5 minutes reprend : ECHEC_PASSAGER,
 * src/server/pipeline.ts), et repart sur ceux qui manquent ; le budget du jour atteint l’arrête comme tout appel (parmi
 * plusieurs lots en échec, c’est lui qui l’emporte : l’étape attend minuit au lieu d’user un essai). La suite se paie
 * sur sa part du budget du jour (PAYEUR_DE_LA_SUITE, src/server/budget.ts), pas sur celle du compte de l’acheteur.
 * Puis les lectures, des lots gardés et des lots déjà lus, se rassemblent dans l’ordre de la vidéo (fusionnerLots) : la
 * même conv, à l’octet, qu’une vidéo lue d’un coup. Le nom de l’autre reste celui de l’import (le paywall l’a montré,
 * « Qui es-tu ? » s’en est servi). Les écrans et la suite s’effacent dans la même transaction. `surAvance` : les lots
 * lus, sur combien. Rend ce qu’est devenue la suite, ou null : la conv n’en a pas.
 */
export async function lireLaSuite(storyId: string, surAvance?: (faits: number, total: number) => void): Promise<IssueDeLaSuite | null> {
  const [suite] = await db().select().from(schema.suitesVideo).where(eq(schema.suitesVideo.storyId, storyId));
  if (!suite) return suitePerdue(storyId);
  const lots: LotGarde[] = await db()
    .select({
      rang: schema.ecransGardes.rang,
      medias: schema.ecransGardes.medias,
      tailles: schema.ecransGardes.tailles,
      lu: schema.ecransGardes.lu,
      saute: schema.ecransGardes.saute,
    })
    .from(schema.ecransGardes)
    .where(eq(schema.ecransGardes.storyId, storyId))
    .orderBy(asc(schema.ecransGardes.rang));
  const aLire = lots.filter((l) => !l.lu && !l.saute);
  let faits = suite.lots - aLire.length;
  surAvance?.(faits, suite.lots);
  const lireUn = async (l: LotGarde, auDebut?: () => void) => {
    await lireUnLot(storyId, suite, l, auDebut);
    surAvance?.(++faits, suite.lots);
  };
  const [premier, ...autres] = aLire;
  if (premier) {
    if (tempsRestant() < DUREE_D_UN_LOT_MS) throw new ErreurTache("delai");
    /*
     * Le premier seul : les autres partent quand sa réponse commence (son texte système en cache), quand il a fini, ou
     * au bout de ATTENTE_DU_PREMIER_MS. En échec, ils ne partent pas : l’étape repart (sur ce qui manque), ou attend minuit
     */
    let dire = () => {};
    const commence = new Promise<void>((ok) => (dire = ok));
    let echoue = false;
    const lePremier = lireUn(premier, dire).catch((e: unknown) => {
      echoue = true;
      throw e;
    });
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([commence, lePremier.catch(() => {}), new Promise((ok) => (minuteur = setTimeout(ok, ATTENTE_DU_PREMIER_MS)))]);
    clearTimeout(minuteur);
    if (echoue || tempsRestant() < DUREE_D_UN_LOT_MS) {
      await lePremier;
      throw new ErreurTache("delai");
    }
    /*
     * Les autres, LECTEURS_DE_LOTS à la fois avec le premier (qui en prend un autre une fois fini), comme avant l’achat :
     * pas de rafale chez le prestataire. Tous au bout avant de dire l’échec d’un seul (un lecteur en échec n’en prend plus) :
     * chaque lecture faite est écrite, le nouvel essai ne la repaie pas
     */
    let suivant = 0;
    const lecteur = async () => {
      while (suivant < autres.length) await lireUn(autres[suivant++]!);
    };
    const issues = await Promise.allSettled([lePremier.then(lecteur), ...Array.from({ length: Math.min(LECTEURS_DE_LOTS - 1, autres.length) }, lecteur)]);
    const echecs = issues.flatMap((i) => (i.status === "rejected" ? [i.reason as unknown] : []));
    /* Le budget du jour d’abord : l’étape attend minuit sans user un essai, au lieu d’échouer sur la panne d’un autre lot */
    const [echec] = [...echecs.filter((e) => e instanceof ErreurTache && estBudget(e)), ...echecs];
    if (echec !== undefined) throw echec;
  }
  return completer(storyId, suite);
}

/**
 * Lit un lot de la suite, et garde sa lecture (chiffrée) sur sa ligne. Refusé ou illisible : sauté (marqué, pour ne pas
 * le relire). Une panne : une pause, un nouvel essai, puis l’étape échoue sur l’erreur telle quelle. Le budget du jour
 * atteint, ou l’échéance : l’erreur remonte tout de suite.
 */
async function lireUnLot(storyId: string, suite: typeof schema.suitesVideo.$inferSelect, l: LotGarde, auDebut?: () => void): Promise<void> {
  const ou = and(eq(schema.ecransGardes.storyId, storyId), eq(schema.ecransGardes.rang, l.rang));
  const [ligne] = await db().select({ data: schema.ecransGardes.data }).from(schema.ecransGardes).where(ou);
  /* Effacé entre-temps (la conv effacée) : rien à lire */
  if (!ligne) return;
  const images: Image[] = coffre.lireImages(ligne.data, l.tailles).map((o, k) => ({ media: mediaDe(l.medias[k]), base64: o.toString("base64") }));
  for (let essai = 1; ; essai++) {
    try {
      const lu = await lireLot(images, suite.appli, "captures_suite", { storyId, payeur: PAYEUR_DE_LA_SUITE, jour: suite.jour, ...(auDebut ? { auDebut } : {}) });
      await db()
        .update(schema.ecransGardes)
        .set({ lu: coffre.ecrire("ecrans_gardes.lu", lu) })
        .where(ou);
      return;
    } catch (e) {
      /* Un refus ou une sortie illisible reviendraient à chaque essai : le lot est sauté, un trou dans la conv */
      if ((e instanceof ErreurTache && estRefus(e)) || e instanceof ErreurImport) {
        journal("lot de la suite sauté", { histoire: storyId, rang: l.rang, code: e.code }, "alerte");
        await db().update(schema.ecransGardes).set({ saute: true }).where(ou);
        return;
      }
      /*
       * Jamais un code à nous à la place de celui du prestataire : « api:529 » (une surcharge) se reprend seul 10 minutes
       * après, un code inconnu de ECHEC_PASSAGER laissait le verdict d’un acheteur en échec pour de bon
       */
      if ((e instanceof ErreurTache && (estBudget(e) || e.code === "delai")) || essai >= ESSAIS_PAR_LOT) throw e;
      await pause(PAUSE_ENTRE_DEUX_ESSAIS_MS);
    }
  }
}

/** Le type d’une image gardée, tel qu’écrit à l’envoi (imagesDe ne garde que ceux-là). */
const mediaDe = (m: string | undefined): Image["media"] => (m === "image/png" || m === "image/webp" ? m : "image/jpeg");

/**
 * La suite lue : les lectures rassemblées dans l’ordre de la vidéo (les lots gardés, rang par rang, puis les lots déjà lus
 * à l’import) remplacent la conv, et les écrans, la suite et leurs lectures s’effacent, dans une même transaction.
 */
async function completer(storyId: string, suite: typeof schema.suitesVideo.$inferSelect): Promise<IssueDeLaSuite> {
  const lignes = await db()
    .select({ rang: schema.ecransGardes.rang, lu: schema.ecransGardes.lu, saute: schema.ecransGardes.saute })
    .from(schema.ecransGardes)
    .where(eq(schema.ecransGardes.storyId, storyId))
    .orderBy(asc(schema.ecransGardes.rang));
  const gardes = lignes.flatMap((l) => (l.lu ? [coffre.lire("ecrans_gardes.lu", l.lu)] : []));
  const issue: IssueDeLaSuite = gardes.length === suite.lots ? "lue" : "incomplete";
  const lus = [...gardes, ...coffre.lire("suites_video.recents", suite.recents)];
  await db().transaction(async (tx) => {
    const [meta] = await tx.select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, storyId));
    if (meta) {
      /* Le nom de l’autre, celui de l’import (participants[1] : « Moi », puis l’autre, sur des captures) */
      const autre = coffre.lire("stories.meta", meta.meta).participants[1].nom;
      await completerLaConv(tx, storyId, versTexteCaptures(fusionnerLots(lus, suite.appli), { autre, aujourdhui: suite.jour }));
    }
    await tx.delete(schema.ecransGardes).where(eq(schema.ecransGardes.storyId, storyId));
    await tx.delete(schema.suitesVideo).where(eq(schema.suitesVideo.storyId, storyId));
    /* Dans la même transaction : un nouvel essai du verdict ne la croit jamais perdue (suitePerdue) */
    await tx.update(schema.imports).set({ suite: issue }).where(eq(schema.imports.storyId, storyId));
  });
  return issue;
}

/**
 * Une conv sans suite en base : si la mesure dit qu’elle en attendait une (des lots gardés, jamais lus), ses écrans ont été
 * effacés avant le paiement (payée plus de 11 jours après le paywall, la fin des relances : src/server/ecrans-gardes.ts).
 * Le verdict part sur la partie lue avant l’achat : « perdue ». Rare depuis que la suite attend la fin des relances.
 * TODO(produit): le dire au modèle et à l’écran (une suite perdue, ou incomplète : un lot sauté), par la ligne « d’où vient chaque morceau » de la conv en morceaux (blush-front#124, pas encore fusionnée) ?
 */
async function suitePerdue(storyId: string): Promise<IssueDeLaSuite | null> {
  const [m] = await db()
    .select({ suite: schema.imports.suite })
    .from(schema.imports)
    .where(and(eq(schema.imports.storyId, storyId), eq(schema.imports.suite, "attente")));
  if (!m) return null;
  journal("suite de la vidéo perdue", { histoire: storyId }, "alerte");
  await noterLaSuite(storyId, "perdue");
  return "perdue";
}
