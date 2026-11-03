#!/usr/bin/env node
/*
 * La file d’attente des suites lourdes (npm run check, npm run e2e:build, npm run e2e, la galerie), partagée par toutes
 * les copies de travail et toutes les sessions de ce poste : une seule à la fois par défaut. Sur un poste où plusieurs
 * sessions tournent, quatre suites lancées ensemble se battent pour le processeur et la mémoire (le 3 novembre 2026 :
 * 12 cœurs, 24 Go, une charge de 40 à 80, la mémoire d’échange pleine) et finissent toutes plus tard que si elles
 * avaient attendu leur tour.
 *
 * `node scripts/file-d-attente.mjs -- <commande> [arguments]` attend une place, lance la commande, et rend la place à
 * sa fin, quelle qu’elle soit (code de sortie de la commande, Ctrl-C, signal). Les places et les tickets sont des
 * fichiers d’un dossier commun (/tmp/blush-suites-lourdes, ou BLUSH_FILE_DOSSIER) : chacun garde le numéro du
 * processus, sa copie de travail, sa commande et son heure. Une place ou un ticket dont le processus est mort (ou plus
 * vieux que PLACE_MAX_MS) est repris : un Ctrl-C brutal ou un poste redémarré ne bloque pas la file.
 * Premier arrivé, premier servi : on prend un ticket en arrivant, et une place ne revient qu’au plus ancien ticket vivant.
 *
 * Réglages :
 * - BLUSH_FILE_PLACES : combien de suites lourdes à la fois (1 par défaut) ;
 * - BLUSH_SANS_FILE=1, ou CI (la CI de GitHub, seule sur sa machine) : la commande part tout de suite, sans file ;
 * - BLUSH_FILE_TENUE : posée pour la commande lancée, pour qu’une suite lourde lancée de l’intérieur ne se mette pas
 *   à attendre sa propre place.
 * `node scripts/file-d-attente.mjs --etat` (npm run file) dit qui tourne et qui attend.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Le dossier commun de la file, le même pour toutes les copies de travail et toutes les sessions du poste. */
export const DOSSIER_PAR_DEFAUT = "/tmp/blush-suites-lourdes";

/** Au-delà, une place ou un ticket est repris même si son processus semble vivant (un numéro réutilisé après un redémarrage). */
export const PLACE_MAX_MS = 3 * 60 * 60 * 1000;

/* Le temps entre deux regards sur la file, et entre deux messages « toujours en attente » */
const REGARD_MS = 1000;
const RAPPEL_MS = 60 * 1000;

/** Le processus vit-il encore ? EPERM : il vit, mais à un autre utilisateur ou hors de portée du bac à sable. */
function vivant(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Les fichiers d’un genre (« place » ou « ticket ») du dossier, lus, les morts et les trop vieux effacés au passage. */
function lire(dossier, genre, maintenant) {
  const vivants = [];
  for (const nom of readdirSync(dossier)) {
    if (!nom.startsWith(`${genre}-`)) continue;
    const chemin = join(dossier, nom);
    let info;
    try {
      info = JSON.parse(readFileSync(chemin, "utf8"));
    } catch {
      /* Un fichier en cours d’écriture, ou abîmé : abîmé et vieux de plus d’une minute, il part */
      try {
        if (maintenant - statSync(chemin).mtimeMs > 60_000) rmSync(chemin, { force: true });
      } catch {
        /* déjà parti */
      }
      continue;
    }
    if (!vivant(info.pid) || maintenant - info.depuis > PLACE_MAX_MS) {
      rmSync(chemin, { force: true });
      continue;
    }
    vivants.push({ ...info, nom });
  }
  return vivants;
}

/** Écrit un fichier seulement s’il n’existe pas encore (« wx ») : rend false si quelqu’un l’a pris avant. */
function creer(chemin, contenu) {
  let fd;
  try {
    fd = openSync(chemin, "wx");
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
  writeSync(fd, JSON.stringify(contenu));
  closeSync(fd);
  return true;
}

/** Qui tourne et qui attend, dans l’ordre des tickets. */
export function etatDeLaFile({ dossier = DOSSIER_PAR_DEFAUT } = {}) {
  mkdirSync(dossier, { recursive: true });
  const maintenant = Date.now();
  return {
    places: lire(dossier, "place", maintenant).sort((a, b) => a.depuis - b.depuis),
    tickets: lire(dossier, "ticket", maintenant).sort((a, b) => a.depuis - b.depuis || a.pid - b.pid),
  };
}

/**
 * Attend une place dans la file, puis la rend par la fonction retournée (à appeler une fois, à la fin). `dire` reçoit
 * les messages pour la personne qui attend (qui tourne, depuis quand), au premier regard puis une fois par minute.
 */
export async function prendrePlace({ dossier = DOSSIER_PAR_DEFAUT, places = 1, quoi = "", ou = process.cwd(), pid = process.pid, dire = () => {} } = {}) {
  mkdirSync(dossier, { recursive: true });
  const depuis = Date.now();
  const ticket = join(dossier, `ticket-${depuis}-${pid}`);
  creer(ticket, { pid, depuis, quoi, ou });
  let dernierMessage = 0;
  try {
    for (;;) {
      const maintenant = Date.now();
      const occupees = lire(dossier, "place", maintenant);
      const libres = places - occupees.length;
      if (libres > 0) {
        /* Mon tour : mon ticket est parmi les plus anciens, autant qu’il y a de places libres */
        const avant = lire(dossier, "ticket", maintenant)
          .sort((a, b) => a.depuis - b.depuis || a.pid - b.pid)
          .slice(0, libres);
        if (avant.some((t) => t.pid === pid && t.depuis === depuis)) {
          for (let k = 0; k < places; k++) {
            const place = join(dossier, `place-${k}`);
            if (creer(place, { pid, depuis: maintenant, quoi, ou })) {
              rmSync(ticket, { force: true });
              let rendue = false;
              return () => {
                if (rendue) return;
                rendue = true;
                rmSync(place, { force: true });
              };
            }
          }
        }
      }
      if (maintenant - dernierMessage >= RAPPEL_MS) {
        dernierMessage = maintenant;
        const enCours = occupees.map((p) => `${p.quoi || "une suite"} dans ${p.ou} (depuis ${Math.round((maintenant - p.depuis) / 60000)} min)`).join(", ");
        dire(`En file d’attente des suites lourdes${enCours ? ` : ${enCours}` : ""}.`);
      }
      await new Promise((r) => setTimeout(r, REGARD_MS + Math.floor(Math.random() * 250)));
    }
  } catch (e) {
    rmSync(ticket, { force: true });
    throw e;
  }
}

/* La commande : attend sa place, lance la commande, rend la place et sort avec le code de la commande */
async function principal(args) {
  const dossier = process.env.BLUSH_FILE_DOSSIER || DOSSIER_PAR_DEFAUT;
  if (args[0] === "--etat") {
    const { places, tickets } = etatDeLaFile({ dossier });
    const minutes = (t) => Math.round((Date.now() - t) / 60000);
    console.log(
      places.length ? places.map((p) => `En cours : ${p.quoi} dans ${p.ou}, depuis ${minutes(p.depuis)} min (processus ${p.pid})`).join("\n") : "Aucune suite lourde en cours.",
    );
    for (const t of tickets) console.log(`En attente : ${t.quoi} dans ${t.ou}, depuis ${minutes(t.depuis)} min (processus ${t.pid})`);
    return 0;
  }
  const tiret = args.indexOf("--");
  const commande = tiret >= 0 ? args.slice(tiret + 1) : args;
  if (!commande.length) {
    console.error("Usage : node scripts/file-d-attente.mjs -- <commande> [arguments]   (ou --etat)");
    return 2;
  }
  const sansFile = process.env.BLUSH_SANS_FILE === "1" || !!process.env.CI || !!process.env.BLUSH_FILE_TENUE;
  const places = Math.max(1, Number.parseInt(process.env.BLUSH_FILE_PLACES ?? "1", 10) || 1);
  const quoi = process.env.npm_lifecycle_event ? `npm run ${process.env.npm_lifecycle_event}` : commande.join(" ");
  const rendre = sansFile ? () => {} : await prendrePlace({ dossier, places, quoi, dire: (m) => console.error(m) });
  return await new Promise((resolve) => {
    const enfant = spawn(commande[0], commande.slice(1), { stdio: "inherit", env: { ...process.env, BLUSH_FILE_TENUE: "1" } });
    const fin = (code) => {
      rendre();
      resolve(code);
    };
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      process.on(signal, () => {
        enfant.kill(signal);
      });
    enfant.on("error", (e) => {
      console.error(e.message);
      fin(1);
    });
    enfant.on("exit", (code, signal) => fin(code ?? (signal ? 1 : 0)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await principal(process.argv.slice(2));
