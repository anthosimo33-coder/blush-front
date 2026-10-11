import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import postgres from "postgres";
import { cleDeLimiteDuCompte, emailCanonique, LIMITES_DU_COMPTE, type LimiteDuCompte } from "../../../src/server/email-canonique";
import { CLE, DATABASE_URL } from "../reglages";
import { oublierMails } from "./boite";
import { RESEAU } from "./page";

/*
 * La base des tests, lue et écrite directement : vérifier ce qu’un parcours a laissé (le compte, son plan, ses tâches),
 * ou préparer un cas qu’aucun écran ne crée. Les colonnes chiffrées (la conv, le verdict…) se lisent avec dechiffrer,
 * le miroir de src/server/chiffrement.ts avec la clé fictive des tests.
 */

let client: postgres.Sql | null = null;
/** Le client SQL de ce worker (postgres.js : sql()`select …`). Ses connexions se ferment d’elles-mêmes, inutilisées. */
export const sql = () => (client ??= postgres(DATABASE_URL, { max: 2, idle_timeout: 5, onnotice: () => {} }));

/* ———— Le chiffrement de src/server/chiffrement.ts, avec la clé fictive (BLUSH_CLE des serveurs des tests) ———— */

const MAITRE = Buffer.from(CLE, "base64");
const CHIFFREMENT = Buffer.from(hkdfSync("sha256", MAITRE, Buffer.alloc(0), "blush:chiffrement:v1", 32));
const HACHAGE = Buffer.from(hkdfSync("sha256", MAITRE, Buffer.alloc(0), "blush:hachage:v1", 32));

/** L’empreinte d’un secret (HMAC), telle que le serveur la garde : de quoi retrouver les lignes d’un email. */
export const empreinte = (secret: string) => createHmac("sha256", HACHAGE).update(secret).digest("base64url");

/** Déchiffre une colonne chiffrée : [version 1 octet][iv 12][tag 16][texte chiffré], du JSON. */
export function dechiffrer<T>(donnee: Uint8Array): T {
  const b = Buffer.from(donnee);
  if (b[0] !== 1) throw new Error(`version de chiffrement inconnue : ${b[0]} (src/server/chiffrement.ts a changé ?)`);
  const d = createDecipheriv("aes-256-gcm", CHIFFREMENT, b.subarray(1, 13));
  d.setAuthTag(b.subarray(13, 29));
  return JSON.parse(Buffer.concat([d.update(b.subarray(29)), d.final()]).toString("utf8")) as T;
}

/** Chiffre une valeur comme le serveur, pour la réécrire en base. */
export function chiffrer(valeur: unknown): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", CHIFFREMENT, iv);
  const corps = Buffer.concat([c.update(JSON.stringify(valeur), "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), corps]);
}

/* ———— Les comptes et leurs histoires ———— */

export type Plan = "gratuit" | "rapport" | "blushplus";
export type Tache = { genre: string; statut: "attente" | "en_cours" | "fini" | "echec"; essais: number; erreur: string | null };
export type Histoire = { id: string; messages: number; convGardee: boolean };

/** Le compte de cet email, ou null : il naît au premier bon code. */
export async function compteDe(email: string): Promise<{ id: string; plan: Plan } | null> {
  const [u] = await sql()<{ id: string; plan: Plan }[]>`select id, plan from users where email = ${email.toLowerCase()}`;
  return u ?? null;
}

/** Change le plan d’un compte, comme `npm run acces` (sans paiement en v1). Le compte doit exister. */
export async function definirPlan(email: string, plan: Plan): Promise<void> {
  const r = await sql()`update users set plan = ${plan} where email = ${email.toLowerCase()}`;
  if (!r.count) throw new Error(`aucun compte pour ${email}`);
}

/** Les histoires du compte, de la plus ancienne à la plus récente. `convGardee` : la conv brute est encore en base. */
export async function histoiresDe(email: string): Promise<Histoire[]> {
  return sql()<Histoire[]>`
    select s.id, s.message_count as messages, s.conv is not null as "convGardee"
    from stories s join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by s.created_at`;
}

/** La dernière histoire du compte, à glisser dans une requête : sql()`… where story_id = ${derniereHistoire(email)}`. */
export const derniereHistoire = (email: string) =>
  sql()`(select s.id from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1)`;

/** L’histoire est-elle encore en base (sous ce compte, un autre, ou en brouillon) ? */
export async function histoireExiste(id: string): Promise<boolean> {
  const [ligne] = await sql()`select 1 from stories where id = ${id}`;
  return !!ligne;
}

/** Les tâches de toutes les histoires du compte, dans l’ordre où elles ont été planifiées. */
export async function tachesDe(email: string): Promise<Tache[]> {
  return sql()<Tache[]>`
    select t.kind as genre, t.status as statut, t.attempts as essais, t.error as erreur
    from tasks t join stories s on s.id = t.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by t.created_at`;
}

/**
 * Attend la fin de la chaîne : plus aucune tâche du compte en attente ni en cours. Chaque étape planifie la suivante avant
 * de finir : il n’y a pas de creux entre deux. Utile après la lecture d’un compte BLUSH+ (le rapport, le vocal, la
 * mémoire s’écrivent ensuite, sans écran qui l’attende forcément). Une tâche en échec fait échouer tout de suite, avec
 * son erreur, sauf avec `echecPermis` (le test le veut). Renvoie les tâches.
 */
export async function attendreTaches(email: string, { timeout = RESEAU, echecPermis = false }: { timeout?: number; echecPermis?: boolean } = {}): Promise<Tache[]> {
  const fin = Date.now() + timeout;
  for (;;) {
    const taches = await tachesDe(email);
    if (taches.length && taches.every((t) => t.statut === "fini" || t.statut === "echec")) {
      const echecs = taches.filter((t) => t.statut === "echec");
      if (echecs.length && !echecPermis) throw new Error(`la chaîne de ${email} a échoué : ${echecs.map((t) => `${t.genre} (${t.erreur ?? "sans code"}, ${t.essais} essais)`).join(", ")}`);
      return taches;
    }
    if (Date.now() > fin) throw new Error(`la chaîne de ${email} tourne encore après ${timeout} ms : ${JSON.stringify(taches)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Une étape de la chaîne en échec pour de bon sur la dernière histoire du compte, comme après ses trois essais ratés
 * (`erreur` : le code gardé, « refus… » pour un refus du modèle). Le modèle factice ne rate jamais : c’est le seul moyen
 * de voir, de bout en bout, ce que l’écran fait d’un échec. Renvoie l’identifiant de la tâche.
 */
export async function etapeEnEchec(email: string, genre: string, erreur: string): Promise<string> {
  const [s] = await sql()<{ id: string }[]>`
    select s.id from stories s join users u on u.id = s.user_id where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1`;
  if (!s) throw new Error(`aucune histoire pour ${email}`);
  const t = (await sql()<{ id: string }[]>`
    insert into tasks (story_id, kind, status, attempts, error) values (${s.id}, ${genre}, 'echec', 3, ${erreur}) returning id`)[0]!;
  return t.id;
}

/** Change le code d’erreur d’une tâche en échec (etapeEnEchec). */
export async function changerErreur(tache: string, erreur: string): Promise<void> {
  await sql()`update tasks set error = ${erreur} where id = ${tache}`;
}

/**
 * Pose une limite anti-abus de ce compte (son nom, LIMITES_DU_COMPTE de src/server/email-canonique.ts) à `max`, comme
 * après une journée bien remplie : à son plafond, la prochaine fois, le serveur refuse (« trop »). `max: 0` la remet à
 * zéro. Rangée sur l’email canonique (cleDeLimiteDuCompte), la clé même que compte le serveur. Le compte doit exister :
 * une faute dans l’email du test se voit tout de suite.
 */
export async function remplirLaLimite(email: string, nom: LimiteDuCompte, max: number): Promise<void> {
  const [u] = await sql()<{ id: string }[]>`select id from users where email = ${email.toLowerCase()}`;
  if (!u) throw new Error(`aucun compte pour ${email}`);
  const k = empreinte(`limite:${cleDeLimiteDuCompte(nom, email)}`);
  await sql()`insert into rate_limits (key, window_start, count) values (${k}, now(), ${max}) on conflict (key) do update set window_start = now(), count = ${max}`;
}

/*
 * Les compteurs des codes de connexion d’un email (src/server/limites.ts) : ses codes du jour, ceux de sa réserve et ses
 * essais ratés, rangés par email canonique. Ceux d’un email et d’une adresse IP (ses codes, sa réserve, ses essais ratés)
 * n’y sont pas : chaque test a son adresse (aide/index.ts). Ni ceux d’un navigateur : chaque contexte du navigateur a son
 * propre jeton (un cookie neuf), qu’aucun autre test ne reprend.
 */
function limitesDesCodes(email: string): string[] {
  const canonique = emailCanonique(email);
  return [`code:email:${canonique}`, `code:reserve:${canonique}`, `code:echecs:${canonique}`].map((cle) => empreinte(`limite:${cle}`));
}

/**
 * Remet à zéro les compteurs des codes de connexion de cet email (sept codes et cinq de réserve, soixante essais ratés par
 * jour), sans toucher au compte.
 */
export async function oublierLimiteDesCodes(email: string): Promise<void> {
  await sql()`delete from rate_limits where key in ${sql()(limitesDesCodes(email))}`;
}

/**
 * Efface toute trace d’un email : son compte (et en cascade ses histoires, sessions, tâches…), ses codes de connexion, sa
 * place sur la liste d’attente, ses compteurs des limites anti-abus (les codes et les essais par email, les mails de la
 * liste, et tout ce que compte son compte : rangé sur son email canonique, il survit au compte effacé), et ses mails dans
 * la boîte des tests. Pour repartir de zéro avec un email réutilisé d’un test à l’autre (les invités :
 * aide/emails.ts) : tout ce que le test lira ensuite vient de lui.
 */
export async function oublierEmail(email: string): Promise<void> {
  const e = email.toLowerCase();
  const attente = empreinte(`attente:${e}`);
  await sql().begin(async (tx) => {
    await tx`delete from users where email = ${e}`;
    await tx`delete from login_codes where email = ${e}`;
    await tx`delete from waitlist where email_hash = ${attente}`;
    const duCompte = (Object.keys(LIMITES_DU_COMPTE) as LimiteDuCompte[]).map((nom) => empreinte(`limite:${cleDeLimiteDuCompte(nom, e)}`));
    await tx`delete from rate_limits where key in ${tx([...limitesDesCodes(e), empreinte(`limite:attente:mail:${attente}`), ...duCompte])}`;
  });
  oublierMails(e);
}
