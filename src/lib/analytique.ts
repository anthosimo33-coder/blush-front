"use client";

import type { CaptureResult, PostHog, PostHogConfig, Properties } from "posthog-js";
import { etapeDe } from "./presence";
import { cleDePostHog } from "./publique";

/*
 * La mesure d’audience chez PostHog (son serveur européen, à Francfort), en plus d’/admin : des tunnels et des cohortes
 * à la volée, sur les pages vues et les jalons du tunnel (src/lib/jalons.ts). Ce qu’il reçoit, et rien d’autre :
 * - sans cookie ni rien de gardé dans le navigateur (cookieless_mode : PostHog reconnaît un visiteur du jour par une
 *   empreinte qu’il calcule chez lui) ; ni compte, ni email, ni prénom : jamais d’identify, ni de profil ;
 * - l’adresse des pages sans ce qui pourrait dire qui l’on est : ni sa requête (sauf les utm_ des créatrices), ni ses
 *   identifiants (une conv, un lien partagé, un code de parrainage, un lien de tournage deviennent « :id »), ni le titre
 *   de la page ; d’un autre site, seulement son nom (nettoyer) ;
 * - ni clics automatiques, ni enregistrements, ni sondages, ni réglages lus chez PostHog (advanced_disable_flags) : rien
 *   ne peut s’allumer depuis son tableau de bord sans passer par ce fichier ;
 * - par une adresse de BLUSH (/ingest, src/proxy.ts), qui retire nos cookies avant de passer la requête à PostHog, et
 *   ne passe rien en mode tournage.
 * Chargé une fois la page prête, jamais sur les outils de l’équipe, et seulement avec sa clé (NEXT_PUBLIC_POSTHOG_CLE) :
 * en local et dans les tests, rien ne part. Une mesure ratée ne se voit pas.
 */

/** Les paramètres d’une adresse qu’on garde : ceux des liens des créatrices. */
const UTM = /^utm_(source|medium|campaign|content|term)$/;
/** Les pages dont le morceau d’après est un identifiant : un verdict partagé, un parrainage, un lien de mail, un lien de tournage. */
const AVEC_IDENTIFIANT = new Set(["v", "p", "ouvrir", "tournage"]);
/** Un identifiant ailleurs dans une adresse : un uuid. */
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Un chemin de l’appli sans ses identifiants : « /v/:id », « /ouvrir/:id ». */
export function cheminSur(chemin: string): string {
  const morceaux = chemin.split("/");
  return morceaux.map((m, k) => (m && ((k === 2 && AVEC_IDENTIFIANT.has(morceaux[1] ?? "")) || UUID.test(m)) ? ":id" : m)).join("/");
}

/**
 * Une adresse sans ce qui pourrait dire qui l’on est : sur BLUSH, son chemin sans identifiants et ses seuls utm_ ;
 * d’un autre site (le site d’avant), son nom seul. Ce qui n’est pas une adresse (« $direct ») reste tel quel.
 */
export function adresseSure(valeur: string, origine: string): string {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return valeur;
  }
  if (url.origin !== origine) return url.origin;
  const utm = [...url.searchParams].filter(([nom]) => UTM.test(nom));
  return `${url.origin}${cheminSur(url.pathname)}${utm.length ? `?${new URLSearchParams(utm)}` : ""}`;
}

/** Le titre de la page, sous ses deux noms (« title » pour une page vue) : il peut dire un prénom, il ne part jamais. */
const TITRES = new Set(["title", "$title"]);

/* Les propriétés d’un événement nettoyées : les adresses et les chemins, et jamais le titre de la page */
function proprietesSures(p: Properties, origine: string): Properties {
  const sures: Properties = {};
  for (const [cle, valeur] of Object.entries(p)) {
    if (TITRES.has(cle)) continue;
    if (typeof valeur !== "string") sures[cle] = valeur;
    else if (/(url|referrer)$/i.test(cle)) sures[cle] = adresseSure(valeur, origine);
    else if (/pathname$/i.test(cle)) sures[cle] = cheminSur(valeur);
    else sures[cle] = valeur;
  }
  return sures;
}

/** Ce qui part chez PostHog, juste avant de partir : rien depuis un outil de l’équipe, et des adresses nettoyées. */
export function nettoyer(e: CaptureResult | null, ici: Location = window.location): CaptureResult | null {
  if (!e || etapeDe(ici.pathname) === null) return null;
  return {
    ...e,
    properties: proprietesSures(e.properties, ici.origin),
    ...(e.$set ? { $set: proprietesSures(e.$set, ici.origin) } : {}),
    ...(e.$set_once ? { $set_once: proprietesSures(e.$set_once, ici.origin) } : {}),
  };
}

/** Les réglages de PostHog : voir l’en-tête du fichier. */
const REGLAGES: Partial<PostHogConfig> = {
  api_host: "/ingest",
  ui_host: "https://eu.posthog.com",
  defaults: "2026-01-30",
  cookieless_mode: "always",
  persistence: "memory",
  person_profiles: "never",
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_exceptions: false,
  capture_performance: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  disable_external_dependency_loading: true,
  advanced_disable_flags: true,
  mask_all_text: true,
  mask_all_element_attributes: true,
  before_send: (e) => nettoyer(e),
};

/* PostHog, une fois chargé ; avant, les événements attendent (au plus ATTENTE_MAX) */
let posthog: PostHog | null = null;
let demarre = false;
const enAttente: string[] = [];
const ATTENTE_MAX = 50;

/**
 * Lance la mesure (src/instrumentation-client.ts), une fois : PostHog se charge quand la page est prête et que le
 * navigateur a le temps (3 s au plus après), pour ne rien retarder de ce qu’on voit. Sa page vue arrive avec lui.
 */
export function demarrerLaMesure(): void {
  const cle = cleDePostHog();
  if (demarre || !cle || typeof window === "undefined" || etapeDe(window.location.pathname) === null) return;
  demarre = true;
  const charger = () =>
    void import("posthog-js").then(
      ({ default: ph }) => {
        ph.init(cle, REGLAGES);
        posthog = ph;
        for (const evenement of enAttente.splice(0)) ph.capture(evenement);
      },
      () => {},
    );
  const quandLibre = () => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(charger, { timeout: 3000 }) : window.setTimeout(charger, 1000));
  if (document.readyState === "complete") quandLibre();
  else window.addEventListener("load", quandLibre, { once: true });
}

/** Compte un événement chez PostHog (un jalon du tunnel), ou le garde le temps qu’il se charge. Sans clé : rien. */
export function mesurer(evenement: string): void {
  if (!cleDePostHog()) return;
  if (posthog) posthog.capture(evenement);
  else if (enAttente.length < ATTENTE_MAX) enAttente.push(evenement);
}
