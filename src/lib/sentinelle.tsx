"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { envoyerMesuresDuNavigateur, signalerErreurDuNavigateur } from "@/services/api";
import { METRIQUES_WEB, type MetriqueWeb } from "@/types";
import { etapeDe } from "./presence";

/*
 * La sentinelle : ce que le serveur ne voit pas, envoyé pour /admin (src/server/navigateur.ts). Les erreurs de l’appli
 * dans ce navigateur (une erreur qui n’est rattrapée par rien, une promesse rejetée sans suite, et les pages d’erreur :
 * signalerErreur), et la vitesse de la page (les Web Vitals de Next : l’affichage, la réponse au toucher, la mise en
 * page qui saute), envoyée une fois quand la page passe à l’arrière-plan ou se ferme. Seulement l’écran (etapeDe),
 * jamais l’adresse ; rien sur les outils de l’équipe. Le serveur masque et borne le reste.
 */

/** Pas plus d’erreurs que ça par page : une erreur dans une boucle ne fait pas une rafale. */
const ERREURS_PAR_PAGE = 5;
const signalees = new Set<string>();

/** Le bruit connu, qui n’est pas un bug de l’appli : une erreur d’un script d’un autre site (opaque), ResizeObserver. */
const BRUIT = /^(Script error\.?|ResizeObserver loop)/;

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

function envoyerLesMesures(): void {
  if (!mesures.size || !etapeDuChargement) return;
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  envoyerMesuresDuNavigateur({
    etape: etapeDuChargement,
    mobile,
    mesures: [...mesures].map(([metrique, valeur]) => ({ metrique, valeur: Math.max(0, Math.min(valeur, 120_000)) })),
  });
  mesures.clear();
}

/** La sentinelle, dans la mise en page de l’appli (src/app/layout.tsx). */
export function Sentinelle() {
  useReportWebVitals((m) => {
    if ((METRIQUES_WEB as readonly string[]).includes(m.name)) mesures.set(m.name as MetriqueWeb, m.value);
  });
  useEffect(() => {
    etapeDuChargement = etapeDe(window.location.pathname);
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
      window.removeEventListener("error", erreur);
      window.removeEventListener("unhandledrejection", rejet);
      document.removeEventListener("visibilitychange", cachee);
      window.removeEventListener("pagehide", envoyerLesMesures);
    };
  }, []);
  return null;
}
