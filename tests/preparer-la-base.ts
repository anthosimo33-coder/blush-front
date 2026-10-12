import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

/*
 * Avant les tests (globalSetup de vitest.config.mts) : la base des tests (DATABASE_URL de la config) est créée si elle
 * manque, puis mise à jour avec les migrations de drizzle/, ses limites et ses compteurs du jour remis à zéro. Ses
 * autres tables ne sont jamais effacées : les tests écrivent avec des emails et des identifiants à eux. Un Postgres
 * injoignable arrête tout de suite, avec de quoi le relancer, plutôt que cent tests en échec.
 * blush_test, la base par défaut (sans DATABASE_URL_TEST), sert à tous les dossiers du projet sur la machine (les
 * worktrees, chacun sur sa branche) : elle n’est migrée, et remise à zéro, que si elle vient d’être créée. Une migration
 * qui lui manque arrête les tests (la migrer changerait la base des autres dossiers) : DATABASE_URL_TEST donne à ce
 * dossier sa propre base.
 */

const DRIZZLE = join(__dirname, "../drizzle");

/** Les migrations de drizzle/ qu’une base n’a pas encore (drizzle note chacune par son `when`, le plus récent appliqué). */
async function migrationsManquantes(client: postgres.Sql): Promise<string[]> {
  const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
  let derniere = 0;
  try {
    const [l] = await client<{ derniere: string | null }[]>`select max(created_at)::text as derniere from drizzle.__drizzle_migrations`;
    derniere = Number(l?.derniere ?? 0);
  } catch {
    /* Jamais migrée : tout lui manque */
  }
  return journal.entries.filter((e) => e.when > derniere).map((e) => e.tag);
}

/*
 * Les clés du prestataire de mails qui feraient partir de vrais mails pendant les tests (un shell qui a lu un .env de
 * production) : le modèle, la voix et la transcription restent factices (BLUSH_IA_FACTICE), les mails, eux, partiraient
 * par Resend vers les adresses @blush.test des tests (des rebonds, la réputation du domaine). Un test qui en veut une la
 * pose lui-même, le temps du test (vi.stubEnv, comme tests/boite-mails.test.ts), sur un `fetch` simulé.
 */
const CLES_DE_MAILS = ["RESEND_API_KEY", "RESEND_API_KEY_CODES"];

export default async function preparerLaBase(projet: TestProject): Promise<void> {
  const cles = CLES_DE_MAILS.filter((cle) => process.env[cle]);
  if (cles.length) throw new Error(`${cles.join(" et ")} dans l’environnement des tests : de vrais mails partiraient. Lance les tests sans (env -u ${cles.join(" -u ")} npm test)`);
  const url = new URL(String(projet.config.env.DATABASE_URL));
  /* Une base choisie (DATABASE_URL_TEST) est à ce dossier : on peut la migrer */
  const choisie = !!process.env.DATABASE_URL_TEST;
  const nom = decodeURIComponent(url.pathname.slice(1));
  /* Jamais la base de dev ni celle de la production : seulement une base dont le nom dit qu’elle sert aux tests */
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(nom)) throw new Error(`DATABASE_URL_TEST doit viser une base de test (son nom contient « test ») : « ${nom} » refusée`);

  const serveur = new URL(url);
  serveur.pathname = "/postgres";
  const admin = postgres(serveur.href, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  let creee = false;
  try {
    const [existe] = await admin`select 1 from pg_database where datname = ${nom}`;
    if (!existe) {
      await admin.unsafe(`create database "${nom}"`);
      creee = true;
      console.log(`base ${nom} créée`);
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    /* Une autre suite de tests l’a créée au même instant : elle est là, c’est ce qu’on voulait */
    if (code === "42P04") return preparerLaBase(projet);
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "CONNECT_TIMEOUT")
      throw new Error(`Postgres est injoignable sur ${serveur.host} : lance-le (brew services start postgresql@16), ou donne une autre adresse dans DATABASE_URL_TEST`);
    throw new Error(`la base des tests ${nom} n’a pas pu être préparée sur ${serveur.host} : ${(e as Error).message}`);
  } finally {
    await admin.end();
  }

  /* Une seule connexion : le verrou tient pendant toute la migration, et deux suites lancées ensemble migrent l’une après l’autre */
  const client = postgres(url.href, { max: 1, onnotice: () => {} });
  try {
    if (!creee && !choisie) {
      /*
       * Les dépenses de tests/budget.test.ts qu’un lancement interrompu a laissées (jusqu’à 30 $ aujourd’hui : tout appel au
       * modèle, même factice, serait refusé jusqu’à minuit). Celles de plus de 10 minutes seulement : un autre dossier
       * peut être en train de s’en servir
       */
      await client`delete from ai_usage where task = 'test-budget' and created_at < now() - interval '10 minutes'`;
      const manquantes = await migrationsManquantes(client);
      if (manquantes.length)
        throw new Error(
          `la base ${nom}, celle de tous les dossiers du projet, n’a pas ${manquantes.join(", ")} : la migrer changerait la base des autres dossiers. ` +
            `Donne à ce dossier sa propre base : DATABASE_URL_TEST=postgres://${serveur.host}/${nom}_<nom> npm test`,
        );
      return;
    }
    await client`select pg_advisory_lock(hashtext('blush:migrations-des-tests'))`;
    await migrate(drizzle(client), { migrationsFolder: DRIZZLE });
    /*
     * Les limites (rate_limits) et les compteurs du jour (counters) s’ajoutent d’un lancement à l’autre : sans remise à
     * zéro, un plafond du jour (les alertes, les mails de code) se remplit au fil des lancements, et un test échoue sans
     * que rien n’ait changé. La base commune, elle, n’est pas remise à zéro (un autre dossier peut être en train de s’en
     * servir) : les tests qui posent un plafond le retirent eux-mêmes.
     */
    await client`truncate rate_limits, counters`;
    /* Les dépenses de tests/budget.test.ts qu’un lancement interrompu a laissées : jusqu’à minuit, tout appel au modèle serait refusé */
    await client`delete from ai_usage where task = 'test-budget'`;
  } finally {
    await client.end();
  }
}
