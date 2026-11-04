"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { faireSigne } from "@/services/api";
import type { EtapeVisite } from "@/types";
import { arriveeDe } from "./chemins";

/*
 * Le signe des onglets ouverts (POST /api/presence), pour /admin : compter les visiteurs du jour et voir qui est sur le
 * site en ce moment. Sans cookie ni rien de gardé dans le navigateur : un identifiant tiré au hasard au chargement de la
 * page (oublié en la quittant), l’écran où l’on est, d’où l’on vient (utm_source, le site d’avant), et au premier signe
 * la page d’arrivée (son chemin nettoyé, src/lib/chemins.ts).
 * Un signe toutes les 40 secondes tant que l’onglet est visible, et un tout de suite à chaque changement d’écran.
 * Jamais sur les outils de l’équipe (/admin, /apercu, /styleguide). Un signe raté ne se voit pas (faireSigne).
 */

/** Tous les combien un onglet visible fait signe : deux par minute au moins, pour qu’aucune minute ne manque au direct. */
const PERIODE_MS = 40_000;

/** L’écran d’un chemin de l’appli ; null : un outil de l’équipe, qui ne fait pas signe. */
export function etapeDe(chemin: string): EtapeVisite | null {
  const premier = chemin.split("/")[1] ?? "";
  if (["admin", "apercu", "styleguide"].includes(premier)) return null;
  if (chemin === "/") return "accueil";
  if (premier === "v") return "partage";
  if (premier === "guides" || premier === "lexique") return "guides";
  if (["importer", "commencer", "qui", "email"].includes(premier)) return "import";
  if (premier === "lecture" || chemin === "/rapport/verdict") return "verdict";
  if (chemin === "/rapport/debloque" || premier === "paiement") return "paiement";
  if (premier === "rapport") return "rapport";
  if (premier === "app") return "chat";
  if (["compte", "connexion", "effacer", "desinscription"].includes(premier)) return "compte";
  return "autre";
}

/* Un identifiant v4, même là où crypto.randomUUID manque (un navigateur ancien) */
function identifiant(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const o = crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6]! & 0x0f) | 0x40;
  o[8] = (o[8]! & 0x3f) | 0x80;
  const h = [...o].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* L’état de l’onglet, pour la vie de la page */
let onglet: string | null = null;
let premier = true;
let provenance: { utm?: string; referent?: string } = {};
let etapeDuChemin: EtapeVisite | null = null;
/* Une feuille ouverte par-dessus la page (le paiement, la recharge) l’emporte sur le chemin */
let etapeDeLaFeuille: EtapeVisite | null = null;
let dernier = 0;

/**
 * Fait signe maintenant (si l’onglet est visible et n’est pas un outil de l’équipe). Le premier dit aussi la page
 * d’arrivée : celle où l’on est à ce moment-là, la première que l’onglet montre hors des outils de l’équipe.
 */
function signe(): void {
  const etape = etapeDeLaFeuille ?? etapeDuChemin;
  if (!etape || !onglet || document.visibilityState !== "visible") return;
  dernier = Date.now();
  const arrivee = premier ? arriveeDe(window.location.pathname) : null;
  faireSigne({ onglet, etape, premier, ...provenance, ...(arrivee && { arrivee }) });
  premier = false;
}

/**
 * Le site d’avant (document.referrer), sans son chemin ni sa requête : son nom suffit à dire d’où l’on vient. Une appli
 * Android (android-app://<paquet>/…, l’appli Google et Discover, Gmail) n’a pas d’origine : son paquet seul. Rien pour
 * une page de BLUSH, une adresse sans origine, ou pas d’adresse.
 */
export function referentDe(referrer: string, origine: string): string | undefined {
  try {
    const avant = referrer ? new URL(referrer) : null;
    if (!avant) return undefined;
    if (avant.protocol === "android-app:") return avant.hostname ? `android-app://${avant.hostname}`.slice(0, 200) : undefined;
    return avant.origin !== "null" && avant.origin !== origine ? avant.origin.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/* Une feuille ouverte ou refermée : le direct la voit tout de suite, même si l’adresse ne change pas */
function etapeDeFeuille(etape: EtapeVisite | null): void {
  if (etapeDeLaFeuille === etape) return;
  etapeDeLaFeuille = etape;
  signe();
}

/** Une feuille de paiement ou de recharge : tant qu’elle est ouverte, l’onglet est « au paiement ». */
export function useAuPaiement(ouverte: boolean): void {
  useEffect(() => {
    if (!ouverte) return;
    etapeDeFeuille("paiement");
    return () => etapeDeFeuille(null);
  }, [ouverte]);
}

/** Monté une fois (le layout) : le premier signe, puis un toutes les 40 secondes, et un à chaque changement d’écran. */
export function Presence() {
  const chemin = usePathname();
  useEffect(() => {
    onglet ??= identifiant();
    const ici = new URL(window.location.href);
    const utm = ici.searchParams.get("utm_source")?.slice(0, 80) || undefined;
    provenance = { utm, referent: referentDe(document.referrer, ici.origin) };
    const minuterie = window.setInterval(signe, PERIODE_MS);
    const visibilite = () => {
      if (document.visibilityState === "visible" && Date.now() - dernier >= PERIODE_MS) signe();
    };
    document.addEventListener("visibilitychange", visibilite);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", visibilite);
    };
  }, []);
  useEffect(() => {
    etapeDuChemin = etapeDe(chemin);
    signe();
  }, [chemin]);
  return null;
}
