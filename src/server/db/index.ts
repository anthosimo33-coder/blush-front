import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/*
 * Un seul pool par instance (les fonctions Vercel en Fluid compute sont réutilisées).
 * En production, DATABASE_URL pointe sur le pooler de Neon. node-postgres y envoie chaque requête non nommée d’un bloc
 * (Parse, Bind, Execute) : un seul aller-retour. postgres.js, derrière drizzle, décrivait d’abord toute requête avec
 * paramètres (deux allers-retours), et le pooler ne permet pas de les préparer une fois pour toutes.
 * Les connexions restent ouvertes 2 min sans requête : le toucher qui suit la lecture d’un chapitre ne paie pas leur
 * réouverture (pas plus : sous Fluid compute, une connexion morte n’est pas rejouée). Au plus 30 min chacune, comme avant.
 */
const globale = globalThis as unknown as { blushDb?: ReturnType<typeof creer> };

function creer() {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 5, idleTimeoutMillis: 120_000, connectionTimeoutMillis: 30_000, maxLifetimeSeconds: 1800 });
  /* Une connexion au repos que la base coupe (Neon qui se met en veille, le pooler qui redémarre) : le pool l’écarte. Sans écouteur, l’erreur ferait tomber l’instance */
  pool.on("error", (e) => console.error("connexion à la base perdue :", e.message));
  return drizzle({ client: pool, schema });
}

export function db() {
  return (globale.blushDb ??= creer());
}

export { schema };
