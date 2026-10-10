"use client";

import { useEffect } from "react";

/*
 * Réveiller le serveur avant d’en avoir besoin. Après quelques minutes sans requête, la première paie le démarrage
 * d’une instance et le réveil de la base (1 à 2 s d’écran figé). On lance donc une requête minuscule (/api/reveil) au
 * chargement, au retour dans l’appli après une longue absence, et quand le champ du chat prend le focus (l’accueil
 * appelle reveiller()) : le temps que le message s’écrive, tout est réveillé. Sa réponse n’est jamais attendue.
 */

/** Une absence plus longue : l’instance et la base se sont peut-être endormies. */
const ABSENCE_MS = 4 * 60_000;
/** Pas deux réveils dans la même minute : juste après une requête, tout est déjà réveillé. */
const ECART_MS = 60_000;

let dernier = 0;

/** Réveille le serveur, sans attendre. Pas deux fois dans la même minute. */
export function reveiller(): void {
  if (Date.now() - dernier < ECART_MS) return;
  dernier = Date.now();
  void fetch("/api/reveil", { cache: "no-store" }).catch(() => {});
}

/** Le réveil au chargement de l’appli, et au retour au premier plan après plus de 4 minutes. */
export function Reveil() {
  useEffect(() => {
    reveiller();
    let parti = 0;
    const visibilite = () => {
      if (document.visibilityState === "hidden") parti = Date.now();
      else if (parti && Date.now() - parti > ABSENCE_MS) reveiller();
    };
    document.addEventListener("visibilitychange", visibilite);
    return () => document.removeEventListener("visibilitychange", visibilite);
  }, []);
  return null;
}
