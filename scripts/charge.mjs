#!/usr/bin/env -S npx tsx
/*
 * Le test de charge (`npm run charge`, README « Le test de charge ») : N parcours complets en même temps, contre le build
 * de production servi en local, comme les tests de bout en bout (`npm run e2e:build`, puis tests/e2e/serveur.mjs : une
 * base neuve, le modèle factice, le faux Whop, la boîte à mails des tests, les clés de test du CAPTCHA). Chaque parcours,
 * par les routes /api que l’appli appelle elle-même, avec ses cookies et son adresse IP :
 *   le laissez-passer du CAPTCHA → l’import d’une conv inventée (la case cochée) → le code, lu dans la boîte à mails →
 *   la connexion → « Qui es-tu ? » et la lecture → le verdict attendu → la commande du rapport → le webhook signé du faux
 *   Whop → la livraison → le rapport débloqué et écrit → quelques messages au chat, qui débitent des bulles → le solde.
 * Il mesure chaque étape et chaque route (p50, p95, max), les erreurs par code, le débit, et surveille la base
 * (pg_stat_activity : connexions ouvertes, pool de l’appli plein, attentes de verrou, requêtes lentes ; pg_stat_database)
 * et le processus du serveur (mémoire, processeur). À la fin, il efface les comptes créés (DELETE /api/compte, la vraie
 * suppression), arrête le serveur et efface sa base ; le rapport s’écrit en markdown (test-results/charge, hors du dépôt).
 *   npm run e2e:build && npm run charge -- --parcours 20 --montee 10
 *   npm run charge -- --parcours 50 --duree 300      50 parcours à la fois pendant 5 minutes (un parcours fini en relance un)
 * E2E_PORT (3460 par défaut) et E2E_DB (blush_e2e_charge) : le port du serveur et sa base, comme pour les tests.
 * Ctrl-C arrête proprement (le rapport de ce qui a été mesuré, le nettoyage) ; un second Ctrl-C coupe tout.
 * Le modèle est factice : ce test mesure le serveur et la base, jamais l’IA ; ni Vercel ni Neon (README).
 * Lancé par tsx (comme scripts/acces.mts) : il lit les réglages des tests et les constantes de src (le jeton du CAPTCHA,
 * la version de la case de l’import) là où ils sont écrits, sans les recopier.
 */
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { setMaxListeners } from "node:events";
import { cpus, loadavg, platform, release } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

/* ———— Les réglages ———— */

/** Les réglages par défaut : une fumée (quelques parcours) plutôt qu’une vraie mesure. */
const DEFAUTS = { parcours: 5, montee: 0, duree: 0, messages: 3, delai: 30, sondage: 1000, lente: 100, releve: 100, garder: false, sortie: "" };

const AIDE = `usage : npm run charge -- [options]
  --parcours N    parcours en même temps (${DEFAUTS.parcours})
  --montee S      la montée en charge : les N premiers parcours partent étalés sur S secondes (${DEFAUTS.montee})
  --duree S       pendant S secondes, chaque parcours fini en relance un (0 : chacun une fois) (${DEFAUTS.duree})
  --messages M    messages au chat par parcours, 10 au plus : les bulles du rapport (${DEFAUTS.messages})
  --delai S       une requête sans réponse en S secondes est une erreur (${DEFAUTS.delai})
  --sondage MS    l’écart entre deux relectures d’un état (le verdict, la livraison, le rapport), comme l’écran (${DEFAUTS.sondage})
  --lente MS      une requête active depuis plus de MS ms dans la base est notée lente (${DEFAUTS.lente})
  --releve MS     l’écart entre deux relevés de pg_stat_activity (${DEFAUTS.releve})
  --sortie F      le rapport markdown (test-results/charge/charge-<date>.md)
  --garder        garde la base à la fin (pour la lire)
E2E_PORT (3460) et E2E_DB (blush_e2e_charge) : le port du serveur et sa base.`;

/**
 * Lit les options de la ligne de commande (`--parcours 20`, `--garder`…) : les réglages, ou une erreur lisible (une
 * option inconnue, un nombre qui n’en est pas un, hors de ses bornes).
 */
export function lireOptions(argv) {
  const o = { ...DEFAUTS };
  const bornes = { parcours: [1, 2000], montee: [0, 3600], duree: [0, 86400], messages: [0, 10], delai: [1, 600], sondage: [100, 60000], lente: [1, 600000], releve: [50, 60000] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--aide" || a === "-h" || a === "--help") return { aide: true };
    if (a === "--garder") {
      o.garder = true;
      continue;
    }
    const nom = a.startsWith("--") ? a.slice(2) : "";
    const valeur = argv[++i];
    if (nom === "sortie") {
      if (!valeur) throw new Error("--sortie attend un chemin");
      o.sortie = valeur;
      continue;
    }
    if (!(nom in bornes)) throw new Error(`option inconnue : ${a}\n${AIDE}`);
    const n = Number(valeur);
    const [min, max] = bornes[nom];
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${nom} attend un nombre entre ${min} et ${max} : « ${valeur ?? ""} »`);
    o[nom] = nom === "parcours" || nom === "messages" ? Math.round(n) : n;
  }
  return o;
}

/* ———— Les mesures ———— */

/** Le centile `p` (0 à 100) de ces valeurs, au rang le plus proche ; null pour une liste vide. */
export function centile(valeurs, p) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.max(0, Math.ceil((p / 100) * tri.length) - 1))];
}

/** Le résumé d’une série de durées (ms) : combien, p50, p95, max ; null pour une série vide. */
export function resume(valeurs) {
  if (!valeurs.length) return null;
  return { n: valeurs.length, p50: centile(valeurs, 50), p95: centile(valeurs, 95), max: Math.max(...valeurs) };
}

/** Le chemin d’une requête rangé comme sa route : un identifiant (uuid) devient le segment dynamique de la route. */
export function routeDe(methode, chemin) {
  const p = chemin.split("?")[0].replace(/^\/api\/paiement\/[0-9a-f-]{36}$/, "/api/paiement/[achat]");
  return `${methode} ${p}`;
}

/**
 * Un bocal à cookies, un par parcours : ce que le serveur pose (Set-Cookie) repart avec les requêtes suivantes, comme
 * dans un navigateur ; un cookie effacé (Max-Age=0, ou une date passée) disparaît. Un seul domaine, un seul chemin : celui
 * du serveur local.
 */
export function nouveauBocal() {
  const cookies = new Map();
  return {
    recevoir(entetes) {
      const poses = typeof entetes.getSetCookie === "function" ? entetes.getSetCookie() : [];
      for (const ligne of poses) {
        const [paire, ...attributs] = ligne.split(";");
        const egal = paire.indexOf("=");
        if (egal < 1) continue;
        const nom = paire.slice(0, egal).trim();
        const valeur = paire.slice(egal + 1).trim();
        const efface = attributs.some((a) => {
          const [cle, v = ""] = a.trim().split("=");
          if (/^max-age$/i.test(cle)) return Number(v) <= 0;
          if (/^expires$/i.test(cle)) return Date.parse(v) <= Date.now();
          return false;
        });
        if (efface || valeur === "") cookies.delete(nom);
        else cookies.set(nom, valeur);
      }
    },
    entete() {
      return [...cookies].map(([n, v]) => `${n}=${v}`).join("; ");
    },
    taille() {
      return cookies.size;
    },
  };
}

/* ———— La conv inventée ———— */

/* Des prénoms inventés pour des convs inventées : jamais une vraie conv (le dépôt est public) */
const COUPLES = [
  ["Noé", "Maëlys"],
  ["Sacha", "Inès"],
  ["Malo", "Jade"],
  ["Timéo", "Lou"],
  ["Elio", "Romy"],
];
const REPLIQUES = [
  ["toi", "salut ! c’était cool hier soir"],
  ["autre", "grave 😊 t’es bien rentré ?"],
  ["toi", "oui, dernier tram de justesse"],
  ["autre", "la chance, moi j’ai marché"],
  ["toi", "tu fais quoi ce week-end ?"],
  ["autre", "pas grand-chose, pourquoi 👀"],
  ["toi", "il y a un concert au parc dimanche"],
  ["autre", "ah carrément, à quelle heure ?"],
  ["toi", "16 h, on peut se retrouver avant"],
  ["autre", "ok pour 15 h 30"],
  ["toi", "je prends des gâteaux"],
  ["autre", "deal 😇"],
  ["toi", "bien dormi ?"],
  ["autre", "bof, les voisins ont fait la fête"],
  ["toi", "aïe, sieste obligatoire"],
  ["autre", "c’est prévu"],
  ["toi", "toujours ok pour dimanche ?"],
  ["autre", "oui oui"],
  ["toi", "à dimanche alors"],
  ["autre", "à dimanche 😘"],
];

const deux = (n) => String(n).padStart(2, "0");

/**
 * Le _chat.txt d’un export WhatsApp iPhone, inventé : 60 messages sur trois soirées, deux prénoms inventés, et un mot
 * propre au parcours `k` (deux parcours n’importent pas le même texte). Celui qui importe (p0) écrit le premier.
 */
export function convInventee(k) {
  const [toi, autre] = COUPLES[k % COUPLES.length];
  const debut = Date.UTC(2026, 8, 4, 19, 2, 11) + (k % 1000) * 60e3;
  const entete = (t) => {
    const d = new Date(t);
    return `[${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}:${deux(d.getUTCSeconds())}]`;
  };
  const lignes = [`${entete(debut - 90e3)} ${autre}: \u200eLes messages et les appels sont chiffrés de bout en bout.`];
  for (let i = 0; i < 60; i++) {
    const [qui, texte] = REPLIQUES[i % REPLIQUES.length];
    const t = debut + Math.floor(i / 20) * 86400e3 + (i % 20) * 6 * 60e3 + ((i * 13) % 50) * 1e3;
    lignes.push(`${entete(t)} ${qui === "toi" ? toi : autre}: ${i === 7 ? `${texte} (parcours ${k})` : texte}`);
  }
  return lignes.join("\n");
}

/* ———— Le rapport ———— */

const ms = (v) => (v == null ? "—" : `${Math.round(v)}`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "—");
/* Une cellule de tableau markdown : sans barre verticale ni retour à la ligne */
const cellule = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");

/**
 * Le rapport markdown d’un lancement : les réglages, le résultat, les étapes, les routes, les erreurs, la base et le
 * serveur, puis ce que ces chiffres ne mesurent pas. `m` : tout ce que main() a relevé (voir `mesures` dans main).
 */
export function rapportMarkdown(m) {
  const l = [];
  const duree = (m.fin - m.debut) / 1000;
  const ok = m.parcours.filter((p) => p.ok).length;
  const lances = m.parcours.length;
  l.push(`# Test de charge — ${new Date(m.debut).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}`, "");
  if (m.interrompu) l.push("**Interrompu** (Ctrl-C ou arrêt du serveur) : les chiffres ne couvrent que ce qui a été mesuré.", "");
  l.push("## Les réglages", "");
  l.push(
    `- ${m.options.parcours} parcours en même temps, montée sur ${m.options.montee} s, ${m.options.duree ? `pendant ${m.options.duree} s (un parcours fini en relance un)` : "chacun une fois"}`,
  );
  l.push(`- ${m.options.messages} message(s) au chat par parcours ; délai d’une requête ${m.options.delai} s ; relecture d’un état toutes les ${m.options.sondage} ms`);
  l.push(
    `- Machine : ${m.machine.systeme}, ${m.machine.coeurs} cœurs, Node ${m.machine.node} ; charge (1 min) ${m.machine.chargeAvant} au départ, ${m.machine.chargeApres} à la fin`,
  );
  l.push(`- Build ${m.build ?? "?"}, commit ${m.commit ?? "?"} ; base \`${m.base}\`, Postgres ${m.postgres.version ?? "?"} (max_connections ${m.postgres.maxConnexions ?? "?"})`);
  l.push(`- Le pool de l’appli : ${m.pool ?? "?"} connexions au plus par processus (src/server/db/index.ts) ; ici, un seul processus \`next start\``, "");

  l.push("## Le résultat", "");
  l.push(`| Parcours lancés | Réussis | Échoués | Durée | Débit | Requêtes | Requêtes par seconde |`, "|---|---|---|---|---|---|---|");
  l.push(
    `| ${lances} | ${ok} | ${lances - ok} | ${duree.toFixed(1)} s | ${duree ? ((ok * 60) / duree).toFixed(1) : "—"} parcours/min | ${m.requetes.length} | ${duree ? (m.requetes.length / duree).toFixed(1) : "—"} |`,
    "",
  );

  l.push(
    "## Les étapes",
    "",
    `Le temps de chaque étape d’un parcours (ms). Celles qui attendent un état (le verdict, la livraison, le rapport, la mémoire avant le chat) relisent sa route toutes les ${m.options.sondage} ms, comme l’écran : leur temps est à ce pas près.`,
    "",
  );
  l.push("| Étape | n | p50 | p95 | max |", "|---|---|---|---|---|");
  for (const [etape, valeurs] of m.etapes) {
    const r = resume(valeurs);
    if (r) l.push(`| ${cellule(etape)} | ${r.n} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} |`);
  }
  l.push("");

  l.push("## Les routes", "", "Chaque requête (ms), réussie ou non.", "");
  l.push("| Route | n | p50 | p95 | max | Erreurs |", "|---|---|---|---|---|---|");
  const parRoute = new Map();
  for (const r of m.requetes) {
    const e = parRoute.get(r.route) ?? { durees: [], erreurs: 0 };
    e.durees.push(r.ms);
    if (r.erreur) e.erreurs++;
    parRoute.set(r.route, e);
  }
  for (const [route, e] of [...parRoute].sort((a, b) => b[1].durees.length - a[1].durees.length)) {
    const r = resume(e.durees);
    l.push(`| \`${cellule(route)}\` | ${r.n} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${e.erreurs} |`);
  }
  l.push("");

  l.push("## Les erreurs", "");
  if (!m.erreurs.size) l.push("Aucune.", "");
  else {
    l.push("Par étape et par code (le statut HTTP et le code d’erreur de l’appli, ou l’erreur du réseau).", "", "| Étape | Code | Nombre |", "|---|---|---|");
    for (const [cle, n] of [...m.erreurs].sort((a, b) => b[1] - a[1])) {
      const [etape, code] = cle.split("\u0000");
      l.push(`| ${cellule(etape)} | ${cellule(code)} | ${n} |`);
    }
    l.push("");
  }
  const anomalies = m.parcours.filter((p) => p.anomalie);
  if (anomalies.length) l.push(`Bulles incohérentes (le solde après le chat n’est pas 10 − les messages) : ${anomalies.length} parcours.`, "");

  l.push("## La base", "");
  const b = m.base_releves;
  if (!b.length) l.push("Aucun relevé.", "");
  else {
    const appli = b.map((r) => r.total);
    /* Une connexion prise : une requête en cours, ou une transaction ouverte entre deux requêtes (le pool ne la rend qu’au commit) */
    const prises = b.map((r) => r.actifs + r.idleTx);
    const pleins = prises.filter((n) => m.pool && n >= m.pool).length;
    const moyenne = (xs) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
    const ligne = (nom, xs) => l.push(`| ${nom} | ${moyenne(xs)} | ${Math.max(...xs)} |`);
    l.push(`${b.length} relevés de pg_stat_activity (toutes les ${m.options.releve} ms), sans la connexion du relevé.`, "");
    l.push("| Mesure | Moyenne | Max |", "|---|---|---|");
    ligne("Connexions ouvertes (l’appli)", appli);
    ligne("Connexions prises (requête en cours ou transaction ouverte)", prises);
    ligne(
      "Requêtes en cours (active)",
      b.map((r) => r.actifs),
    );
    ligne(
      "Transactions ouvertes entre deux requêtes (idle in transaction)",
      b.map((r) => r.idleTx),
    );
    ligne(
      "Requêtes qui attendent un verrou",
      b.map((r) => r.verrous),
    );
    l.push(`| La plus longue requête en cours (ms) | ${ms(b.reduce((s, r) => s + r.plusLongue, 0) / b.length)} | ${ms(Math.max(...b.map((r) => r.plusLongue)))} |`, "");
    l.push(
      `Le pool de l’appli plein (ses ${m.pool ?? "?"} connexions prises à la fois) : ${pct(pleins, b.length)} des relevés. Une requête qui arrive alors attend qu’une connexion se libère (jusqu’à 30 s, connectionTimeoutMillis, puis une erreur) : cette attente ne se voit pas dans la base, elle s’ajoute au temps des routes. Une transaction ouverte pendant que Node calcule (chiffrer, déchiffrer, valider) garde sa connexion sans rien demander à la base.`,
      "",
    );
  }
  if (m.stats) {
    const s = m.stats;
    l.push("Ce que la base a fait pendant le test (pg_stat_database, la différence entre le début et la fin) :", "");
    l.push(
      "| Transactions validées | Annulées | Lignes écrites | Mises à jour | Effacées | Blocs lus sur disque | Lus en mémoire | Interblocages | Fichiers temporaires |",
      "|---|---|---|---|---|---|---|---|---|",
    );
    l.push(
      `| ${s.xact_commit} | ${s.xact_rollback} | ${s.tup_inserted} | ${s.tup_updated} | ${s.tup_deleted} | ${s.blks_read} | ${s.blks_hit} | ${s.deadlocks} | ${s.temp_files} |`,
    );
    l.push(duree ? `\n${(s.xact_commit / duree).toFixed(0)} transactions par seconde.\n` : "");
  }
  l.push(`### Les requêtes lentes (actives depuis plus de ${m.options.lente} ms à un relevé)`, "");
  if (!m.lentes.size) l.push("Aucune.", "");
  else {
    l.push("| Requête (début) | Vue | La plus longue (ms) |", "|---|---|---|");
    for (const [q, e] of [...m.lentes].sort((a, b) => b[1].max - a[1].max).slice(0, 15)) l.push(`| \`${cellule(q)}\` | ${e.vues} | ${ms(e.max)} |`);
    l.push("");
  }

  l.push("## Le serveur", "");
  const s = m.serveur_releves;
  if (!s.length) l.push("Aucun relevé.", "");
  else {
    l.push(
      `Le processus \`next start\` (et ses enfants), relevé par \`ps\` chaque seconde : mémoire ${Math.max(...s.map((r) => r.rssMo))} Mo au plus, processeur ${Math.round(s.reduce((x, r) => x + r.cpu, 0) / s.length)} % en moyenne, ${Math.round(Math.max(...s.map((r) => r.cpu)))} % au plus (100 % : un cœur ; Node n’en use qu’un pour le JavaScript).`,
      "",
    );
  }
  if (m.journal.size) {
    l.push("Les lignes d’erreur et d’alerte de son journal :", "", "| Événement | Niveau | Nombre |", "|---|---|---|");
    for (const [cle, n] of [...m.journal].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      const [evenement, niveau] = cle.split("\u0000");
      l.push(`| ${cellule(evenement)} | ${niveau} | ${n} |`);
    }
    l.push("");
  }

  l.push("## Ce que ce test ne mesure pas", "");
  l.push(
    "- **L’IA** : le modèle est factice (une réponse écrite d’avance, aussitôt). En vrai, un verdict, un rapport ou une réponse du chat prennent de 10 à 60 s : autant de fonctions ouvertes en même temps sur Vercel, et des écritures de plus en base (le suivi des coûts, ai_usage).",
  );
  l.push(
    "- **Vercel** : un seul processus Node sert tout ici, avec son pool de connexions. Sur Vercel, chaque instance de fonction a son propre pool : le nombre de connexions à la base suit le nombre d’instances.",
  );
  l.push("- **Neon** : la base est le Postgres de la machine, sans réseau, sans réveil, sans le pooler de Neon ni sa limite de connexions.");
  l.push("- **Le navigateur** : ni les pages, ni les fichiers statiques, ni le CDN ; seulement les routes /api d’un parcours.");
  l.push("- **Les mails et Whop** : la boîte à mails des tests et le faux Whop répondent tout de suite, sans quota.");
  return l.filter((x) => x !== null).join("\n");
}

/* ———— Le lancement ———— */

/** Attend `ms` millisecondes, ou moins si `signal` s’interrompt avant. */
const dort = (ms, signal) =>
  new Promise((ok) => {
    if (signal?.aborted) return ok();
    const fini = () => {
      clearTimeout(t);
      signal?.removeEventListener("abort", fini);
      ok();
    };
    const t = setTimeout(fini, ms);
    signal?.addEventListener("abort", fini, { once: true });
  });

/** Une étape qui échoue : où, et pourquoi (le statut et le code de l’appli, ou l’erreur du réseau). */
const echec = (etape, code) => Object.assign(new Error(`${etape} : ${code}`), { etape, code });

async function main() {
  let options;
  try {
    options = lireOptions(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(2);
  }
  if (options.aide) {
    console.log(AIDE);
    return;
  }
  /* Les réglages des tests lisent E2E_PORT et E2E_DB à l’import : les nôtres d’abord */
  process.env.E2E_PORT ??= "3460";
  process.env.E2E_DB ??= "blush_e2e_charge";
  const { ADMIN, BOITE_MAILS, CLE, CRON_SECRET, DATABASE_URL, INVITES, PORT, TURNSTILE, URL_APPLI } = await import("../tests/e2e/reglages.ts");
  const { ENTETE_CAPTCHA, JETON_DE_TEST } = await import("../src/lib/captcha.ts");
  const { CASE_IMPORT } = await import("../src/contenu/consentements.ts");
  const nomBase = new URL(DATABASE_URL).pathname.slice(1);

  /* Le port doit être libre : le serveur de ce test, jamais un autre déjà lancé */
  const occupe = await fetch(URL_APPLI, { signal: AbortSignal.timeout(1000) }).then(
    () => true,
    () => false,
  );
  if (occupe) {
    console.error(`✗ le port ${PORT} répond déjà : prends un autre E2E_PORT`);
    process.exit(1);
  }

  const lire = (chemin) => {
    try {
      return readFileSync(join(RACINE, chemin), "utf8");
    } catch {
      return null;
    }
  };
  const pool = Number(/max:\s*(\d+)/.exec(lire("src/server/db/index.ts") ?? "")?.[1]) || null;
  const commit = await new Promise((ok) => execFile("git", ["rev-parse", "--short", "HEAD"], { cwd: RACINE }, (e, out) => ok(e ? null : out.trim())));

  const arret = new AbortController();
  /* Chaque requête en cours écoute l’arrêt (AbortSignal.any) : des centaines à la fois, sans avertissement de fuite */
  setMaxListeners(0, arret.signal);
  let interrompu = false;
  process.on("SIGINT", () => {
    if (arret.signal.aborted) {
      console.error("\n✗ second Ctrl-C : arrêt immédiat (le serveur et la base restent peut-être)");
      process.exit(130);
    }
    interrompu = true;
    console.error("\n… arrêt demandé : plus de nouveau parcours, le rapport et le nettoyage suivent (Ctrl-C encore : arrêt immédiat)");
    arret.abort();
  });

  /* ———— Le serveur, comme celui des tests de bout en bout (playwright.config.ts) ———— */
  const dossier = join(RACINE, "test-results", "charge");
  mkdirSync(dossier, { recursive: true });
  const journalServeur = [];
  const journal = new Map();
  console.log(`… le serveur des tests sur le port ${PORT}, base ${nomBase} recréée`);
  const serveur = spawn(process.execPath, [join(RACINE, "tests/e2e/serveur.mjs")], {
    cwd: RACINE,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      /* Le strict nécessaire du système (USER : l’utilisateur de Postgres en local), comme tests/e2e/serveur.mjs */
      ...Object.fromEntries(
        ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"].filter((c) => process.env[c] !== undefined).map((c) => [c, process.env[c]]),
      ),
      E2E_PORT_SERVEUR: String(PORT),
      E2E_PREPARER: "1",
      DATABASE_URL,
      BLUSH_CLE: CLE,
      BLUSH_IA_FACTICE: "1",
      BLUSH_PAIEMENT_FACTICE: "1",
      BLUSH_URL: URL_APPLI,
      BLUSH_ACCES_LIBRE: INVITES.join(","),
      BLUSH_ALERTES: ADMIN,
      BLUSH_ADMINS: ADMIN,
      CRON_SECRET,
      BLUSH_BETA_FERMEE: "0",
      BLUSH_BOITE_MAILS: BOITE_MAILS,
      TURNSTILE_SECRET_KEY: TURNSTILE.secrete,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE.publique,
    },
  });
  let serveurFini = false;
  serveur.on("exit", () => (serveurFini = true));
  /* Le journal du serveur : gardé dans un fichier, et ses lignes d’erreur ou d’alerte comptées par événement */
  const suivre = (flux) => {
    let reste = "";
    flux.on("data", (morceau) => {
      const lignes = (reste + morceau.toString("utf8")).split("\n");
      reste = lignes.pop() ?? "";
      for (const ligne of lignes) {
        journalServeur.push(ligne);
        if (!ligne.startsWith("{")) continue;
        try {
          const j = JSON.parse(ligne);
          if (j.niveau === "erreur" || j.niveau === "alerte") {
            const cle = `${j.evenement}\u0000${j.niveau}`;
            journal.set(cle, (journal.get(cle) ?? 0) + 1);
          }
        } catch {
          /* une ligne qui n’est pas du journal */
        }
      }
    });
  };
  suivre(serveur.stdout);
  suivre(serveur.stderr);

  /** Arrête le serveur (et next start, son enfant), au plus en 10 s. */
  const arreterServeur = async () => {
    if (serveurFini) return;
    serveur.kill("SIGTERM");
    for (let i = 0; i < 100 && !serveurFini; i++) await dort(100);
    if (!serveurFini) serveur.kill("SIGKILL");
  };

  /* Prêt : la page d’accueil répond, au plus en 2 minutes (la base se recrée et se migre d’abord) */
  const pret = Date.now() + 120_000;
  for (;;) {
    if (serveurFini) {
      console.error(journalServeur.slice(-15).join("\n"));
      console.error("✗ le serveur s’est arrêté au démarrage (le build : `npm run e2e:build` ; Postgres est-il lancé ?)");
      process.exit(1);
    }
    const ok = await fetch(URL_APPLI, { signal: AbortSignal.timeout(5000) }).then(
      (r) => r.status < 500,
      () => false,
    );
    if (ok) break;
    if (Date.now() > pret || arret.signal.aborted) {
      await arreterServeur();
      console.error("✗ le serveur ne répond pas après 2 minutes");
      process.exit(1);
    }
    await dort(500);
  }
  const build = lire(".next/BUILD_ID")?.trim() ?? null;

  /* ———— La surveillance : la base et le processus ———— */
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const [{ version }] = await sql`select current_setting('server_version') as version`;
  const [{ max_connections: maxConnexions }] = await sql`select current_setting('max_connections') as max_connections`;
  const statsDeLaBase = async () =>
    (
      await sql`select xact_commit, xact_rollback, tup_inserted, tup_updated, tup_deleted, blks_read, blks_hit, deadlocks, temp_files
                from pg_stat_database where datname = ${nomBase}`
    )[0];

  const mesures = {
    options,
    debut: Date.now(),
    fin: 0,
    interrompu: false,
    machine: { systeme: `${platform()} ${release()}`, coeurs: cpus().length, node: process.versions.node, chargeAvant: loadavg()[0].toFixed(1), chargeApres: "" },
    build,
    commit,
    base: nomBase,
    pool,
    postgres: { version, maxConnexions },
    parcours: [],
    requetes: [],
    etapes: new Map(),
    erreurs: new Map(),
    base_releves: [],
    lentes: new Map(),
    stats: null,
    serveur_releves: [],
    journal,
  };
  const statsAvant = await statsDeLaBase();

  let releveEnCours = false;
  const releverLaBase = setInterval(async () => {
    if (releveEnCours) return;
    releveEnCours = true;
    try {
      const lignes = await sql`
        select state, wait_event_type, extract(epoch from (now() - query_start)) * 1000 as ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as q
        from pg_stat_activity where datname = ${nomBase} and pid <> pg_backend_pid() and backend_type = 'client backend'`;
      const actives = lignes.filter((r) => r.state === "active");
      mesures.base_releves.push({
        t: Date.now(),
        total: lignes.length,
        actifs: actives.length,
        idleTx: lignes.filter((r) => r.state?.startsWith("idle in transaction")).length,
        verrous: lignes.filter((r) => r.wait_event_type === "Lock").length,
        plusLongue: Math.max(0, ...actives.map((r) => Number(r.ms))),
      });
      for (const r of actives) {
        if (Number(r.ms) < options.lente) continue;
        const e = mesures.lentes.get(r.q) ?? { vues: 0, max: 0 };
        e.vues++;
        e.max = Math.max(e.max, Number(r.ms));
        mesures.lentes.set(r.q, e);
      }
    } catch {
      /* un relevé raté (la base qui s’arrête à la fin) : le suivant */
    } finally {
      releveEnCours = false;
    }
  }, options.releve);

  /* Le processus du serveur et ses descendants (next start, ses travailleurs) : la mémoire et le processeur, par ps */
  const releverLeServeur = setInterval(() => {
    execFile("ps", ["-A", "-o", "pid=,ppid=,rss=,%cpu="], (e, out) => {
      if (e || !serveur.pid) return;
      const procs = out
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/).map(Number));
      const famille = new Set([serveur.pid]);
      for (let change = true; change;) {
        change = false;
        for (const [pid, ppid] of procs)
          if (famille.has(ppid) && !famille.has(pid)) {
            famille.add(pid);
            change = true;
          }
      }
      const miens = procs.filter(([pid]) => famille.has(pid));
      mesures.serveur_releves.push({ t: Date.now(), rssMo: Math.round(miens.reduce((s, p) => s + p[2], 0) / 1024), cpu: miens.reduce((s, p) => s + p[3], 0) });
    });
  }, 1000);

  /* ———— La boîte à mails : un seul lecteur pour tous les parcours ———— */
  const codes = new Map();
  const lus = new Set();
  const lireLaBoite = () => {
    if (!existsSync(BOITE_MAILS)) return;
    for (const f of readdirSync(BOITE_MAILS)) {
      if (!f.endsWith(".json") || lus.has(f)) continue;
      try {
        const mail = JSON.parse(readFileSync(join(BOITE_MAILS, f), "utf8"));
        lus.add(f);
        if (mail.code) codes.set(mail.pour, mail.code);
      } catch {
        /* retiré entre la liste et la lecture : passé */
      }
    }
  };
  const boite = setInterval(lireLaBoite, 100);

  /* ———— Un parcours ———— */
  const run = Date.now().toString(36);
  const noter = (etape, ms) => {
    const v = mesures.etapes.get(etape) ?? [];
    v.push(ms);
    mesures.etapes.set(etape, v);
  };
  const compterErreur = (etape, code) => {
    const cle = `${etape}\u0000${code}`;
    mesures.erreurs.set(cle, (mesures.erreurs.get(cle) ?? 0) + 1);
  };

  /** Le client HTTP d’un parcours : ses cookies, son adresse IP, l’origine de l’appli ; chaque requête mesurée. */
  const client = (k) => {
    const bocal = nouveauBocal();
    const ip = `10.250.${(k >> 8) & 255}.${k & 255}`;
    return {
      bocal,
      async requete(methode, chemin, { json, corps, entetes = {}, signal = arret.signal, commeWhop = false } = {}) {
        const t0 = performance.now();
        const route = routeDe(methode, chemin);
        let statut = 0;
        try {
          const r = await fetch(`${URL_APPLI}${chemin}`, {
            method: methode,
            redirect: "manual",
            headers: {
              "x-forwarded-for": ip,
              ...(commeWhop ? {} : { origin: URL_APPLI }),
              ...(bocal.taille() ? { cookie: bocal.entete() } : {}),
              ...(json !== undefined ? { "content-type": "application/json" } : {}),
              ...entetes,
            },
            body: json !== undefined ? JSON.stringify(json) : corps,
            signal: AbortSignal.any([signal, AbortSignal.timeout(options.delai * 1000)]),
          });
          statut = r.status;
          bocal.recevoir(r.headers);
          const texte = await r.text();
          let donnees = null;
          try {
            donnees = texte ? JSON.parse(texte) : null;
          } catch {
            donnees = texte;
          }
          const erreur = r.ok ? null : `${r.status}${donnees && typeof donnees === "object" && donnees.erreur ? ` ${donnees.erreur}` : ""}`;
          mesures.requetes.push({ route, ms: performance.now() - t0, statut, erreur });
          return { statut, donnees, erreur };
        } catch (e) {
          const code = e?.name === "TimeoutError" ? "délai dépassé" : e?.name === "AbortError" ? "arrêt" : (e?.cause?.code ?? e?.name ?? "réseau");
          mesures.requetes.push({ route, ms: performance.now() - t0, statut, erreur: code });
          return { statut: 0, donnees: null, erreur: code };
        }
      },
    };
  };

  /** Attend un état (`pret` sur la réponse) en relisant la route, comme l’écran ; au plus `maxS` secondes. */
  async function attendre(c, etape, chemin, pret, maxS) {
    const fin = Date.now() + maxS * 1000;
    for (;;) {
      const r = await c.requete("GET", chemin);
      if (r.erreur) throw echec(etape, r.erreur);
      const etat = pret(r.donnees);
      if (etat === true) return r.donnees;
      if (typeof etat === "string") throw echec(etape, etat);
      if (Date.now() > fin) throw echec(etape, `pas prêt en ${maxS} s`);
      if (arret.signal.aborted) throw echec(etape, "arrêt");
      await dort(options.sondage, arret.signal);
    }
  }

  async function unParcours(k) {
    const c = client(k);
    const email = `charge-${run}-${k}@charge.blush.test`;
    const p = { k, email, ok: false, anomalie: false, c, connecte: false };
    mesures.parcours.push(p);
    const debut = performance.now();
    /** Une étape mesurée : son temps, ou son erreur (comptée, et le parcours s’arrête là). */
    const etape = async (nom, travail) => {
      const t0 = performance.now();
      const r = await travail();
      noter(nom, performance.now() - t0);
      return r;
    };
    const exiger = (nom, r, statut = 200) => {
      if (r.erreur || r.statut !== statut) throw echec(nom, r.erreur ?? `${r.statut}`);
      return r.donnees;
    };
    try {
      await etape("captcha", async () => exiger("captcha", await c.requete("POST", "/api/captcha", { entetes: { [ENTETE_CAPTCHA]: JETON_DE_TEST } })));
      const { story } = await etape("import", async () => {
        const fd = new FormData();
        fd.append("fichier", new File([convInventee(k)], "_chat.txt", { type: "text/plain" }));
        fd.append("consentement", CASE_IMPORT.version);
        return exiger("import", await c.requete("POST", "/api/import", { corps: fd }));
      });
      await etape("code demandé", async () => exiger("code demandé", await c.requete("POST", "/api/auth/code", { json: { email }, entetes: { [ENTETE_CAPTCHA]: JETON_DE_TEST } })));
      const code = await etape("mail du code", async () => {
        const fin = Date.now() + 15_000;
        while (!codes.has(email)) {
          if (Date.now() > fin) throw echec("mail du code", "aucun mail en 15 s");
          if (arret.signal.aborted) throw echec("mail du code", "arrêt");
          await dort(50);
        }
        return codes.get(email);
      });
      await etape("connexion", async () => {
        const d = exiger("connexion", await c.requete("POST", "/api/auth/verifier", { json: { email, code } }));
        if (!d?.ok) throw echec("connexion", "code refusé");
      });
      p.connecte = true;
      await etape("lecture lancée", async () =>
        exiger("lecture lancée", await c.requete("POST", "/api/analyse", { json: { me: "p0", pronom: "il", guess: "vus", goal: "ensemble" } })),
      );
      await etape("verdict", () => attendre(c, "verdict", "/api/analyse", (d) => (d?.failed ? `échec ${d.failReason ?? ""}`.trim() : d?.done === true), 120));
      const { achat } = await etape("commande", async () =>
        exiger("commande", await c.requete("POST", "/api/paiement", { json: { offre: "rapport", conv: story.id, renonciation: true } })),
      );
      await etape("webhook", async () => {
        const { webhook } = exiger("webhook", await c.requete("POST", "/api/paiement/factice", { json: { achat, issue: "payer" } }));
        /* Posté comme Whop le poste : ses en-têtes signés, son corps tel quel, sans cookie ni origine de l’appli */
        exiger(
          "webhook",
          await client(k).requete("POST", "/api/paiement/whop", { corps: webhook.corps, entetes: { ...webhook.entetes, "content-type": "application/json" }, commeWhop: true }),
        );
      });
      await etape("livraison", () =>
        attendre(c, "livraison", `/api/paiement/${achat}`, (d) => (d?.statut === "paye" ? true : d?.statut && d.statut !== "en_attente" ? `achat ${d.statut}` : false), 60),
      );
      await etape("rapport écrit", () => attendre(c, "rapport écrit", "/api/rapport", (d) => (d?.echec ? `échec ${d.echec}` : d?.debloque === true && !d.generating), 180));
      let restantes = null;
      for (let i = 0; i < options.messages; i++) {
        const texte = ["et là je lui réponds quoi ?", "elle m’aime bien tu crois ?", "je propose dimanche ou pas ?"][i % 3];
        /* Le premier message attend la mémoire, écrite après le rapport (409 pas_pret) : son attente est une étape à part */
        const t0 = performance.now();
        const fin = Date.now() + 120_000;
        let r;
        for (;;) {
          const t1 = performance.now();
          r = await c.requete("POST", "/api/chat", { json: { texte } });
          if (r.statut !== 409 || r.erreur !== "409 pas_pret") {
            noter("chat (une réponse)", performance.now() - t1);
            break;
          }
          if (Date.now() > fin) throw echec("attente du chat", "pas prêt en 120 s");
          if (arret.signal.aborted) throw echec("attente du chat", "arrêt");
          await dort(options.sondage, arret.signal);
        }
        if (i === 0) noter("attente du chat", performance.now() - t0);
        const d = exiger("chat (une réponse)", r);
        restantes = d?.bulles?.restantes ?? null;
      }
      const compte = await etape("solde", async () => exiger("solde", await c.requete("GET", "/api/compte")));
      /* Le rapport donne 10 bulles, une réponse écrite en coûte une */
      if (compte.bulles !== 10 - options.messages || (options.messages && restantes !== compte.bulles)) {
        p.anomalie = true;
        compterErreur("solde", `bulles ${compte.bulles} (attendu ${10 - options.messages})`);
      }
      noter("parcours entier", performance.now() - debut);
      p.ok = true;
    } catch (e) {
      compterErreur(e.etape ?? "?", e.code ?? e.message);
    }
  }

  /* ———— Les parcours, N à la fois ———— */
  console.log(`… ${options.parcours} parcours à la fois${options.duree ? ` pendant ${options.duree} s` : ""}, montée sur ${options.montee} s`);
  mesures.debut = Date.now();
  const finDuTest = options.duree ? mesures.debut + options.duree * 1000 : 0;
  let suivant = 0;
  const avancement = setInterval(() => {
    const finis = mesures.parcours.filter((p) => p.ok).length;
    console.log(`  ${Math.round((Date.now() - mesures.debut) / 1000)} s : ${mesures.parcours.length} lancés, ${finis} réussis, ${mesures.requetes.length} requêtes`);
  }, 10_000);
  await Promise.all(
    Array.from({ length: options.parcours }, async (_, w) => {
      await dort(options.parcours > 1 ? (options.montee * 1000 * w) / options.parcours : 0, arret.signal);
      do {
        if (arret.signal.aborted || serveurFini) return;
        await unParcours(suivant++);
      } while (finDuTest && Date.now() < finDuTest);
    }),
  );
  mesures.fin = Date.now();
  clearInterval(avancement);
  clearInterval(releverLaBase);
  clearInterval(releverLeServeur);
  clearInterval(boite);
  mesures.interrompu = interrompu || serveurFini;
  mesures.machine.chargeApres = loadavg()[0].toFixed(1);

  /* pg_stat_database se met à jour à la fin des transactions, à la seconde près : on lui laisse le temps */
  await dort(1200);
  try {
    const apres = await statsDeLaBase();
    mesures.stats = Object.fromEntries(Object.keys(apres).map((k) => [k, Number(apres[k]) - Number(statsAvant[k])]));
  } catch {
    mesures.stats = null;
  }

  /* ———— Le rapport ———— */
  const sortie = options.sortie || join(dossier, `charge-${new Date(mesures.debut).toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${options.parcours}.md`);
  writeFileSync(sortie, `${rapportMarkdown(mesures)}\n`);
  writeFileSync(join(dossier, `serveur-${PORT}.log`), `${journalServeur.join("\n")}\n`);

  /* ———— Le nettoyage : les comptes créés, par la vraie suppression, puis le serveur et sa base ———— */
  const aEffacer = mesures.parcours.filter((p) => p.connecte);
  if (!serveurFini && aEffacer.length) {
    console.log(`… ${aEffacer.length} comptes effacés (DELETE /api/compte)`);
    let rates = 0;
    for (let i = 0; i < aEffacer.length; i += 10)
      await Promise.all(
        aEffacer.slice(i, i + 10).map(async (p) => {
          const r = await p.c.requete("DELETE", "/api/compte", { signal: new AbortController().signal });
          if (r.erreur) rates++;
        }),
      );
    const [{ n }] = await sql`select count(*)::int as n from users where email like ${`charge-${run}-%`}`;
    if (rates || n) console.error(`  ${rates} effacement(s) raté(s), ${n} compte(s) restant(s) en base (la base est effacée ensuite${options.garder ? ", sauf --garder" : ""})`);
  }
  await sql.end({ timeout: 5 });
  await arreterServeur();
  if (!options.garder) {
    const serveurPg = new URL(DATABASE_URL);
    serveurPg.pathname = "/postgres";
    const admin = postgres(serveurPg.href, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`drop database if exists "${nomBase}" with (force)`);
    } catch (e) {
      console.error(`✗ la base ${nomBase} n’a pas pu être effacée : ${e.message}`);
    } finally {
      await admin.end({ timeout: 5 });
    }
  }

  const ok = mesures.parcours.filter((p) => p.ok).length;
  const parcoursEntier = resume(mesures.etapes.get("parcours entier") ?? []);
  console.log(
    `${ok === mesures.parcours.length ? "✓" : "✗"} ${ok}/${mesures.parcours.length} parcours réussis en ${((mesures.fin - mesures.debut) / 1000).toFixed(1)} s` +
      (parcoursEntier ? ` (un parcours : p50 ${ms(parcoursEntier.p50)} ms, p95 ${ms(parcoursEntier.p95)} ms)` : ""),
  );
  console.log(`  rapport : ${relative(process.cwd(), sortie)}`);
  process.exit(ok === mesures.parcours.length && !mesures.interrompu ? 0 : 1);
}

/* Lancé comme un script (pas importé par un test) */
const lanceDirectement = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (lanceDirectement) await main();
