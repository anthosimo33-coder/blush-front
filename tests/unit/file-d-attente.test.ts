import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { dossierDeLaFile, etatDeLaFile } from "../../scripts/file-d-attente.mjs";

/*
 * La file d’attente des suites lourdes (scripts/file-d-attente.mjs), à plusieurs processus, comme sur le poste : chaque
 * test lance de vrais processus node (la commande de la file, telle que npm run la lance), chacun avec sa « suite », un
 * petit programme qui note dans un journal quand il commence et quand il finit, et attend que le test le libère. Le
 * journal dit qui a tourné, dans quel ordre, et combien à la fois ; etatDeLaFile dit les places et les tickets.
 *
 * Les délais sont larges, pour un poste chargé : ce qui doit arriver a 60 s (LONGTEMPS_MS) ; la reprise d’un mort a
 * 15 s (REPRISE_MS), sous les 30 s de silence, pour qu’une reprise au silence ne passe pas pour elle ; « rien n’arrive »
 * se lit après CALME_MS, plus de deux regards de la file. Les heures : une horloge à part (chargée par --require)
 * décale Date.now de ce que dit un fichier, et aussi performance.now pour une veille comme sur Mac (l’horloge monotone y
 * avance pendant la veille ; sous Linux, seul le mur saute) : pour sauter 4 h d’un coup (un réveil) ou avancer de 5 s à
 * chaque regard (30 s de silence sans attendre 30 s). Chaque test a son dossier, et le retire avec tous ses processus
 * (des groupes à eux, tués d’un coup) même s’il échoue ; ils tournent ensemble, dans n’importe quel ordre.
 */

/** Le script de la file, tel que npm run le lance. */
const SCRIPT = fileURLToPath(new URL("../../scripts/file-d-attente.mjs", import.meta.url));

/** La racine du dépôt, où lire les vraies commandes de package.json. */
const RACINE_DU_DEPOT = fileURLToPath(new URL("../..", import.meta.url));

/** Ce que le test laisse passer pour dire que rien n’arrive : plus de deux regards de la file (1 à 1,25 s chacun). */
const CALME_MS = 2500;

/** L’attente au plus de ce qui doit arriver. */
const LONGTEMPS_MS = 60_000;

/** L’attente au plus de la reprise d’un mort : sous les 30 s de silence de la file. */
const REPRISE_MS = 15_000;

/** Le saut d’un réveil après une longue veille. */
const QUATRE_HEURES = 4 * 60 * 60 * 1000;

/** Une fin sans erreur. */
const OK = { code: 0, signal: null };

/** Les réglages de la file (et ce qui la ferait sauter) que le test ne laisse pas passer de son propre environnement : il tourne lui-même dans npm run check, ou dans la CI. */
const REGLAGES = ["BLUSH_SANS_FILE", "GITHUB_ACTIONS", "BLUSH_FILE_TENUE", "BLUSH_FILE_PLACES", "BLUSH_FILE_MAX_MIN", "BLUSH_FILE_DOSSIER", "PWDEBUG", "CI", "npm_lifecycle_event"];

/**
 * La suite lancée par la file à la place d’une vraie : elle note qu’elle commence (son numéro de processus et
 * BLUSH_FILE_TENUE), attend sa libération (un fichier à son nom dans fins/) ou la fin de sa durée, note qu’elle finit,
 * et sort avec le code demandé (SIGTERM : tuée par ce signal). Elle s’arrête seule si le dossier du test a disparu, ou
 * au bout de 5 min : une suite oubliée ne survit pas au test.
 */
const SUITE = `const { appendFileSync, existsSync } = require("node:fs");
const [journal, fins, nom, code, duree] = process.argv.slice(2);
appendFileSync(journal, "debut " + nom + " " + process.pid + " " + (process.env.BLUSH_FILE_TENUE || "-") + "\\n");
const ne = Date.now();
setInterval(() => {
  if (!existsSync(fins) || Date.now() - ne > 300000) process.exit(99);
  if (!existsSync(fins + "/" + nom) && !(Number(duree) > 0 && Date.now() - ne > Number(duree))) return;
  appendFileSync(journal, "fin " + nom + "\\n");
  if (code === "SIGTERM") process.kill(process.pid, "SIGTERM");
  else process.exit(Number(code));
}, 50);
`;

/**
 * L’horloge des tests, chargée avant la file : Date.now décalé du nombre de ms écrit dans `fichier` (le dernier lu, si
 * le fichier manque) et, si `eveilAussi`, performance.now du même décalage, comme une veille sur Mac.
 */
const horlogeDecalee = (fichier: string, eveilAussi: boolean) => `const { readFileSync } = require("node:fs");
let decalage = 0;
const lire = () => {
  try { decalage = Number(readFileSync(${JSON.stringify(fichier)}, "utf8")) || 0; } catch {}
  return decalage;
};
const mur = Date.now;
Date.now = () => mur() + lire();
${eveilAussi ? "const eveil = performance.now.bind(performance);\nperformance.now = () => eveil() + lire();" : ""}
`;

/** Les horloges décalées par le test : le mur seul (une veille sous Linux, ou le temps qui passe vite), ou le mur et l’horloge monotone ensemble (une veille sur Mac). */
type Horloge = "mur" | "mur-et-eveil";

/** Comment un processus lancé par le test a fini. */
type Fin = { code: number | null; signal: NodeJS.Signals | null };

/** Un processus lancé par le test, et ce qu’il a écrit. */
type Lance = { nom: string; pid: number; fin: () => Promise<Fin>; estFini: () => boolean; sortie: () => string; erreurs: () => string };

/** Ce qu’on règle d’un lancement de la file : son environnement, le code et la durée de sa suite, des arguments en plus pour elle, les horloges décalées. */
type Reglage = { env?: Record<string, string>; code?: string; duree?: number; extra?: string[]; horloge?: Horloge; commande?: string[]; args?: string[] };

/** Attend `ms` millisecondes. */
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un processus vit-il ? */
function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** L’environnement du test sans les réglages de la file (REGLAGES), ni les rappels de mise à jour de npm. */
function envPropre(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_UPDATE_NOTIFIER: "1", npm_config_update_notifier: "false" };
  for (const cle of REGLAGES) delete env[cle];
  return env;
}

/** Attend que `condition` soit vraie, au plus `delai` ms. */
async function attendreQue(quoi: string, condition: () => boolean, delai = LONGTEMPS_MS) {
  const limite = Date.now() + delai;
  while (!condition()) {
    if (Date.now() > limite) throw new Error(`Toujours pas au bout de ${delai / 1000} s : ${quoi}`);
    await attendre(50);
  }
}

/** La promesse, ou une erreur lisible au bout de `delai` ms. */
async function sousPeu<T>(promesse: Promise<T>, quoi: string, delai = LONGTEMPS_MS): Promise<T> {
  let minuterie: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_, rejeter) => (minuterie = setTimeout(() => rejeter(new Error(`Toujours pas au bout de ${delai / 1000} s : ${quoi}`)), delai))),
    ]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** Le terrain d’un test : son dossier (la racine de sa file, son journal, ses libérations, son horloge), ses lancements, et leur nettoyage à la fin, même s’il échoue. */
function terrain(onTestFinished: (fn: () => void) => void) {
  const ici = mkdtempSync(join(tmpdir(), "file-d-attente-"));
  /* La racine n’existe pas encore : la file la crée (en 1777) */
  const racine = join(ici, "file");
  const dossier = dossierDeLaFile(racine);
  const journal = join(ici, "journal");
  const fins = join(ici, "fins");
  const horloge = join(ici, "horloge");
  const suite = join(ici, "suite.cjs");
  const horloges: Record<Horloge, string> = { mur: join(ici, "horloge-mur.cjs"), "mur-et-eveil": join(ici, "horloge-mur-et-eveil.cjs") };
  mkdirSync(fins);
  writeFileSync(journal, "");
  writeFileSync(suite, SUITE);
  writeFileSync(horloges.mur, horlogeDecalee(horloge, false));
  writeFileSync(horloges["mur-et-eveil"], horlogeDecalee(horloge, true));
  const groupes: number[] = [];
  onTestFinished(() => {
    for (const g of groupes) {
      try {
        process.kill(-g, "SIGKILL");
      } catch {
        /* le groupe est déjà fini */
      }
    }
    rmSync(ici, { recursive: true, force: true });
  });

  /** Lance un processus dans un groupe à lui (detached), pour le tuer à la fin avec ce qu’il a lancé. */
  const demarrer = (nom: string, fichier: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Lance => {
    const p = spawn(fichier, args, { cwd: options.cwd, env: { ...envPropre(), BLUSH_FILE_DOSSIER: racine, ...options.env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    if (!p.pid) throw new Error(`${nom} n’a pas pu partir`);
    groupes.push(p.pid);
    let sortie = "";
    let erreurs = "";
    let finie: Fin | null = null;
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (erreurs += d));
    /* exit, pas close : une suite orpheline garde les tuyaux ouverts après la mort de la file */
    const fini = new Promise<Fin>((resolve) => p.on("exit", (code, signal) => resolve((finie = { code, signal }))));
    return { nom, pid: p.pid, fin: () => sousPeu(fini, `la fin de ${nom}`), estFini: () => finie !== null, sortie: () => sortie, erreurs: () => erreurs };
  };

  const etat = () => etatDeLaFile({ dossier: racine });
  const lignes = () => readFileSync(journal, "utf8").split("\n").filter(Boolean);
  const debuts = () => lignes().flatMap((l) => (l.startsWith("debut ") ? [l.split(" ")[1]!] : []));
  const t = {
    ici,
    racine,
    dossier,
    etat,
    lignes,
    debuts,
    /** La file avec une suite (ou `commande`, ou d’autres arguments que « -- commande »). */
    lancer: (nom: string, o: Reglage = {}) => {
      const commande = o.commande ?? [process.execPath, suite, journal, fins, nom, o.code ?? "0", String(o.duree ?? 0), ...(o.extra ?? [])];
      return demarrer(nom, process.execPath, [...(o.horloge ? ["--require", horloges[o.horloge]] : []), SCRIPT, ...(o.args ?? ["--", ...commande])], { env: o.env });
    },
    /** npm dans un projet à soi. */
    npm: (projet: string, args: string[]) => demarrer(`npm ${args.join(" ")}`, "npm", args, { cwd: projet }),
    /** Un processus vivant qui ne fait rien : le titulaire d’un verrou ou d’une place posés par le test. */
    temoin: () => demarrer("témoin", process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
    liberer: (nom: string) => writeFileSync(join(fins, nom), ""),
    pidDeSuite: (nom: string) =>
      Number(
        lignes()
          .find((l) => l.startsWith(`debut ${nom} `))
          ?.split(" ")[2],
      ),
    ticketDe: (l: Lance) => etat().tickets.find((x) => x.pid === l.pid),
    placeDe: (l: Lance) => etat().places.find((x) => x.pid === l.pid),
    attendreDebut: (nom: string, delai = LONGTEMPS_MS) => attendreQue(`le début de ${nom}`, () => debuts().includes(nom), delai),
    attendreTicket: (l: Lance) => attendreQue(`le ticket de ${l.nom}`, () => etat().tickets.some((x) => x.pid === l.pid)),
    /** Le plus de suites qui ont tourné en même temps, d’après le journal. */
    auPlusEnMemeTemps: () => {
      let n = 0;
      let max = 0;
      for (const l of lignes()) max = Math.max(max, (n += l.startsWith("debut ") ? 1 : -1));
      return max;
    },
    /** Décale les horloges des processus lancés avec `horloge` (écrit d’un coup : un fichier lu à moitié serait un saut). */
    avancerHorloge: (ms: number) => {
      writeFileSync(`${horloge}.tmp`, String(ms));
      renameSync(`${horloge}.tmp`, horloge);
    },
  };
  return t;
}

describe.concurrent("la file d’attente des suites lourdes, à plusieurs processus", () => {
  /* Le plus long (20 s d’attente du verrou), en tête : dans l’ordre, il tourne pendant les autres */
  it(
    "un verrou qu’on ne peut pas reprendre : la suite renonce au bout de 20 s, sur une erreur, sans ticket ; un fichier posé à sa place est repris",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const fige = terrain(onTestFinished);
      const fichier = terrain(onTestFinished);
      /* Le jeton d’un processus mort (repris d’ordinaire) dans un dossier sans droit d’écriture : il ne s’efface pas. Les droits rendus avant que le terrain s’efface (les fins de test passent en pile) */
      const verrouFige = join(fige.dossier, "verrou");
      mkdirSync(verrouFige, { recursive: true });
      writeFileSync(join(verrouFige, "999999999-mort"), "");
      chmodSync(verrouFige, 0o555);
      onTestFinished(() => chmodSync(verrouFige, 0o755));
      /* Un fichier à la place du dossier du verrou : repris comme un verrou vide, passé 10 s */
      mkdirSync(fichier.dossier, { recursive: true });
      writeFileSync(join(fichier.dossier, "verrou"), "");
      const debut = Date.now();
      const x = fige.lancer("X");
      const w = fichier.lancer("W");
      await fichier.attendreDebut("W");
      expect(Date.now() - debut).toBeGreaterThan(9000);
      fichier.liberer("W");
      expect(await w.fin()).toEqual(OK);
      expect(await x.fin()).toEqual({ code: 1, signal: null });
      expect(Date.now() - debut).toBeGreaterThan(19_000);
      expect(x.erreurs()).toContain("ne peut pas être repris");
      expect(fige.debuts()).toEqual([]);
      expect(fige.etat()).toEqual({ places: [], tickets: [] });
    },
  );

  it("une place : une seule suite à la fois, servies dans leur ordre d’arrivée", { timeout: 240_000 }, async ({ expect, onTestFinished }) => {
    const t = terrain(onTestFinished);
    const a = t.lancer("A");
    await t.attendreDebut("A");
    const b = t.lancer("B");
    await t.attendreTicket(b);
    const c = t.lancer("C");
    await t.attendreTicket(c);
    await attendre(CALME_MS);
    expect(t.debuts()).toEqual(["A"]);
    expect(t.etat().tickets.map((x) => x.pid)).toEqual([b.pid, c.pid]);
    t.liberer("A");
    await t.attendreDebut("B");
    await attendre(CALME_MS);
    expect(t.debuts()).toEqual(["A", "B"]);
    t.liberer("B");
    await t.attendreDebut("C");
    t.liberer("C");
    for (const l of [a, b, c]) expect(await l.fin()).toEqual(OK);
    expect(t.auPlusEnMemeTemps()).toBe(1);
    expect(t.etat()).toEqual({ places: [], tickets: [] });
  });

  it("cinq suites arrivées ensemble : toutes servies, jamais deux à la fois", { timeout: 240_000 }, async ({ expect, onTestFinished }) => {
    const t = terrain(onTestFinished);
    const lances = ["A", "B", "C", "D", "E"].map((nom) => t.lancer(nom, { duree: 300 }));
    for (const l of lances) expect(await l.fin()).toEqual(OK);
    expect(t.debuts().sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(t.auPlusEnMemeTemps()).toBe(1);
  });

  it(
    "l’ordre d’arrivée tient même devant une place libre : un ticket plus ancien, arrêté (Ctrl-Z), passe devant ; mort, il est repris",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const h = t.lancer("H");
      await t.attendreDebut("H");
      const e = t.lancer("E");
      await t.attendreTicket(e);
      process.kill(e.pid, "SIGSTOP");
      t.liberer("H");
      expect(await h.fin()).toEqual(OK);
      const f = t.lancer("F");
      await t.attendreTicket(f);
      await attendre(CALME_MS);
      expect(t.etat().places).toEqual([]);
      expect(t.debuts()).toEqual(["H"]);
      process.kill(e.pid, "SIGKILL");
      await t.attendreDebut("F", REPRISE_MS);
      t.liberer("F");
      expect(await f.fin()).toEqual(OK);
    },
  );

  it(
    "deux places (BLUSH_FILE_PLACES=2) : deux suites ensemble, jamais trois ; une suite réglée sur une place attend qu’il n’y en ait plus aucune",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const deux = { env: { BLUSH_FILE_PLACES: "2" } };
      const a = t.lancer("A", deux);
      await t.attendreDebut("A");
      const b = t.lancer("B", deux);
      await t.attendreDebut("B");
      const c = t.lancer("C", deux);
      await t.attendreTicket(c);
      const d = t.lancer("D", { env: { BLUSH_FILE_PLACES: "1" } });
      await t.attendreTicket(d);
      await attendre(CALME_MS);
      expect(t.debuts()).toEqual(["A", "B"]);
      t.liberer("A");
      await t.attendreDebut("C");
      t.liberer("B");
      expect(await b.fin()).toEqual(OK);
      await attendre(CALME_MS);
      expect(t.debuts()).toEqual(["A", "B", "C"]);
      t.liberer("C");
      await t.attendreDebut("D");
      t.liberer("D");
      for (const l of [a, b, c, d]) expect(await l.fin()).toEqual(OK);
      expect(t.auPlusEnMemeTemps()).toBe(2);
    },
  );

  it(
    "une place dont le processus est mort est reprise, mais pas tant que sa suite tourne encore (la file tuée par SIGKILL)",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const a = t.lancer("A");
      await t.attendreDebut("A");
      const suiteA = t.pidDeSuite("A");
      await attendreQue("le numéro de la suite dans sa place", () => t.placeDe(a)?.enfant === suiteA);
      const n = t.lancer("N");
      await t.attendreTicket(n);
      process.kill(a.pid, "SIGKILL");
      await a.fin();
      await attendre(CALME_MS);
      expect(t.debuts()).toEqual(["A"]);
      expect(t.etat().places).toMatchObject([{ pid: a.pid, enfant: suiteA, etat: "orpheline", compte: true }]);
      process.kill(suiteA, "SIGKILL");
      await t.attendreDebut("N", REPRISE_MS);
      t.liberer("N");
      expect(await n.fin()).toEqual(OK);
    },
  );

  it(
    "le battement : arrêtées (Ctrl-Z), une place et un ticket ne sont repris qu’après 30 s de silence ; relancée, la suite se réinscrit et ne rend que sa place",
    { timeout: 300_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const h = t.lancer("H");
      await t.attendreDebut("H");
      const w = t.lancer("W");
      await t.attendreTicket(w);
      /* Elles battent : le ticket à chaque regard, la place toutes les 5 s, avec sa tenue */
      const ticketAvant = t.ticketDe(w)!.battu;
      const placeAvant = t.placeDe(h)!.battu;
      await attendreQue("un battement du ticket de W", () => (t.ticketDe(w)?.battu ?? 0) > ticketAvant);
      await attendreQue("un battement de la place de H", () => (t.placeDe(h)?.battu ?? 0) > placeAvant && (t.placeDe(h)?.tenue ?? 0) > 0);
      process.kill(h.pid, "SIGSTOP");
      process.kill(w.pid, "SIGSTOP");
      const n = t.lancer("N", { horloge: "mur" });
      await t.attendreTicket(n);
      await attendre(CALME_MS);
      expect(t.debuts()).toEqual(["H"]);
      /* L’horloge de N avance de 5 s à chacun de ses regards (moins qu’un saut de réveil) : 30 s de silence en quelques secondes */
      let decalage = 0;
      while (!t.debuts().includes("N")) {
        decalage += 5000;
        if (decalage > 120_000) throw new Error("N n’est toujours pas servie, son horloge avancée de 2 min");
        const reel = Date.now();
        t.avancerHorloge(decalage);
        await attendreQue(`un regard de N à +${decalage / 1000} s`, () => t.debuts().includes("N") || (t.ticketDe(n)?.battu ?? 0) >= reel + decalage - 1);
      }
      t.avancerHorloge(0);
      expect(decalage).toBeGreaterThan(5000);
      expect(t.etat().tickets.map((x) => x.pid)).not.toContain(w.pid);
      /* Relancées : H se réinscrit sous un autre nom (N a pris le sien), W recrée son ticket et attend */
      process.kill(h.pid, "SIGCONT");
      process.kill(w.pid, "SIGCONT");
      await attendreQue("la réinscription de H", () => h.erreurs().includes("reprise de nouveau") && !!t.placeDe(h));
      await attendreQue("le ticket de W recréé", () => !!t.ticketDe(w));
      t.liberer("H");
      expect(await h.fin()).toEqual(OK);
      expect(t.etat().places.map((p) => p.pid)).toEqual([n.pid]);
      await attendre(CALME_MS);
      expect(t.debuts()).toEqual(["H", "N"]);
      t.liberer("N");
      await t.attendreDebut("W");
      t.liberer("W");
      for (const l of [n, w]) expect(await l.fin()).toEqual(OK);
    },
  );

  for (const { horloge, ou } of [
    { horloge: "mur", ou: "sous Linux, seul le mur saute" },
    { horloge: "mur-et-eveil", ou: "sur Mac, l’horloge monotone saute avec lui" },
  ] as const)
    it(
      `le réveil d’une longue veille (${ou}) : les heures sautent de 4 h, personne n’est repris tant qu’il peut encore battre, et la tenue ne compte pas la veille`,
      { timeout: 240_000 },
      async ({ expect, onTestFinished }) => {
        const t = terrain(onTestFinished);
        const h = t.lancer("H", { horloge });
        await t.attendreDebut("H");
        const w1 = t.lancer("W1", { horloge });
        await t.attendreTicket(w1);
        const w2 = t.lancer("W2", { horloge });
        await t.attendreTicket(w2);
        /* Au réveil, H et W1 n’ont pas encore battu (arrêtées ici) : W2 les voit sans battement depuis 4 h, et la place de H prise il y a 4 h */
        process.kill(h.pid, "SIGSTOP");
        process.kill(w1.pid, "SIGSTOP");
        const reel = Date.now();
        t.avancerHorloge(QUATRE_HEURES);
        await attendreQue("un regard de W2 après le réveil", () => (t.ticketDe(w2)?.battu ?? 0) >= reel + QUATRE_HEURES - 1);
        await attendre(CALME_MS);
        expect(t.debuts()).toEqual(["H"]);
        expect(t.placeDe(h)).toMatchObject({ compte: true });
        expect(t.etat().tickets.map((x) => x.pid)).toEqual([w1.pid, w2.pid]);
        /* H et W1 battent de nouveau : la tenue de H ne compte pas la veille, et W1 reste devant W2 */
        process.kill(h.pid, "SIGCONT");
        process.kill(w1.pid, "SIGCONT");
        await attendreQue("un battement de H après le réveil", () => (t.placeDe(h)?.battu ?? 0) >= reel + QUATRE_HEURES - 1);
        expect(t.placeDe(h)!.tenue).toBeLessThan(10 * 60_000);
        await attendre(CALME_MS);
        expect(t.debuts()).toEqual(["H"]);
        t.liberer("H");
        await t.attendreDebut("W1");
        await attendre(CALME_MS);
        expect(t.debuts()).toEqual(["H", "W1"]);
        t.liberer("W1");
        await t.attendreDebut("W2");
        t.liberer("W2");
        for (const l of [h, w1, w2]) expect(await l.fin()).toEqual(OK);
        expect(t.auPlusEnMemeTemps()).toBe(1);
      },
    );

  it(
    "le plafond de tenue (BLUSH_FILE_MAX_MIN) : au-delà, une place vivante ne compte plus, sans être effacée ; une orpheline est effacée",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const vite = { env: { BLUSH_FILE_MAX_MIN: "0.05" } };
      const h = t.lancer("H", vite);
      await t.attendreDebut("H");
      expect(t.placeDe(h)).toMatchObject({ plafond: 3000 });
      const n = t.lancer("N");
      await t.attendreDebut("N");
      expect(t.lignes()).not.toContain("fin H");
      expect(t.etat().places).toMatchObject([
        { pid: h.pid, etat: "vivante", compte: false },
        { pid: n.pid, compte: true },
      ]);
      t.liberer("H");
      t.liberer("N");
      for (const l of [h, n]) expect(await l.fin()).toEqual(OK);
      expect(t.etat().places).toEqual([]);
      /* La file de O tuée, sa suite vivante : au-delà de son plafond, sa place est effacée (sa suite aurait pu finir, et son numéro servir à un autre) */
      const o = t.lancer("O", vite);
      await t.attendreDebut("O");
      const suiteO = t.pidDeSuite("O");
      await attendreQue("le numéro de la suite dans sa place", () => t.placeDe(o)?.enfant === suiteO);
      process.kill(o.pid, "SIGKILL");
      await o.fin();
      const p = t.lancer("P");
      await t.attendreDebut("P");
      expect(vivant(suiteO)).toBe(true);
      expect(t.etat().places.map((x) => x.pid)).toEqual([p.pid]);
      t.liberer("O");
      t.liberer("P");
      expect(await p.fin()).toEqual(OK);
      await attendreQue("la fin de la suite de O", () => !vivant(suiteO));
    },
  );

  it("Ctrl-C, kill ou le terminal fermé pendant l’attente : le ticket part, et la suite meurt du même signal", { timeout: 240_000 }, async ({ expect, onTestFinished }) => {
    const t = terrain(onTestFinished);
    const h = t.lancer("H");
    await t.attendreDebut("H");
    const attentes = (["SIGINT", "SIGTERM", "SIGHUP"] as const).map((signal) => ({ signal, l: t.lancer(`W-${signal}`) }));
    for (const { l } of attentes) await t.attendreTicket(l);
    for (const { signal, l } of attentes) process.kill(l.pid, signal);
    for (const { signal, l } of attentes) expect(await l.fin()).toEqual({ code: null, signal });
    expect(t.etat().tickets).toEqual([]);
    expect(t.debuts()).toEqual(["H"]);
    t.liberer("H");
    expect(await h.fin()).toEqual(OK);
  });

  it(
    "la commande : sa suite tourne avec sa place (et son numéro) et BLUSH_FILE_TENUE ; elle sort avec son code, 128 + n tuée par un signal, 1 sans commande, et rend sa place",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const a = t.lancer("A", { code: "3" });
      await t.attendreDebut("A");
      await attendreQue("le numéro de la suite dans sa place", () => t.placeDe(a)?.enfant === t.pidDeSuite("A"));
      expect(t.lignes()).toEqual([`debut A ${t.pidDeSuite("A")} 1`]);
      t.liberer("A");
      expect(await a.fin()).toEqual({ code: 3, signal: null });
      const b = t.lancer("B", { code: "SIGTERM" });
      await t.attendreDebut("B");
      t.liberer("B");
      expect(await b.fin()).toEqual({ code: 143, signal: null });
      const c = t.lancer("C", { commande: [join(t.ici, "il-n-existe-pas")] });
      expect(await c.fin()).toEqual({ code: 1, signal: null });
      expect(t.etat()).toEqual({ places: [], tickets: [] });
    },
  );

  it(
    "hors file : BLUSH_SANS_FILE=1, GITHUB_ACTIONS=true, une suite lancée de l’intérieur (BLUSH_FILE_TENUE), PWDEBUG, --ui, --debug, --page ; ni CI=true ni PWDEBUG=0 ne suffisent",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const h = t.lancer("H");
      await t.attendreDebut("H");
      const cas: Reglage[] = [
        { env: { BLUSH_SANS_FILE: "1" } },
        { env: { GITHUB_ACTIONS: "true" } },
        { env: { BLUSH_FILE_TENUE: "1" } },
        { env: { PWDEBUG: "1" } },
        { extra: ["--ui"] },
        { extra: ["--ui-port=0"] },
        { extra: ["--debug"] },
        { extra: ["--page"] },
      ];
      const lances = cas.map((reglage, i) => {
        t.liberer(`X${i}`);
        return t.lancer(`X${i}`, reglage);
      });
      for (const l of lances) expect(await l.fin()).toEqual(OK);
      expect(t.debuts()).toHaveLength(1 + cas.length);
      /* Playwright lit PWDEBUG=0 ou false comme éteint : ces suites-là attendent leur tour */
      const casEnFile: Reglage[] = [{ env: { CI: "true" } }, { env: { PWDEBUG: "0" } }, { env: { PWDEBUG: "false" } }];
      const enFile = casEnFile.map((reglage, i) => t.lancer(`F${i}`, reglage));
      for (const l of enFile) await t.attendreTicket(l);
      await attendre(CALME_MS);
      expect(t.debuts()).toHaveLength(1 + cas.length);
      for (const l of enFile) process.kill(l.pid, "SIGTERM");
      for (const l of enFile) expect(await l.fin()).toEqual({ code: null, signal: "SIGTERM" });
      t.liberer("H");
      expect(await h.fin()).toEqual(OK);
    },
  );

  it(
    "par npm : les arguments arrivent jusqu’à la suite (check --, e2e --, test, couverture), e2e -- --ui passe hors file, et le script tourne par un lien symbolique",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      /* Un projet à soi : les commandes de package.json telles quelles, le script par un lien, une fausse suite qui écrit ses arguments */
      const projet = join(t.ici, "projet");
      const recus = join(t.ici, "recus.jsonl");
      mkdirSync(join(projet, "scripts"), { recursive: true });
      mkdirSync(join(projet, "node_modules", ".bin"), { recursive: true });
      symlinkSync(SCRIPT, join(projet, "scripts", "file-d-attente.mjs"));
      writeFileSync(join(projet, "scripts", "prompts.mjs"), "");
      writeFileSync(join(projet, "recu.cjs"), `require("node:fs").appendFileSync(${JSON.stringify(recus)}, JSON.stringify(process.argv.slice(2)) + "\\n");`);
      for (const outil of ["playwright", "vitest"]) {
        const bin = join(projet, "node_modules", ".bin", outil);
        writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${join(projet, "recu.cjs")}" ${outil} "$@"\n`);
        chmodSync(bin, 0o755);
      }
      const { scripts } = JSON.parse(readFileSync(join(RACINE_DU_DEPOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
      const commandes = { check: scripts.check, "check:suite": "node recu.cjs check:suite", e2e: scripts.e2e, test: scripts.test, couverture: scripts.couverture };
      writeFileSync(join(projet, "package.json"), JSON.stringify({ name: "essai-file", private: true, scripts: commandes }));
      const lus = () =>
        existsSync(recus)
          ? readFileSync(recus, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => JSON.parse(l) as string[])
          : [];
      for (const args of [
        ["run", "check", "--", "--reporter=dot", "-t", "un nom à espaces"],
        ["run", "e2e", "--", "--project=webkit-iphone", "--grep", "a b"],
        ["test", "--", "tests/unit/un.test.ts"],
        ["run", "couverture", "--", "--reporter=dot"],
      ])
        expect(await t.npm(projet, args).fin()).toEqual(OK);
      expect(lus()).toEqual([
        ["check:suite", "--reporter=dot", "-t", "un nom à espaces"],
        ["playwright", "test", "--project=webkit-iphone", "--grep", "a b"],
        ["vitest", "run", "tests/unit/un.test.ts"],
        ["vitest", "run", "--coverage", "--reporter=dot"],
      ]);
      /* Une place prise : e2e -- --ui part tout de suite, check attend son tour */
      const h = t.lancer("H");
      await t.attendreDebut("H");
      expect(await t.npm(projet, ["run", "e2e", "--", "--ui"]).fin()).toEqual(OK);
      expect(lus().at(-1)).toEqual(["playwright", "test", "--ui"]);
      const check = t.npm(projet, ["run", "check"]);
      await attendreQue("le ticket de npm run check", () => t.etat().tickets.some((x) => x.quoi === "npm run check"));
      await attendre(CALME_MS);
      expect(lus()).toHaveLength(5);
      process.kill(t.etat().tickets[0]!.pid!, "SIGTERM");
      await check.fin();
      expect(t.etat().tickets).toEqual([]);
      t.liberer("H");
      expect(await h.fin()).toEqual(OK);
    },
  );

  it(
    "npm run file (--etat) lit sans rien changer ; le dossier de la file naît en 1777, et renaît s’il disparaît pendant l’attente",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const rien = t.lancer("état vide", { args: ["--etat"] });
      expect(await rien.fin()).toEqual(OK);
      expect(rien.sortie()).toBe("Aucune suite lourde en cours.\n");
      expect(existsSync(t.racine)).toBe(false);
      /* Une place et un ticket morts, que personne n’a encore repris : --etat les dit, et les laisse */
      const h = t.lancer("H");
      await t.attendreDebut("H");
      const w = t.lancer("W");
      await t.attendreTicket(w);
      for (const d of [t.racine, t.dossier]) expect(statSync(d).mode & 0o7777).toBe(0o1777);
      const suiteH = t.pidDeSuite("H");
      for (const pid of [w.pid, h.pid, suiteH]) process.kill(pid, "SIGKILL");
      await w.fin();
      await h.fin();
      await attendreQue("la fin de la suite de H", () => !vivant(suiteH));
      const avant = readdirSync(t.dossier).sort();
      const lu = t.lancer("état", { args: ["--etat"] });
      expect(await lu.fin()).toEqual(OK);
      expect(lu.sortie()).toContain(`(processus ${h.pid}, suite ${suiteH})`);
      expect(lu.sortie()).toContain(`(processus ${w.pid}) ; processus mort : sera reprise`);
      expect(lu.sortie().match(/processus mort : sera reprise/g)).toHaveLength(2);
      expect(readdirSync(t.dossier).sort()).toEqual(avant);
      /* Le dossier effacé pendant que W2 attend (H2, arrêtée, ne le recrée pas) : W2 le recrée, en 1777, et passe */
      const h2 = t.lancer("H2");
      await t.attendreDebut("H2");
      const w2 = t.lancer("W2");
      await t.attendreTicket(w2);
      process.kill(h2.pid, "SIGSTOP");
      rmSync(t.racine, { recursive: true, force: true });
      await t.attendreDebut("W2");
      for (const d of [t.racine, t.dossier]) expect(statSync(d).mode & 0o7777).toBe(0o1777);
      process.kill(h2.pid, "SIGCONT");
      t.liberer("H2");
      t.liberer("W2");
      for (const l of [h2, w2]) expect(await l.fin()).toEqual(OK);
    },
  );

  it(
    "le verrou : tant qu’un autre le tient, personne n’écrit dans la file, pas même pour rendre sa place ; abandonné, il est repris",
    { timeout: 240_000 },
    async ({ expect, onTestFinished }) => {
      const t = terrain(onTestFinished);
      const verrou = join(t.dossier, "verrou");
      /* Le verrou d’un processus vivant, posé quand il est libre */
      const planter = async (pid: number) => {
        for (;;) {
          try {
            mkdirSync(verrou, { recursive: false });
            writeFileSync(join(verrou, `${pid}-pose-par-le-test`), "");
            return Date.now();
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
            await attendre(5);
          }
        }
      };
      mkdirSync(t.dossier, { recursive: true });
      const temoin = t.temoin();
      const pose = await planter(temoin.pid);
      const w = t.lancer("W");
      await attendre(CALME_MS);
      expect(readdirSync(t.dossier)).toEqual(["verrou"]);
      /* Plus vieux que 10 s, il est repris, même si son processus vit */
      await t.attendreDebut("W");
      expect(Date.now() - pose).toBeGreaterThan(9000);
      await planter(temoin.pid);
      t.liberer("W");
      await attendre(CALME_MS);
      expect(w.estFini()).toBe(false);
      expect(t.placeDe(w)).toBeDefined();
      /* Son processus mort, il est repris */
      process.kill(temoin.pid, "SIGKILL");
      expect(await w.fin()).toEqual(OK);
      expect(t.etat().places).toEqual([]);
    },
  );
});
