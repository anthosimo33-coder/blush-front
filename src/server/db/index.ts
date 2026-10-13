import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { urlVerifiee } from "../../../scripts/base.mjs";
import { env } from "../env";
import { ErreurInvariant } from "../erreurs";
import { journalErreur } from "../journal";
import * as schema from "./schema";

/*
 * Un seul pool par instance (les fonctions Vercel en Fluid compute sont réutilisées).
 * En production, DATABASE_URL pointe sur le pooler de Neon. node-postgres y envoie chaque requête non nommée d’un bloc
 * (Parse, Bind, Execute) : un seul aller-retour. postgres.js, derrière drizzle, décrivait d’abord toute requête avec
 * paramètres (deux allers-retours), et le pooler ne permet pas de les préparer une fois pour toutes.
 * Les connexions restent ouvertes 2 min sans requête : le toucher qui suit la lecture d’un chapitre ne paie pas leur
 * réouverture (pas plus : sous Fluid compute, une connexion morte n’est pas rejouée). Au plus 30 min chacune, comme avant.
 * Le TLS (S-36) suit la règle de scripts/base.mjs, la même que pour les migrations : hors de la machine, l’URL dit
 * `sslmode=verify-full` (certificat et nom d’hôte vérifiés). pg 8 traitait déjà le `sslmode=require` de Neon ainsi, mais
 * l’écrivait à chaque démarrage dans les logs (« SECURITY WARNING: The SSL modes… ») : le dire en clair le fait taire.
 */
const globale = globalThis as unknown as { blushDb?: ReturnType<typeof creer> };

function creer() {
  const pool = new Pool({ connectionString: urlVerifiee(env().DATABASE_URL), max: 10, idleTimeoutMillis: 120_000, connectionTimeoutMillis: 30_000, maxLifetimeSeconds: 1800 });
  /* Une connexion au repos que la base coupe (Neon qui se met en veille, le pooler qui redémarre) : le pool l’écarte. Sans écouteur, l’erreur ferait tomber l’instance */
  pool.on("error", (e) => journalErreur("connexion à la base perdue", e));
  return drizzle({ client: pool, schema });
}

export function db() {
  return (globale.blushDb ??= creer());
}

export { schema };

/**
 * La ligne qu’une requête rend forcément : celle d’un `insert … returning`, d’un `update … returning` sur une ligne
 * qu’on vient de lire, d’un agrégat (`count(*)`). Sans elle (une ligne effacée entre deux requêtes, une erreur du code),
 * l’erreur dit ce qu’on cherchait, ici, plutôt qu’un « cannot read properties of undefined » plus loin. `quoi` nomme la
 * table et l’étape (« stories:curseur »), jamais une valeur : il fait le code de l’erreur (ErreurInvariant), que le
 * journal garde.
 */
export function uneLigne<T>(lignes: readonly T[], quoi: string): T {
  const [ligne] = lignes;
  if (ligne === undefined) throw new ErreurInvariant(`${quoi}:aucune_ligne`);
  return ligne;
}
