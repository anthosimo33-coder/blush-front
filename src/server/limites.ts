import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "./db";

/** Les limites anti-abus : combien de fois, sur quelle fenêtre. */
export const LIMITES = {
  codeParEmail: { max: 5, fenetreS: 3600 },
  codeParIp: { max: 20, fenetreS: 3600 },
  verificationParIp: { max: 30, fenetreS: 3600 },
  importParIp: { max: 20, fenetreS: 3600 },
  chatParCompte: { max: 150, fenetreS: 86400 },
  /** Les nouvelles convs lues (un verdict, puis un rapport et une mémoire : environ 1 $ chacune). */
  analyseParCompte: { max: 5, fenetreS: 86400 },
  /** Les alertes par mail à l’équipe. */
  alertesParJour: { max: 30, fenetreS: 86400 },
  /** Les inscriptions à la liste d’attente. */
  attenteParIp: { max: 10, fenetreS: 3600 },
  /** Les lots d’images d’un enregistrement d’écran (une dizaine par enregistrement), chacun lu par le modèle. */
  lotParIp: { max: 60, fenetreS: 3600 },
  /** Des captures ou un export envoyés après l’import (dans le chat ou pour sa fiche) : les lire coûte plus qu’un message. */
  ajoutParCompte: { max: 40, fenetreS: 86400 },
} as const;

/**
 * Compte un passage pour `cle` et dit s’il reste sous la limite. Une seule requête, atomique :
 * la fenêtre repart à zéro quand elle a expiré.
 */
export async function sousLaLimite(cle: string, { max, fenetreS }: { max: number; fenetreS: number }): Promise<boolean> {
  const [ligne] = await db()
    .insert(schema.rateLimits)
    .values({ key: cle, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS}) then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS}) then now() else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return ligne.count <= max;
}

/** L’adresse IP de la requête (derrière le proxy de Vercel). */
export function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
}
