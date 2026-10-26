import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { Image } from "@prompts/lib/contextes";
import { LECTEURS_DE_LOTS } from "@/lib/limites";
import type { Captures } from "@prompts/lib/schemas";
import type { z } from "zod";
import type { AppliCaptures } from "./appli-captures";
import { alerter } from "./alertes";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import { ErreurPublique } from "./erreurs";
import type { Transaction } from "./histoires";
import { auMieux } from "./journal";

/*
 * Les écrans gardés d’une longue vidéo lue en partie avant l’achat (src/server/lecture-partielle.ts) : ses lots les plus
 * anciens, que le modèle n’a pas lus, gardés chiffrés en base (ecrans_gardes) jusqu’au paiement, puis lus juste avant le
 * verdict (src/server/suite-video.ts). Ce module ne fait que les garder, les rattacher et les effacer, sans modèle : la
 * chaîne (src/server/pipeline.ts) et la purge l’importent sans charger le SDK.
 * 1. L’envoi (POST /api/captures/ecrans) : le navigateur envoie leurs images, un lot par requête (garderUnLot), pendant
 *    la lecture des lots récents, avant la fin de l’import ; l’envoi abandonné les efface tout de suite (oublierLesEcransDe),
 *    sinon, sans import, ils s’effacent au bout d’une heure.
 * 2. L’import (POST /api/captures/video) : la conv naît avec sa suite, dans la même transaction (rattacherLaSuite) : ses
 *    lots passent sous elle, et ce qu’il faut pour les lire plus tard (suites_video : les lectures des lots déjà lus, son
 *    appli, le jour de l’import). Tous ses lots doivent être là, sinon rien n’est créé et le navigateur lit le reste.
 *    Ceux qu’elle ne prend pas (lus quand même avant l’achat) s’effacent aussitôt.
 * 3. Sans paiement dans les 24 h : tout s’efface, sans avoir été lu (purgerLesEcrans, toutes les 5 minutes). Au paiement
 *    (lancerApresPaiement, src/server/pipeline.ts) : gardés 7 jours au plus, le temps du verdict (garderJusquALaLecture).
 * Les écrans ne sortent jamais : aucune route ne les rend au navigateur, ni /admin, ni le MCP, et le journal n’écrit que
 * des codes.
 */

/** Combien de temps des écrans envoyés attendent leur import (une heure : il suit de quelques secondes). */
const ATTENTE_DE_L_IMPORT_MS = 60 * 60e3;
/** Combien de temps une suite attend le paiement : 24 h après l’import, puis tout s’efface, sans avoir été lu. */
const SUITE_GARDEE_SANS_PAIEMENT_MS = 24 * 60 * 60e3;
/** Une fois payée, combien de temps elle attend sa lecture au plus (le verdict la lit dans la minute ; le budget du jour peut la faire attendre) : au-delà, effacée et l’équipe prévenue. */
const SUITE_GARDEE_APRES_PAIEMENT_MS = 7 * 24 * 60 * 60e3;
/** Le temps d’un lot de douze écrans (25 à 30 s), et sa marge : sans lui avant l’échéance, la lecture de la suite s’arrête (relais). */
export const DUREE_D_UN_LOT_MS = 40_000;

/** La suite n’a pas tous ses lots au moment de l’import : rien n’est créé, le navigateur lit le reste (il n’y a pas d’autre issue). */
export class SuiteIncomplete extends ErreurPublique<"aucune"> {
  constructor() {
    super("aucune");
  }
}

/* ———— L’envoi et l’import ———— */

/**
 * Garde un lot d’écrans d’une longue vidéo (POST /api/captures/ecrans), chiffré, le temps que son import arrive (une heure
 * au plus sans lui). `envoi` : l’empreinte de l’envoi (envoiDe), `rang` : la place du lot dans la vidéo. Le même lot
 * renvoyé (un nouvel essai après une coupure) ne s’écrit pas deux fois.
 */
export async function garderUnLot(envoi: string, rang: number, images: Image[]): Promise<void> {
  const octets = images.map((i) => Buffer.from(i.base64, "base64"));
  await db()
    .insert(schema.ecransGardes)
    .values({
      envoi,
      rang,
      medias: images.map((i) => i.media),
      tailles: octets.map((o) => o.length),
      data: coffre.ecrireImages(octets),
      expireLe: new Date(Date.now() + ATTENTE_DE_L_IMPORT_MS),
    })
    .onConflictDoNothing();
}

/**
 * Efface les écrans d’un envoi qu’aucune conv n’a pris : son enregistrement abandonné (POST /api/captures/lot/abandon :
 * un lot en échec, la page fermée), ou importé sans eux (lu en entier, ou les lots envoyés pendant la lecture puis lus
 * quand même : src/services/api.ts). Sans cela, ils attendraient leur heure (ATTENTE_DE_L_IMPORT_MS). Rend combien.
 */
export async function oublierLesEcransDe(envoi: string): Promise<number> {
  const effaces = await db()
    .delete(schema.ecransGardes)
    .where(and(eq(schema.ecransGardes.envoi, envoi), isNull(schema.ecransGardes.storyId)))
    .returning({ rang: schema.ecransGardes.rang });
  return effaces.length;
}

/** Ce qu’il faut garder d’une longue vidéo lue en partie pour lire sa suite après le paiement. */
export type SuiteAGarder = { envoi: string; recents: Captures[]; appli: z.infer<typeof AppliCaptures>; jour: string; ecrans: number; lots: number };

/**
 * La suite d’une longue vidéo, rattachée à sa conv tout juste créée, dans la transaction de sa création
 * (importerCaptures, `avec`) : ses lots gardés passent sous la conv (effacés avec elle, ou 24 h après sans paiement), et
 * ce qu’il faut pour les lire plus tard. Un lot qui manque (effacé, jamais arrivé) : SuiteIncomplete, et la conv n’est
 * pas créée (le navigateur lit alors le reste). Les lots du même envoi au-delà de la suite (envoyés pendant la lecture,
 * puis lus quand même) s’effacent : la conv les a déjà.
 */
export async function rattacherLaSuite(tx: Transaction, storyId: string, s: SuiteAGarder): Promise<void> {
  const expireLe = new Date(Date.now() + SUITE_GARDEE_SANS_PAIEMENT_MS);
  const rattaches = await tx
    .update(schema.ecransGardes)
    .set({ storyId, expireLe })
    .where(and(eq(schema.ecransGardes.envoi, s.envoi), isNull(schema.ecransGardes.storyId), lt(schema.ecransGardes.rang, s.lots)))
    .returning({ rang: schema.ecransGardes.rang });
  if (rattaches.length !== s.lots) throw new SuiteIncomplete();
  await tx.delete(schema.ecransGardes).where(and(eq(schema.ecransGardes.envoi, s.envoi), isNull(schema.ecransGardes.storyId)));
  await tx.insert(schema.suitesVideo).values({
    storyId,
    envoi: s.envoi,
    recents: coffre.ecrire("suites_video.recents", s.recents),
    appli: s.appli,
    jour: s.jour,
    ecrans: s.ecrans,
    lots: s.lots,
    expireLe,
  });
}

/* ———— Le paiement ———— */

/**
 * Le paiement reçu (lancerApresPaiement, src/server/pipeline.ts) : la suite de la conv, s’il y en a une, attend sa lecture (le
 * verdict, dans la minute) au plus 7 jours, au lieu des 24 h d’une conv qui n’a rien payé. Ne lève jamais.
 */
export async function garderJusquALaLecture(storyId: string): Promise<void> {
  await auMieux(
    async () => {
      const expireLe = new Date(Date.now() + SUITE_GARDEE_APRES_PAIEMENT_MS);
      const [suite] = await db()
        .update(schema.suitesVideo)
        .set({ expireLe, payeeLe: new Date() })
        .where(and(eq(schema.suitesVideo.storyId, storyId), isNull(schema.suitesVideo.payeeLe)))
        .returning({ storyId: schema.suitesVideo.storyId });
      if (suite) await db().update(schema.ecransGardes).set({ expireLe }).where(eq(schema.ecransGardes.storyId, storyId));
    },
    "suite de la vidéo non prolongée",
    { histoire: storyId },
  );
}

/**
 * Le temps que la suite d’une conv ajoute à son verdict, en plus de sa durée habituelle (tempsPourCommencer,
 * src/server/pipeline.ts) : son premier lot seul, puis les autres par vagues de LECTEURS_DE_LOTS (suite-video.ts). 0 :
 * pas de suite qui attende.
 */
export async function dureeDeLaSuite(storyId: string): Promise<number> {
  const [l] = await db().select({ lots: schema.suitesVideo.lots }).from(schema.suitesVideo).where(eq(schema.suitesVideo.storyId, storyId));
  return l ? (1 + Math.ceil(Math.max(0, l.lots - 1) / LECTEURS_DE_LOTS)) * DUREE_D_UN_LOT_MS : 0;
}

/* ———— L’effacement ———— */

/**
 * Efface les écrans gardés et les suites dont l’heure est passée (`expire_le`) : ceux qu’aucun import n’a pris (une
 * heure), ceux d’une conv qui n’a rien payé (24 h), ceux d’une conv payée jamais lus (7 jours : l’équipe est prévenue).
 * Toutes les 5 minutes (GET /api/cron/relances) et chaque nuit (la purge). Rend le nombre de lots effacés.
 */
export async function purgerLesEcrans(maintenant = new Date()): Promise<number> {
  const payees = await db()
    .delete(schema.suitesVideo)
    .where(lt(schema.suitesVideo.expireLe, maintenant))
    .returning({ storyId: schema.suitesVideo.storyId, payeeLe: schema.suitesVideo.payeeLe });
  const ecrans = await db().delete(schema.ecransGardes).where(lt(schema.ecransGardes.expireLe, maintenant)).returning({ rang: schema.ecransGardes.rang });
  const jamaisLues = payees.filter((p) => p.payeeLe);
  if (jamaisLues.length)
    await alerter("suites de vidéo payées jamais lues", [
      `${jamaisLues.length} suite(s) de longue vidéo payée(s) effacée(s) sans avoir été lue(s), 7 jours après le paiement.`,
      "Leur verdict est parti (ou partira) sur la seule partie lue avant l’achat : regarde les tâches en échec de /admin.",
    ]);
  return ecrans.length;
}
