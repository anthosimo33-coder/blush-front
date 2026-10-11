import { sql } from "drizzle-orm";
import { prolongerSession } from "@/server/auth";
import { lireSession, poserSession } from "@/server/cookies";
import { db } from "@/server/db";
import { repondre } from "@/server/http";

/*
 * Le réveil : une requête minuscule qui démarre une instance et réveille la base (Neon s’endort après quelques minutes
 * sans requête, et la première qui suit attend environ une seconde). Le navigateur l’appelle sans attendre la réponse
 * (src/components/shell/Reveil.tsx), à chaque visite ; un service de ping peut l’appeler toutes les 4 minutes. Elle ne
 * dit rien d’autre que « ok ». Seul effet : une visite prolonge la session (un mois, une fois par jour au plus), et son
 * cookie avec elle.
 */
export async function GET() {
  try {
    await db().execute(sql`select 1`);
    const secret = await lireSession();
    const fin = secret ? await prolongerSession(secret) : null;
    if (secret && fin) await poserSession(secret, fin);
    return repondre("GET /api/reveil", { ok: true });
  } catch {
    return repondre("GET /api/reveil", { ok: false }, 503);
  }
}
