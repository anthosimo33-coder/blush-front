"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { envoyerMesuresDuNavigateur, signalerErreurDuNavigateur } from "@/services/api";
import { METRIQUES_WEB, type EtapeVisite, type MetriqueWeb } from "@/types";
import type { Routes } from "@/types/api";
import { cheminSur } from "./chemins";
import { etapeDe } from "./presence";
import { masquerTexte } from "./secrets";

/*
 * La sentinelle : ce que le serveur ne voit pas, envoyé pour /admin (src/server/navigateur.ts). Les erreurs de l’appli
 * dans ce navigateur (une erreur qui n’est rattrapée par rien, une promesse rejetée sans suite, et les pages d’erreur :
 * signalerErreur), et la vitesse de la page (les Web Vitals de Next : l’affichage, la réponse au toucher, la mise en
 * page qui saute), envoyée une fois quand la page passe à l’arrière-plan ou se ferme. Seulement l’écran (etapeDe),
 * jamais l’adresse ; rien sur les outils de l’équipe. Le serveur masque et borne le reste.
 * Depuis le 11 novembre, la réponse au toucher (INP) compte sur l’écran où l’on a touché, et le toucher le plus lent de
 * la page part avec son détail (suivreLesTouchers) : avant, une visite arrivée sur /commencer mettait sur « import » le
 * pire toucher de tout son parcours (la lecture, le paywall…), et rien ne disait lequel.
 */

/** Pas plus d’erreurs que ça par page : une erreur dans une boucle ne fait pas une rafale. */
const ERREURS_PAR_PAGE = 5;
const signalees = new Set<string>();

/**
 * Le bruit connu, qui n’est pas un bug de l’appli : une erreur d’un script d’un autre site (opaque), ResizeObserver, et
 * les scripts qu’un navigateur ou une appli glisse dans chaque page, sans adresse de fichier (le filtre des scripts
 * d’ailleurs ne les voit pas) : un portefeuille crypto (`window.ethereum`), le pont d’une appli iPhone
 * (`webkit.messageHandlers`), le remplissage du navigateur de Facebook (`_AutofillCallbackHandler`), celui de Bing
 * (`instantSearchSDKJSBridge…`), Chrome sur iPhone (`__gCrWeb`), Firefox sur iPhone (`__firefox__`, son mode lecture).
 * L’appli n’emploie aucun de ces noms.
 */
const BRUIT = /^(Script error\.?|ResizeObserver loop)|\b(?:ethereum|webkit\.messageHandlers|_AutofillCallbackHandler|instantSearchSDKJSBridge\w*|__gCrWeb|__firefox__)\b/;

/** Signale une erreur de l’appli à l’équipe (une fois par page pour la même, cinq par page au plus). */
export function signalerErreur(e: unknown, source?: string): void {
  const etape = etapeDe(window.location.pathname);
  if (!etape) return;
  const nom = e instanceof Error ? e.name : "Rejet";
  const message =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : (() => {
            try {
              return JSON.stringify(e) ?? String(e);
            } catch {
              return String(e);
            }
          })();
  if (BRUIT.test(message)) return;
  const cle = `${nom}|${message}`;
  if (signalees.has(cle) || signalees.size >= ERREURS_PAR_PAGE) return;
  signalees.add(cle);
  /* La première ligne de la pile qui vient de l’appli : son fichier, sa ligne */
  const pile = e instanceof Error ? e.stack?.split("\n").find((l) => l.includes("/_next/")) : undefined;
  signalerErreurDuNavigateur({ nom: nom.slice(0, 200), message: message.slice(0, 2000), etape, ...((source ?? pile) && { source: (source ?? pile)!.slice(0, 500) }) });
}

/* Les mesures de la page, gardées jusqu’à son départ ; l’écran où elle a été chargée (les Web Vitals sont ceux du premier chargement) */
const mesures = new Map<MetriqueWeb, number>();
let etapeDuChargement: ReturnType<typeof etapeDe> = null;

/* ———— Le toucher le plus lent de la page ———— */

type Toucher = NonNullable<Routes["POST /api/navigateur/mesures"]["corps"]["toucher"]>;
/** Un toucher plus rapide ne part pas en détail : le seuil « à améliorer » de Google pour la réponse au toucher. */
const TOUCHER_LENT_MS = 200;
/** Les éléments qu’on touche pour agir : le détail d’un toucher remonte jusqu’au premier d’entre eux. */
const ACTIFS = "a, button, input, textarea, select, label, summary, [role=button], [role=link], [role=tab], [role=option], [role=switch], [role=checkbox], [role=radio]";
/** Les gestes qui font un toucher (Event Timing) : leur écran et leur cible sont notés au moment même. */
const GESTES = ["pointerdown", "pointerup", "click", "keydown", "keyup"] as const;

/*
 * L’écran et la cible de chaque geste, à son heure (event.timeStamp, qui est le startTime de sa mesure) : la mesure
 * arrive après l’image suivante, quand l’écran a pu changer (un lien touché) et la cible quitter la page (un bandeau).
 */
const gestes = new Map<number, { etape: EtapeVisite | null; cible: string | null }>();
/* Le pire toucher de la page (son écran compte pour l’INP) et son heure ; `envoye` : son détail est déjà parti */
let pire: (Omit<Toucher, "etape" | "script"> & { etape: EtapeVisite; debut: number }) | null = null;
let envoye = false;
/* Les dernières longues images (Chrome, Edge : long-animation-frame) : le script le plus long de celle du pire toucher */
type Script = { duration: number; invokerType?: string; sourceURL?: string; sourceFunctionName?: string };
const images: { startTime: number; duration: number; scripts?: readonly Script[] }[] = [];

/** Le début du texte d’un élément, ses morceaux séparés (textContent les colle) ; sans innerText, qui forcerait la mise en page à chaque geste. */
function texteDe(el: Element): string {
  const parcours = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let texte = "";
  for (let n = parcours.nextNode(); n && texte.length < 80; n = parcours.nextNode()) texte += ` ${n.nodeValue ?? ""}`;
  return texte.replace(/\s+/g, " ").trim().slice(0, 50);
}

/**
 * Ce qui a été touché, pour l’équipe : la balise du premier élément actif (son chemin pour un lien de BLUSH, le nom du
 * site pour un autre, le type d’un champ), et son texte masqué comme dans l’enregistrement des visites (masquerTexte :
 * la conv, les prénoms, les emails). Un bouton sans texte (une icône) se dit par son nom pour les lecteurs d’écran
 * (aria-label), masqué pareil : avant le 12 novembre 2026, « Envoyer » du chat n’était qu’un « button ». Jamais ce qu’on
 * a écrit dans un champ.
 */
export function decrire(cible: EventTarget | null): string | null {
  if (!(cible instanceof Element)) return null;
  const el = cible.closest(ACTIFS);
  if (!el) return cible.tagName.toLowerCase();
  let quoi = el.tagName.toLowerCase();
  if (el instanceof HTMLAnchorElement && el.href)
    try {
      const u = new URL(el.href);
      quoi += u.origin === location.origin ? ` ${cheminSur(u.pathname)}` : ` ${u.host}`;
    } catch {
      /* Une adresse illisible : la balise seule */
    }
  if (el instanceof HTMLInputElement) quoi += ` ${el.type}`;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    const texte = texteDe(el) || (el.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    if (texte) quoi += ` «\u00a0${masquerTexte(texte, el)}\u00a0»`;
  }
  return quoi.slice(0, 160);
}

/** Le script le plus long des longues images d’un toucher (de son geste à l’image suivante), ou null (Safari n’en dit rien). */
function scriptDuToucher(debut: number, fin: number): string | null {
  let mieux: Script | null = null;
  for (const i of images) if (i.startTime <= fin && i.startTime + i.duration >= debut) for (const sc of i.scripts ?? []) if (!mieux || sc.duration > mieux.duration) mieux = sc;
  if (!mieux) return null;
  const fichier = (mieux.sourceURL ?? "").split(/[?#]/)[0]!.split("/").pop() || "page";
  return `${mieux.invokerType ?? "script"}:${fichier}${mieux.sourceFunctionName ? ` ${mieux.sourceFunctionName}` : ""} (${Math.round(mieux.duration)} ms)`;
}

/* interactionId (le toucher auquel la mesure appartient ; 0 pour un événement qui n’en est pas un) manque aux types de TypeScript */
type MesureDeGeste = PerformanceEventTiming & { interactionId?: number };

/** Pèse un toucher mesuré (Event Timing) : le plus lent de la page reste, avec l’écran et la cible de son geste. */
function peser(e: MesureDeGeste): void {
  if (!e.interactionId || (pire && e.duration <= pire.duree)) return;
  const geste = gestes.get(e.startTime);
  const etape = geste ? geste.etape : etapeDe(location.pathname);
  if (!etape) return;
  pire = {
    etape,
    debut: e.startTime,
    duree: e.duration,
    attente: Math.max(0, e.processingStart - e.startTime),
    traitement: Math.max(0, e.processingEnd - e.processingStart),
    affichage: Math.max(0, e.startTime + e.duration - e.processingEnd),
    cible: geste ? geste.cible : decrire(e.target),
  };
  envoye = false;
}

/** Suit les touchers de la page (Event Timing, et les longues images là où le navigateur les donne) ; rend de quoi arrêter. */
function suivreLesTouchers(): () => void {
  const noter = (e: Event) => {
    gestes.set(e.timeStamp, { etape: etapeDe(location.pathname), cible: decrire(e.target) });
    if (gestes.size > 60) gestes.delete(gestes.keys().next().value!);
  };
  for (const g of GESTES) window.addEventListener(g, noter, { capture: true, passive: true });
  const observateurs: PerformanceObserver[] = [];
  /* Un navigateur qui ne connaît pas l’un des deux types : sans lui, rien ne casse */
  try {
    const o = new PerformanceObserver((l) => l.getEntries().forEach((e) => peser(e as MesureDeGeste)));
    /* durationThreshold : au plus près de chaque toucher (16 ms, le minimum), aussi absent des types de TypeScript */
    o.observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    observateurs.push(o);
  } catch {}
  try {
    const o = new PerformanceObserver((l) => {
      images.push(...(l.getEntries() as unknown as typeof images));
      images.splice(0, Math.max(0, images.length - 20));
    });
    o.observe({ type: "long-animation-frame", buffered: true });
    observateurs.push(o);
  } catch {}
  return () => {
    for (const g of GESTES) window.removeEventListener(g, noter, { capture: true });
    observateurs.forEach((o) => o.disconnect());
  };
}

function envoyerLesMesures(): void {
  const toucher: Toucher | null =
    pire && !envoye && pire.duree >= TOUCHER_LENT_MS
      ? {
          etape: pire.etape,
          duree: Math.min(pire.duree, 120_000),
          attente: Math.min(pire.attente, 120_000),
          traitement: Math.min(pire.traitement, 120_000),
          affichage: Math.min(pire.affichage, 120_000),
          cible: pire.cible,
          script: scriptDuToucher(pire.debut, pire.debut + pire.duree),
        }
      : null;
  if ((!mesures.size && !toucher) || !etapeDuChargement) return;
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  /* La réponse au toucher compte sur l’écran du pire toucher ; les autres mesures, sur celui du chargement */
  const ecranDuToucher = pire && pire.etape !== etapeDuChargement ? pire.etape : null;
  envoyerMesuresDuNavigateur({
    etape: etapeDuChargement,
    mobile,
    mesures: [...mesures].map(([metrique, valeur]) => ({
      metrique,
      valeur: Math.max(0, Math.min(valeur, 120_000)),
      ...(metrique === "INP" && ecranDuToucher && { etape: ecranDuToucher }),
    })),
    ...(toucher && { toucher }),
  });
  mesures.clear();
  if (toucher) envoye = true;
}

/** La sentinelle, dans la mise en page de l’appli (src/app/layout.tsx). */
export function Sentinelle() {
  useReportWebVitals((m) => {
    if ((METRIQUES_WEB as readonly string[]).includes(m.name)) mesures.set(m.name as MetriqueWeb, m.value);
  });
  useEffect(() => {
    etapeDuChargement = etapeDe(window.location.pathname);
    const arreterLesTouchers = suivreLesTouchers();
    const erreur = (ev: ErrorEvent) => {
      /* Une erreur d’un script d’ailleurs (une extension, un autre site) n’est pas la nôtre */
      if (ev.filename && !ev.filename.startsWith(window.location.origin)) return;
      signalerErreur(ev.error ?? ev.message, ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : undefined);
    };
    const rejet = (ev: PromiseRejectionEvent) => signalerErreur(ev.reason);
    const cachee = () => {
      if (document.visibilityState === "hidden") envoyerLesMesures();
    };
    window.addEventListener("error", erreur);
    window.addEventListener("unhandledrejection", rejet);
    document.addEventListener("visibilitychange", cachee);
    window.addEventListener("pagehide", envoyerLesMesures);
    return () => {
      arreterLesTouchers();
      window.removeEventListener("error", erreur);
      window.removeEventListener("unhandledrejection", rejet);
      document.removeEventListener("visibilitychange", cachee);
      window.removeEventListener("pagehide", envoyerLesMesures);
    };
  }, []);
  return null;
}
