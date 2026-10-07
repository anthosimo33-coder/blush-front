import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/*
 * Une seule connexion par instance (les fonctions Vercel en Fluid compute sont réutilisées).
 * En production, DATABASE_URL pointe sur le pooler de Neon ; `prepare: false` est requis derrière un pooler.
 */
const globale = globalThis as unknown as { blushDb?: ReturnType<typeof creer> };

function creer() {
  const client = postgres(env().DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
  return drizzle(client, { schema });
}

export function db() {
  return (globale.blushDb ??= creer());
}

export { schema };
