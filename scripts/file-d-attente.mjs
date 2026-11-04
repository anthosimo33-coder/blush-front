#!/usr/bin/env node
/*
 * La file d’attente des suites lourdes (npm run check, npm test, la couverture, npm run e2e:build, npm run e2e, la
 * référence visuelle, la galerie, le banc de fluidité), partagée par toutes les copies de travail et toutes les
 * sessions de ce poste : une seule à la fois par défaut. Sur un poste où plusieurs sessions tournent, quatre suites
 * lancées ensemble se battent pour le processeur et la mémoire (le 3 novembre 2026 : 12 cœurs, 24 Go, une charge de
 * 40 à 80, la mémoire d’échange pleine) et finissent toutes plus tard que si elles avaient attendu leur tour.
 *
 * `node scripts/file-d-attente.mjs -- <commande> [arguments]` attend une place, lance la commande, et rend la place à
 * sa fin, quelle qu’elle soit (code de sortie de la commande, Ctrl-C, signal). Les places et les tickets sont des
 * fichiers JSON d’un dossier commun, versionné (/tmp/blush-suites-lourdes/v1, ou BLUSH_FILE_DOSSIER/v1 : deux copies de
 * travail dont le format diffère ne se lisent pas) ; chacun garde son jeton (un nom unique), le numéro de son
 * processus (et, pour une place, celui de la suite lancée), sa copie de travail et sa commande. Premier arrivé, premier
 * servi : on prend en arrivant un ticket numéroté, et une place ne revient qu’au plus ancien ticket encore là.
 *
 * Ce qui tient la file debout :
 * - un verrou court (le dossier `verrou`) autour de chaque regard qui décide et de chaque écriture : deux suites ne
 *   voient jamais la même place libre, et personne n’efface une place neuve en croyant effacer une morte ;
 * - un battement : la suite qui tourne retouche sa place toutes les 5 s, celle qui attend son ticket à chaque regard.
 *   Une place ou un ticket n’est repris (effacé) que si son processus est mort, ou si son battement s’est arrêté depuis
 *   plus de 30 s (une suite arrêtée par Ctrl-Z, un numéro de processus réutilisé), jamais à l’âge seul ;
 * - ce silence ne se compte que sur ce qu’on a vu soi-même, d’un regard au suivant sans trou : au réveil d’une veille
 *   du poste (ou d’un Ctrl-Z de celle qui attend), toutes les heures ont sauté d’un coup, et chacun laisse aux autres
 *   le temps de battre de nouveau. Un trou se voit au mur et à l’horloge monotone (performance.now) qui s’écartent
 *   (sous Linux, elle s’arrête pendant une veille), ou à un regard qui arrive bien plus tard que prévu (sur Mac, elle
 *   avance pendant la veille, avec le mur : seul ce retard la dit) ;
 * - un plafond de tenue (45 min par défaut) : au-delà, une place vivante ne compte plus parmi les prises, sans être
 *   effacée, pour qu’une suite bloquée (un serveur des tests qui ne répond plus, un page.pause() oublié) ne fige pas
 *   tout le poste. La tenue est la somme des battements, chacun compté au plus deux fois son rythme : une veille du
 *   poste ou un Ctrl-Z n’y comptent pas ;
 * - une place n’est rendue que par son titulaire, et seulement la sienne (son jeton). Celle d’une suite dont le
 *   processus de file a été tué (SIGKILL) reste prise tant que la suite tourne, jusqu’à son plafond (compté au mur
 *   depuis son dernier battement, veilles comprises) : au-delà, elle est effacée, car sa suite a pu finir et son numéro
 *   servir à un autre processus ;
 * - le verrou s’attend 20 s au plus (le fil principal est bloqué pendant l’attente, sourd à Ctrl-C) : un verrou qu’on
 *   ne peut pas reprendre (un jeton qu’on ne peut pas effacer) arrête la suite sur une erreur, sans figer le poste ;
 * - la suite qui attend recrée son ticket s’il a disparu (même numéro, donc même rang), et l’efface sur Ctrl-C, SIGTERM
 *   ou SIGHUP avant de mourir du même signal.
 *
 * Réglages :
 * - BLUSH_FILE_PLACES : combien de suites lourdes à la fois (1 par défaut). Chacune entre d’après son propre réglage, en
 *   comptant toutes les places prises, quel que soit le réglage de celles qui les tiennent, et jamais devant un ticket
 *   plus ancien ;
 * - BLUSH_FILE_MAX_MIN : le plafond de tenue de cette suite, en minutes (45 par défaut, décimales permises) ;
 * - BLUSH_SANS_FILE=1, ou GITHUB_ACTIONS=true (la CI de GitHub, seule sur sa machine) : la commande part tout de suite,
 *   sans file. De même pour un Playwright qui attend quelqu’un (--ui, --debug, PWDEBUG sauf à 0 ou false) et la page
 *   seule de la galerie (--page, sans navigateur). CI=1 ne suffit pas : les sessions le posent aussi en local ;
 * - BLUSH_FILE_TENUE : posée pour la commande lancée, pour qu’une suite lourde lancée de l’intérieur ne se mette pas à
 *   attendre sa propre place.
 * `node scripts/file-d-attente.mjs --etat` (npm run file) dit qui tourne et qui attend, sans rien changer.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** La racine commune de la file, la même pour toutes les copies de travail et toutes les sessions du poste (pas os.tmpdir() : TMPDIR est propre à chaque utilisateur). */
const DOSSIER_PAR_DEFAUT = "/tmp/blush-suites-lourdes";

/** La version du format sur disque, le sous-dossier de la racine où il vit : un format qui change prend un autre nom. */
const VERSION = "v1";

/** Au-delà de ce silence (aucun battement vu), une place ou un ticket dont le processus vit encore est repris. */
const SILENCE_MS = 30_000;

/** Le battement de la suite qui tourne : elle retouche sa place, et y écrit sa tenue, à ce rythme. */
const BATTEMENT_MS = 5_000;

/**
 * Le trou, d’un regard au suivant, au-delà duquel le regard compte comme un réveil (le silence des autres se recompte
 * alors à partir de lui) : l’écart entre l’heure du mur et l’horloge monotone (performance.now), ou le retard du regard
 * sur l’heure prévue (REGARD_MS et son hasard). Sous Linux, l’horloge monotone s’arrête pendant une veille, et seul le
 * mur saute ; sur Mac, elle saute avec lui (mesuré le 4 novembre 2026, Node 20.20, libuv 1.46 : process.hrtime suit
 * CLOCK_MONOTONIC, veilles comprises, et non CLOCK_UPTIME_RAW), et seul le retard le dit.
 */
const SAUT_MS = 10_000;

/** Le plafond de tenue par défaut, en minutes : la plus longue suite du poste, avec de la marge. */
const PLAFOND_MIN = 45;

/** Un verrou plus vieux que ça (ou dont le processus est mort) a été abandonné en route : il est repris. */
const VERROU_MAX_MS = 10_000;

/** L’attente entre deux essais sur un verrou pris (plus un peu de hasard, pour que deux essais ne se recroisent pas). */
const VERROU_PAS_MS = 20;

/**
 * L’attente au plus d’un verrou, comptée en pauses (une veille du poste n’y compte pas) : deux fois l’âge où un verrou
 * abandonné est repris. Au-delà, il ne peut pas l’être (un jeton qu’on ne peut pas effacer) : une erreur plutôt qu’un
 * processus qui tourne pour toujours, sourd à Ctrl-C.
 */
const VERROU_ATTENTE_MAX_MS = 2 * VERROU_MAX_MS;

/** Le temps entre deux regards sur la file. */
const REGARD_MS = 1000;

/** Le hasard ajouté au temps entre deux regards, pour que deux suites qui attendent ne regardent pas toujours ensemble. */
const REGARD_HASARD_MS = 250;

/** Le temps entre deux messages « toujours en attente ». */
const RAPPEL_MS = 60_000;

/** Les signaux qui arrêtent une suite (Ctrl-C, kill, le terminal fermé) : en attente, ils effacent son ticket ; en cours, ils vont à la commande. */
const SIGNAUX = ["SIGINT", "SIGTERM", "SIGHUP"];

/** Les arguments d’une commande qui passe hors file : un Playwright qui attend quelqu’un (--ui, --debug), la page seule de la galerie (--page). */
const HORS_FILE = /^--(ui|ui-host|ui-port|debug|page)(=|$)/;

/** PWDEBUG allumé, comme Playwright le lit (packages/utils/debug.ts) : posé, ni « 0 » ni « false » ; l’inspecteur (ou la console du navigateur) attend alors quelqu’un. */
function pwdebugAllume(valeur = "") {
  return valeur !== "" && valeur !== "0" && valeur !== "false";
}

/** Le dossier versionné de la file, sous sa racine (BLUSH_FILE_DOSSIER, ou /tmp/blush-suites-lourdes). */
export function dossierDeLaFile(racine = DOSSIER_PAR_DEFAUT) {
  return join(racine, VERSION);
}

/** Attend `ms` millisecondes sans rendre la main : le verrou se prend aussi dans un gestionnaire de signal. */
function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Le processus vit-il encore ? EPERM : il vit, mais à un autre utilisateur ou hors de portée du bac à sable. */
function vivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * Crée le dossier de la file (et sa racine) s’il manque, ou s’il a disparu en route, en 1777 comme /tmp : chaque
 * utilisateur du poste y écrit, et le bit collant garde les fichiers de chacun. mkdir passe par le umask : les droits
 * se reposent ensuite, sur les seuls dossiers créés ici (jamais sur une racine qui existait déjà).
 */
function preparer(dossier) {
  const premier = mkdirSync(dossier, { recursive: true, mode: 0o1777 });
  if (!premier) return;
  for (let d = dossier; ; d = dirname(d)) {
    chmodSync(d, 0o1777);
    if (d === premier) break;
  }
}

/**
 * Le verrou court de la file, autour de `travail` (qui ne fait que lire et écrire quelques fichiers) : un dossier
 * `verrou` (mkdir est atomique) et, dedans, le jeton de celui qui le tient (son processus, puis un nom unique). Rendu à
 * la fin, seulement s’il porte encore notre jeton : repris par un autre (nous étions arrêtés plus de VERROU_MAX_MS), il
 * est à lui. Attendu plus de VERROU_ATTENTE_MAX_MS : une erreur de code EVERROU, sans rien avoir fait.
 */
function sousVerrou(dossier, travail) {
  const verrou = join(dossier, "verrou");
  const jeton = `${process.pid}-${randomUUID()}`;
  let attendu = 0;
  while (!prendreVerrou(dossier, verrou, jeton)) {
    if (attendu > VERROU_ATTENTE_MAX_MS) {
      throw Object.assign(
        new Error(
          `le verrou de la file (${verrou}) est pris depuis plus de ${VERROU_ATTENTE_MAX_MS / 1000} s et ne peut pas être repris : à effacer à la main s’il n’est à personne (npm run file dit qui tourne et qui attend)`,
        ),
        { code: "EVERROU" },
      );
    }
    const pause = VERROU_PAS_MS + Math.floor(Math.random() * VERROU_PAS_MS);
    dormir(pause);
    attendu += pause;
  }
  try {
    return travail();
  } finally {
    try {
      unlinkSync(join(verrou, jeton));
      rmdirSync(verrou);
    } catch {
      /* déjà repris, ou le jeton d’un autre à côté : à lui de le rendre */
    }
  }
}

/**
 * Un essai sur le verrou : true s’il est à nous. Deux suites qui reprennent un verrou abandonné en même temps peuvent
 * écrire leurs jetons dans le même dossier : chacune en voit alors deux, et laisse la place à l’autre (l’une des deux,
 * au moins, voit l’autre, puisque chacune écrit avant de regarder).
 */
function prendreVerrou(dossier, verrou, jeton) {
  try {
    mkdirSync(verrou);
  } catch (e) {
    if (e.code === "ENOENT") {
      preparer(dossier);
      return false;
    }
    if (e.code !== "EEXIST") throw e;
    reprendreVerrouAbandonne(verrou);
    return false;
  }
  try {
    writeFileSync(join(verrou, jeton), "", { flag: "wx" });
    if (readdirSync(verrou).length === 1) return true;
  } catch (e) {
    /* Le dossier effacé entre notre mkdir et notre jeton : un autre l’a cru abandonné, on recommence */
    if (e.code !== "ENOENT") throw e;
    return false;
  }
  effacer(join(verrou, jeton));
  try {
    rmdirSync(verrou);
  } catch {
    /* le jeton de l’autre y est encore : c’est son verrou */
  }
  return false;
}

/**
 * Reprend un verrou abandonné : un jeton dont le processus est mort, ou plus vieux que VERROU_MAX_MS ; un dossier vide
 * (pris, puis abandonné avant d’y écrire un jeton) ou un fichier à la place du dossier (posé à la main) plus vieux que
 * VERROU_MAX_MS. Un rmdir n’efface qu’un dossier vide : le verrou neuf d’un autre, avec son jeton dedans, reste. Ce qui
 * ne s’efface pas (le jeton d’un autre utilisateur, un dossier sans droit d’écriture) reste, et sousVerrou finit par
 * renoncer.
 */
function reprendreVerrouAbandonne(verrou) {
  const maintenant = Date.now();
  let jetons;
  try {
    jetons = readdirSync(verrou);
  } catch (e) {
    try {
      if (e.code === "ENOTDIR" && maintenant - statSync(verrou).mtimeMs > VERROU_MAX_MS) unlinkSync(verrou);
    } catch {
      /* repris par un autre au même moment, ou pas à nous */
    }
    return;
  }
  try {
    if (!jetons.length && maintenant - statSync(verrou).mtimeMs > VERROU_MAX_MS) rmdirSync(verrou);
  } catch {
    /* repris ou rendu entre-temps */
  }
  for (const nom of jetons) {
    const chemin = join(verrou, nom);
    try {
      if (vivant(Number.parseInt(nom, 10)) && maintenant - statSync(chemin).mtimeMs <= VERROU_MAX_MS) continue;
      /* Un jeton est un fichier ; un dossier à sa place (posé à la main) s’efface aussi. Sans force : déjà parti, on s’arrête là */
      rmSync(chemin, { recursive: true });
      rmdirSync(verrou);
    } catch {
      /* un autre l’a repris au même moment, ou un autre jeton reste */
    }
  }
}

/** Efface un fichier de la file s’il est encore là (et que le bit collant le permet : celui d’un autre utilisateur reste). */
function effacer(chemin) {
  try {
    unlinkSync(chemin);
  } catch {
    /* déjà parti, ou pas à nous */
  }
}

/**
 * Écrit un fichier de la file d’un coup (dans un fichier à part, puis renommé : personne ne lit une moitié de JSON),
 * daté de `maintenant` : sa date est son battement, à l’heure de celui qui l’écrit.
 */
function ecrire(dossier, nom, contenu, maintenant) {
  const provisoire = join(dossier, `.${nom}.${process.pid}.tmp`);
  writeFileSync(provisoire, JSON.stringify(contenu));
  utimesSync(provisoire, maintenant / 1000, maintenant / 1000);
  renameSync(provisoire, join(dossier, nom));
}

/** Les fichiers provisoires laissés par un processus mort en pleine écriture (ecrire), effacés. */
function nettoyer(dossier) {
  for (const nom of readdirSync(dossier)) {
    const pid = /^\..+\.(\d+)\.tmp$/.exec(nom)?.[1];
    if (pid && !vivant(Number(pid))) effacer(join(dossier, nom));
  }
}

/** Les places ou les tickets du dossier (`genre` : « place » ou « ticket ») : leur nom, leur contenu (null s’il est illisible) et la date de leur dernier battement. */
function lireEntrees(dossier, genre) {
  let noms;
  try {
    noms = readdirSync(dossier);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const entrees = [];
  for (const nom of noms) {
    if (!nom.startsWith(`${genre}-`)) continue;
    const chemin = join(dossier, nom);
    try {
      const battu = statSync(chemin).mtimeMs;
      let contenu = null;
      try {
        const lu = JSON.parse(readFileSync(chemin, "utf8"));
        if (lu && typeof lu === "object" && Number.isInteger(lu.pid)) contenu = lu;
      } catch {
        /* illisible : un autre format, ou abîmé */
      }
      entrees.push({ nom, chemin, contenu, battu });
    } catch {
      /* parti entre la liste et la lecture */
    }
  }
  return entrees;
}

/**
 * Où en est une place ou un ticket : « vivante » (son processus vit et bat), « orpheline » (une place dont le processus
 * de file est mort mais dont la suite tourne encore), « silencieuse » (son processus vit, mais rien n’a battu depuis
 * plus de SILENCE_MS), « morte », ou « illisible ». `vuDepuis` : le début de notre regard sans saut d’horloge ; le
 * silence ne se compte pas avant lui (-Infinity : tel que les dates le disent).
 */
function juger(entree, maintenant, vuDepuis) {
  const c = entree.contenu;
  if (!c) return "illisible";
  if (!vivant(c.pid)) return c.enfant && vivant(c.enfant) ? "orpheline" : "morte";
  return maintenant - Math.max(entree.battu, vuDepuis) > SILENCE_MS ? "silencieuse" : "vivante";
}

/**
 * Une place compte-t-elle parmi les prises ? Vivante ou orpheline, et pas au-delà de son plafond. Sa tenue est celle
 * que son titulaire écrit, la somme de ses battements (une veille du poste ou un Ctrl-Z n’y comptent pas) ; une
 * orpheline ne bat plus, et y ajoute le temps du mur depuis son dernier battement (veilles comprises : on ne sait pas
 * mieux de l’extérieur).
 */
function compte(place, etat, maintenant) {
  if (etat !== "vivante" && etat !== "orpheline") return false;
  const { tenue = 0, plafond = PLAFOND_MIN * 60_000 } = place.contenu;
  return tenue + (etat === "orpheline" ? Math.max(0, maintenant - place.battu) : 0) <= plafond;
}

/** L’ordre d’arrivée des tickets : leur rang, puis leur processus ; un ticket illisible, sans rang, à la fin. */
function parRang(a, b) {
  return (a.contenu?.rang ?? Infinity) - (b.contenu?.rang ?? Infinity) || (a.contenu?.pid ?? 0) - (b.contenu?.pid ?? 0);
}

/** Le prochain rang d’arrivée : un de plus que le dernier donné (le fichier `rang`, qui ne revient jamais en arrière) et que tous les tickets là. */
function prochainRang(dossier, tickets, maintenant) {
  let dernier = 0;
  try {
    dernier = Number.parseInt(readFileSync(join(dossier, "rang"), "utf8"), 10) || 0;
  } catch {
    /* le premier ticket, ou le dossier recréé */
  }
  for (const t of tickets) if (Number.isInteger(t.contenu?.rang)) dernier = Math.max(dernier, t.contenu.rang);
  ecrire(dossier, "rang", dernier + 1, maintenant);
  return dernier + 1;
}

/** Le premier nom de place libre (place-0, place-1…) : une place au-delà de son plafond garde le sien, et la suivante en prend un autre. */
function nomLibre(dossier) {
  for (let k = 0; ; k++) if (!existsSync(join(dossier, `place-${k}`))) return `place-${k}`;
}

/**
 * Qui tourne et qui attend, sans rien changer (ni dossier créé, ni mort effacé) : les places et les tickets de la file
 * de `dossier` (sa racine), chacun avec son état (juger), la date de son dernier battement et, pour une place, si elle
 * compte parmi les prises. Les places dans l’ordre où elles ont été prises, les tickets dans l’ordre d’arrivée.
 */
export function etatDeLaFile({ dossier = DOSSIER_PAR_DEFAUT } = {}) {
  const ici = dossierDeLaFile(dossier);
  const maintenant = Date.now();
  const voir = (e) => ({ ...e.contenu, nom: e.nom, chemin: e.chemin, battu: e.battu, etat: juger(e, maintenant, -Infinity) });
  return {
    places: lireEntrees(ici, "place")
      .map((p) => {
        const vue = voir(p);
        return { ...vue, compte: compte(p, vue.etat, maintenant) };
      })
      .sort((a, b) => (a.depuis ?? 0) - (b.depuis ?? 0)),
    tickets: lireEntrees(ici, "ticket").sort(parRang).map(voir),
  };
}

/**
 * Un regard sur la file, sous le verrou : notre ticket écrit (créé au premier regard, recréé s’il a disparu, et battu
 * à chaque fois), les morts, les silencieux et les orphelines au-delà de leur plafond effacés, puis, si notre tour est
 * venu (moins de places comptées que les nôtres, et pas plus de tickets devant nous qu’il n’en reste), une place prise
 * et notre ticket rendu.
 */
function regarder(dossier, moi, maintenant, vuDepuis) {
  nettoyer(dossier);
  if (!moi.ticket) {
    const rang = prochainRang(dossier, lireEntrees(dossier, "ticket"), maintenant);
    moi.ticket = { nom: `ticket-${rang}-${moi.pid}`, contenu: { jeton: moi.jeton, pid: moi.pid, rang, depuis: maintenant, quoi: moi.quoi, ou: moi.ou } };
  }
  ecrire(dossier, moi.ticket.nom, moi.ticket.contenu, maintenant);
  const tickets = [];
  for (const t of lireEntrees(dossier, "ticket")) {
    if (t.contenu?.jeton === moi.jeton || juger(t, maintenant, vuDepuis) === "vivante") tickets.push(t);
    else effacer(t.chemin);
  }
  tickets.sort(parRang);
  let prises = 0;
  const enCours = [];
  for (const p of lireEntrees(dossier, "place")) {
    const etat = juger(p, maintenant, vuDepuis);
    const compteParmiLesPrises = compte(p, etat, maintenant);
    /* Une vivante au-delà de son plafond reste (son titulaire la réinscrirait) ; une orpheline au-delà, plus rien ne la rendra */
    if (etat !== "vivante" && !compteParmiLesPrises) {
      effacer(p.chemin);
      continue;
    }
    if (compteParmiLesPrises) prises++;
    enCours.push({ ...p.contenu, compte: compteParmiLesPrises });
  }
  const position = tickets.findIndex((t) => t.contenu?.jeton === moi.jeton);
  if (prises < moi.places && position < moi.places - prises) {
    const nom = nomLibre(dossier);
    const contenu = { jeton: moi.jeton, pid: moi.pid, enfant: null, depuis: maintenant, tenue: 0, plafond: moi.plafond, quoi: moi.quoi, ou: moi.ou };
    ecrire(dossier, nom, contenu, maintenant);
    effacer(join(dossier, moi.ticket.nom));
    return { place: { nom, contenu } };
  }
  return { position, attente: tickets.length, enCours };
}

/**
 * Attend une place dans la file de `racine`, et la rend tenue (tenir). `dire` reçoit les messages pour la personne qui
 * attend (son rang, qui tourne, depuis quand), au premier regard puis une fois par minute. Pendant l’attente, un
 * SIGINT, SIGTERM ou SIGHUP efface le ticket, puis le processus meurt du même signal (comme sans la file : le shell
 * voit 128 + n).
 */
async function prendrePlace({ racine, places, plafond, quoi, ou, dire }) {
  const dossier = dossierDeLaFile(racine);
  const moi = { jeton: randomUUID(), pid: process.pid, places, plafond, quoi, ou, ticket: null };
  let interrompue = false;
  const rendreLeTicket = () => {
    if (moi.ticket) sousVerrou(dossier, () => effacer(join(dossier, moi.ticket.nom)));
  };
  const surSignal = (signal) => {
    retirer();
    interrompue = true;
    try {
      rendreLeTicket();
    } finally {
      /* Personne d’autre n’écoute ce signal : l’action par défaut, la mort, comme sans la file */
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    }
  };
  const retirer = () => {
    for (const s of SIGNAUX) process.removeListener(s, surSignal);
  };
  for (const s of SIGNAUX) process.on(s, surSignal);
  try {
    let vuDepuis = Date.now();
    let avant = { mur: vuDepuis, eveil: performance.now() };
    let dernierMessage = -Infinity;
    for (;;) {
      if (interrompue) throw new Error("attente interrompue par un signal");
      const maintenant = Date.now();
      const eveil = performance.now();
      /*
       * Un trou depuis le regard d’avant (SAUT_MS) : le mur qui avance (ou recule) bien plus que l’horloge monotone
       * (une veille sous Linux, une horloge recalée), ou ce regard bien plus tard que prévu (une veille sur Mac, un
       * Ctrl-Z sur cette suite, un poste à genoux). Le silence des autres se recompte à partir d’ici : au pire, une
       * reprise tardive.
       */
      const ecart = Math.abs(maintenant - avant.mur - (eveil - avant.eveil));
      const retard = eveil - avant.eveil - (REGARD_MS + REGARD_HASARD_MS);
      if (ecart > SAUT_MS || retard > SAUT_MS) vuDepuis = maintenant;
      avant = { mur: maintenant, eveil };
      let vu = null;
      try {
        vu = sousVerrou(dossier, () => regarder(dossier, moi, maintenant, vuDepuis));
      } catch (e) {
        /* Le dossier effacé en plein regard : le verrou le recrée au regard suivant */
        if (e.code !== "ENOENT") throw e;
      }
      if (vu?.place) {
        retirer();
        return tenir(dossier, vu.place, dire);
      }
      if (vu && maintenant - dernierMessage >= RAPPEL_MS) {
        dernierMessage = maintenant;
        const enCours = vu.enCours
          .map((p) => `${p.quoi} dans ${p.ou} (processus ${p.pid}, depuis ${Math.round((maintenant - p.depuis) / 60_000)} min${p.compte ? "" : ", au-delà de son plafond"})`)
          .join(", ");
        dire(
          `En file d’attente des suites lourdes, n° ${vu.position + 1} sur ${vu.attente}${enCours ? ` ; en cours : ${enCours}` : ""}. npm run file dit qui tourne et qui attend.`,
        );
      }
      await new Promise((r) => setTimeout(r, REGARD_MS + Math.floor(Math.random() * REGARD_HASARD_MS)));
    }
  } catch (e) {
    try {
      /* Le verrou introuvable : 20 s de plus à l’attendre n’y changeraient rien */
      if (!interrompue && e.code !== "EVERROU") rendreLeTicket();
    } catch {
      /* l’erreur d’origine compte plus : le ticket, sans battement, sera repris */
    }
    throw e;
  } finally {
    retirer();
  }
}

/**
 * La place obtenue, tenue jusqu’à la fin de la suite : un battement toutes les BATTEMENT_MS (la date du fichier, et la
 * tenue dans son contenu), `noterEnfant` (le numéro de la suite lancée, écrit tout de suite) et `rendre`, qui n’efface
 * que les places à son jeton. La tenue ajoute à chaque battement le temps depuis le précédent, au plus deux fois son
 * rythme : une veille du poste (sur Mac, l’horloge monotone avance pendant la veille) ou un Ctrl-Z ne l’allongent pas.
 * Une place reprise pendant qu’elle tournait (la suite arrêtée plus de 30 s, le dossier effacé) se réinscrit au
 * battement suivant, sous un nom libre : la suite tourne, les autres doivent le voir. Un verrou introuvable (EVERROU)
 * arrête le battement, plutôt que de bloquer 20 s toutes les 5 s.
 */
function tenir(dossier, place, dire) {
  const { contenu } = place;
  let dernier = performance.now();
  let rendue = false;
  let prevenue = false;
  const battre = () =>
    sousVerrou(dossier, () => {
      const eveil = performance.now();
      contenu.tenue += Math.round(Math.min(Math.max(0, eveil - dernier), 2 * BATTEMENT_MS));
      dernier = eveil;
      let nom = lireEntrees(dossier, "place").find((p) => p.contenu?.jeton === contenu.jeton)?.nom;
      if (!nom) {
        nom = nomLibre(dossier);
        if (!prevenue) dire("La place de cette suite dans la file avait été reprise (processus arrêté plus de 30 s, ou dossier effacé) : elle est reprise de nouveau.");
        prevenue = true;
      }
      ecrire(dossier, nom, contenu, Date.now());
    });
  const battement = setInterval(() => {
    try {
      battre();
    } catch (e) {
      if (e.code === "EVERROU") clearInterval(battement);
      dire(`Le battement de la file ${e.code === "EVERROU" ? "s’arrête" : "a échoué"} : ${e.message}`);
    }
  }, BATTEMENT_MS);
  battement.unref();
  return {
    noterEnfant(pid) {
      contenu.enfant = pid;
      battre();
    },
    rendre() {
      if (rendue) return;
      rendue = true;
      clearInterval(battement);
      sousVerrou(dossier, () => {
        for (const p of lireEntrees(dossier, "place")) if (p.contenu?.jeton === contenu.jeton) effacer(p.chemin);
      });
    },
  };
}

/**
 * Lance la commande (BLUSH_FILE_TENUE posée pour elle), note son numéro dans la place, lui transmet les signaux, et
 * rend son code de sortie : 128 + n si un signal l’a tuée, comme un shell ; 1 si elle n’a pas pu partir.
 */
function lancer(commande, place) {
  return new Promise((resolve) => {
    const enfant = spawn(commande[0], commande.slice(1), { stdio: "inherit", env: { ...process.env, BLUSH_FILE_TENUE: "1" } });
    const transmettre = (signal) => {
      enfant.kill(signal);
    };
    for (const s of SIGNAUX) process.on(s, transmettre);
    let finie = false;
    const fin = (code) => {
      if (finie) return;
      finie = true;
      for (const s of SIGNAUX) process.removeListener(s, transmettre);
      resolve(code);
    };
    enfant.on("error", (e) => {
      console.error(e.message);
      fin(1);
    });
    enfant.on("exit", (code, signal) => fin(code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 0)));
    if (enfant.pid) {
      try {
        place?.noterEnfant(enfant.pid);
      } catch (e) {
        console.error(`Le numéro de la suite n’a pas pu être noté dans la file : ${e.message}`);
      }
    }
  });
}

/** npm run file : les places (et ce que le prochain regard en fera), puis les tickets, dans leur ordre. */
function afficherEtat({ places, tickets }) {
  const maintenant = Date.now();
  const minutes = (t) => Math.round((maintenant - t) / 60_000);
  const secondes = (t) => Math.max(0, Math.round((maintenant - t) / 1000));
  const notes = (e) =>
    ({
      orpheline: " ; son processus de file est mort, pas sa suite",
      silencieuse: ` ; sans battement depuis ${secondes(e.battu)} s : sera reprise`,
      morte: " ; processus mort : sera reprise",
      illisible: " ; illisible : sera effacée",
    })[e.etat] ?? "";
  if (!places.length) console.log("Aucune suite lourde en cours.");
  for (const p of places) {
    if (p.etat === "illisible") {
      console.log(`En cours : ${p.nom}${notes(p)}`);
      continue;
    }
    const enVie = p.etat === "vivante" || p.etat === "orpheline";
    /* Au-delà de son plafond, une vivante ne compte plus ; une orpheline sera effacée (regarder) */
    const audela = p.etat === "orpheline" ? "sera effacée" : "ne compte plus";
    const plafond = enVie && !p.compte ? ` ; au-delà de son plafond (${Math.round((p.plafond ?? 0) / 60_000)} min) : ${audela}` : "";
    const suite = p.enfant ? `, suite ${p.enfant}` : "";
    console.log(`En cours : ${p.quoi} dans ${p.ou}, depuis ${minutes(p.depuis)} min (processus ${p.pid}${suite}), battement il y a ${secondes(p.battu)} s${notes(p)}${plafond}`);
  }
  tickets.forEach((t, i) => {
    if (t.etat === "illisible") console.log(`En attente : ${t.nom}${notes(t)}`);
    else console.log(`En attente n° ${i + 1} : ${t.quoi} dans ${t.ou}, depuis ${minutes(t.depuis)} min (processus ${t.pid})${notes(t)}`);
  });
}

/** La commande : attend sa place (sauf hors file), lance la commande, rend la place et sort avec le code de la commande. */
async function principal(args) {
  const racine = process.env.BLUSH_FILE_DOSSIER || DOSSIER_PAR_DEFAUT;
  if (args[0] === "--etat") {
    afficherEtat(etatDeLaFile({ dossier: racine }));
    return 0;
  }
  const tiret = args.indexOf("--");
  const commande = tiret >= 0 ? args.slice(tiret + 1) : args;
  if (!commande.length) {
    console.error("Usage : node scripts/file-d-attente.mjs -- <commande> [arguments]   (ou --etat)");
    return 2;
  }
  const horsFile =
    process.env.BLUSH_SANS_FILE === "1" ||
    process.env.GITHUB_ACTIONS === "true" ||
    !!process.env.BLUSH_FILE_TENUE ||
    pwdebugAllume(process.env.PWDEBUG) ||
    commande.some((a) => HORS_FILE.test(a));
  let place = null;
  if (!horsFile) {
    const places = Math.max(1, Number.parseInt(process.env.BLUSH_FILE_PLACES ?? "", 10) || 1);
    const minutes = Number.parseFloat(process.env.BLUSH_FILE_MAX_MIN ?? "");
    const plafond = Math.round((minutes > 0 ? minutes : PLAFOND_MIN) * 60_000);
    const quoi = process.env.npm_lifecycle_event ? `npm run ${process.env.npm_lifecycle_event}` : commande.join(" ");
    try {
      place = await prendrePlace({ racine, places, plafond, quoi, ou: process.cwd(), dire: (m) => console.error(m) });
    } catch (e) {
      console.error(`La file d’attente des suites lourdes : ${e.message} (BLUSH_SANS_FILE=1 passe sans elle).`);
      return 1;
    }
  }
  try {
    return await lancer(commande, place);
  } finally {
    try {
      place?.rendre();
    } catch (e) {
      console.error(`La place n’a pas pu être rendue : ${e.message} (npm run file dit où en est la file).`);
    }
  }
}

/** Lancé comme un script (pas importé par un test), même par un chemin qui passe par un lien symbolique : node donne le vrai chemin du module, et le chemin tapé dans argv. */
const lanceDirectement = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (lanceDirectement) process.exitCode = await principal(process.argv.slice(2));
