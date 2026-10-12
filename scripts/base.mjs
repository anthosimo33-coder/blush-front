/*
 * Ce que les scripts qui touchent à la base partagent (scripts/migrer.mjs, scripts/acces.mts, drizzle.config.ts), et le
 * pool de l’appli (src/server/db/index.ts) : comment s’y connecter, et ce que drizzle sauterait en migrant. Sans dépendance : tests/verifier-migrations.test.ts
 * l’essaie sans base.
 */

/** Les hôtes de la machine : le Postgres local se joint sans TLS. */
const LOCAUX = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]"]);

/** L’URL vise-t-elle le Postgres de la machine (ou un socket local) ? */
export function estLocale(url) {
  const hote = new URL(url).hostname;
  return LOCAUX.has(hote) || hote.endsWith(".localhost");
}

/**
 * Le réglage TLS d’une connexion postgres.js (S-36) : hors de la machine, une connexion chiffrée dont le certificat est
 * vérifié (`verify-full`), quoi que dise l’URL. Neon y ajoute `sslmode=require`, que postgres.js traduit en « tout
 * certificat est bon » : quelqu’un sur le chemin (un Wi-Fi public, un DNS détourné) lirait les requêtes et le mot de
 * passe. Le réglage donné ici l’emporte sur celui de l’URL.
 */
export const sslPour = (url) => (estLocale(url) ? false : "verify-full");

/**
 * La même règle écrite dans l’URL (`sslmode=verify-full`), pour ce qui ne prend qu’une URL : drizzle-kit, et le pool pg
 * de l’appli. pg 8 lisait déjà `sslmode=require` comme `verify-full`, mais l’écrivait dans les logs à chaque démarrage
 * (« SECURITY WARNING ») : dit en clair, il se tait (tests/unit/db-url.test.ts).
 */
export function urlVerifiee(url) {
  if (estLocale(url)) return url;
  const u = new URL(url);
  u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}

/**
 * Les migrations du journal (drizzle/meta/_journal.json, ses `entries`) que drizzle sauterait sans un mot : plus
 * anciennes (`when`) que la dernière appliquée à la base, sans l’avoir été elles-mêmes. Drizzle n’applique que ce qui
 * est plus récent que la dernière migration passée (sa table drizzle.__drizzle_migrations garde le `when` de chacune,
 * `created_at`). C’est ce qui arrive à une migration générée sur une branche, puis rebasée derrière une autre déjà
 * appliquée : il faut la régénérer après le rebase (BACKEND.md, « Les migrations »).
 * `appliquees` : les `created_at` de la table (des nombres).
 */
export function migrationsSautees(entrees, appliquees) {
  if (!appliquees.length) return [];
  const derniere = Math.max(...appliquees);
  const passees = new Set(appliquees);
  return entrees.filter((e) => e.when <= derniere && !passees.has(e.when));
}

/*
 * Les rattrapages de données, après les migrations (scripts/migrer.mjs, scripts/developper.mjs) : ce qu’une migration
 * générée par drizzle (du schéma seulement, jamais écrite à la main) ne fait pas. Chacun tient en une requête, se rejoue
 * sans effet, et ne touche qu’une fois chaque ligne : une base migrée deux fois, ou deux builds en même temps, ne donnent
 * rien deux fois (BACKEND.md, « Les migrations »).
 */

/** Les bulles données aux testeurs de la bêta : BULLES_DE_LA_BETA (src/contenu/offres.ts), recopié ici (tests/rattrapages.test.ts les compare). */
export const BULLES_DE_LA_BETA = 100;

/**
 * Les testeurs de la bêta (users.plan « rapport », ou l’ancien accès au chat) gardent leurs rapports et reçoivent leurs
 * bulles, une fois : une ligne « beta » au journal des bulles (unique par compte : sa référence est l’id du compte), le
 * solde, puis toutes les convs que le compte a à ce moment-là, débloquées. Ce qui n’a pas inscrit sa ligne (déjà fait)
 * ne change rien : une conv importée après le rattrapage reste à payer. Rend le nombre de testeurs et de convs servis.
 */
export const RATTRAPAGE_BETA = `
with testeurs as (
  insert into mouvements_bulles (user_id, delta, raison, ref)
  select id, ${BULLES_DE_LA_BETA}, 'beta', id::text from users where plan in ('rapport', 'blushplus')
  on conflict (raison, ref) do nothing
  returning user_id
), soldes as (
  update users set bulles = bulles + ${BULLES_DE_LA_BETA} where id in (select user_id from testeurs) returning id
), convs as (
  update stories set debloque_le = now() where user_id in (select user_id from testeurs) and debloque_le is null returning id
)
select (select count(*) from soldes)::int as testeurs, (select count(*) from convs)::int as convs`;

/** Passe les rattrapages sur une base déjà migrée (`client` : postgres.js), et dit ce qu’ils ont fait. */
export async function rattraper(client) {
  const [{ testeurs, convs }] = await client.unsafe(RATTRAPAGE_BETA);
  if (testeurs) console.log(`rattrapages : ${testeurs} testeur(s) de la bêta, ${convs} conv(s) débloquée(s)`);
  return { testeurs, convs };
}
