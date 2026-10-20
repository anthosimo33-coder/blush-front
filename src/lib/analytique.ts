"use client";

import type { CaptureResult, PostHog, PostHogConfig, Properties } from "posthog-js";
import { etapeDe } from "./presence";
import { masquerTexte } from "./secrets";
import { cleDePostHog } from "./publique";

/*
 * La mesure d’audience chez PostHog (son serveur européen, à Francfort), en plus d’/admin : des tunnels et des cohortes
 * à la volée, sur les pages vues et les jalons du tunnel (src/lib/jalons.ts), et l’enregistrement des visites (validé
 * par l’avocat le 19 octobre, sans demande d’accord, sur tout le site). Ce qu’il reçoit, et rien d’autre :
 * - sans cookie ni rien de gardé dans le navigateur (persistence « memory ») : un identifiant tiré au hasard au
 *   chargement de la page, oublié en la quittant, comme le signe de présence (src/lib/presence.ts) ; une page
 *   rechargée est un nouveau visiteur pour PostHog (/admin, lui, compte juste). Pas le mode sans cookie de PostHog
 *   (cookieless_mode) : sans identifiant de visite, il n’enregistre rien (choix du 19 octobre). Ni compte, ni email, ni
 *   prénom : jamais d’identify, ni de profil ;
 * - l’adresse des pages sans ce qui pourrait dire qui l’on est : ni sa requête (sauf les utm_ des créatrices), ni ses
 *   identifiants (une conv, un lien partagé, un code de parrainage, un lien de tournage deviennent « :id »), ni le titre
 *   de la page ; d’un autre site, seulement son nom (nettoyer) ;
 * - l’enregistrement des visites montre les écrans de BLUSH tels qu’ils s’affichent (les titres, les boutons, les
 *   messages d’erreur : décidé le 20 octobre, tout masqué ne servait à rien), jamais la conv ni qui l’on est
 *   (masquerTexte) : tout le texte d’une zone marquée `data-prive` (le chat, le rapport, la fiche, la lecture, le haut
 *   du paywall, les avatars…), les prénoms et l’email retenus de la conv ouverte (retenirSecrets, partout ailleurs), tout
 *   email, le titre de la page, et toutes les saisies masqués (« *** ») ; les images, les vidéos et les cadres bloqués
 *   (un rectangle vide : les captures d’une conv, l’enregistrement d’écran, la carte de Whop), les attributs qui peuvent
 *   dire un prénom masqués (aria-label, title, alt…), les liens et l’adresse des pages nettoyés comme le reste, ni la
 *   console, ni le réseau. L’enregistreur est dans le code (posthog-recorder) : aucun script chargé depuis PostHog ;
 * - ni clics automatiques, ni sondages, ni heatmaps, ni web vitals, ni exceptions : coupés ici, ils le restent quoi que
 *   dise le tableau de bord de PostHog, dont on lit les réglages (il le faut pour l’enregistrement : sa part des
 *   visites enregistrées, sa durée minimale) ;
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

/** Un uuid, où qu’il soit dans un texte. */
const UUIDS = /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi;
/** Les attributs qui portent un texte lisible (un prénom dans une étiquette, un nom de fichier) : masqués dans l’enregistrement. */
const ATTRIBUTS_LISIBLES = new Set([
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-placeholder",
  "aria-roledescription",
  "title",
  "alt",
  "placeholder",
  "label",
  "value",
  "content",
  "download",
  /* La citation d’une bulle de BLUSH (src/app/app/accueil/bulles.tsx) */
  "data-quote",
]);
/** Les attributs qui portent une adresse : nettoyés comme celle de la page. */
const ATTRIBUTS_ADRESSE = new Set(["href", "src", "srcset", "action", "formaction", "poster", "xlink:href", "cite", "data"]);

/**
 * Un attribut d’un élément, tel qu’il part dans l’enregistrement (maskAttributeFn) : un texte lisible masqué, une
 * adresse nettoyée (sans requête ni identifiant ; d’un autre site, son nom ; un fichier du navigateur, rien), et
 * partout ailleurs les uuid remplacés.
 */
export function attributSur(nom: string, valeur: string, origine: string = window.location.origin): string {
  if (ATTRIBUTS_LISIBLES.has(nom)) return "***";
  if (ATTRIBUTS_ADRESSE.has(nom)) {
    if (/^(blob|data):/i.test(valeur)) return "";
    if (/^(mailto|tel):/i.test(valeur)) return valeur;
    try {
      const url = new URL(valeur, origine);
      const sure = adresseSure(url.href, origine);
      /* Une adresse relative le reste */
      return url.origin === origine && !/^[a-z][a-z\d+.-]*:/i.test(valeur) ? sure.slice(origine.length) || "/" : sure;
    } catch {
      return "";
    }
  }
  return valeur.replace(UUIDS, ":id");
}

/*
 * Les morceaux d’un enregistrement ($snapshot) : l’adresse de la page qu’ils portent (l’événement « meta » de rrweb,
 * et celle des événements de PostHog qu’il y glisse), nettoyée comme les autres. Le reste (le DOM) l’est déjà par
 * l’enregistreur (maskTextSelector, blockSelector, attributSur).
 */
function morceauxSurs(morceaux: unknown, origine: string): unknown {
  if (!Array.isArray(morceaux)) return morceaux;
  return morceaux.map((m: unknown) => {
    if (!m || typeof m !== "object" || !("data" in m) || !m.data || typeof m.data !== "object") return m;
    const data: Record<string, unknown> = { ...(m.data as Record<string, unknown>) };
    if (typeof data.href === "string") data.href = adresseSure(data.href, origine);
    if (data.payload && typeof data.payload === "object" && "href" in data.payload && typeof data.payload.href === "string")
      data.payload = { ...data.payload, href: adresseSure(data.payload.href, origine) };
    return { ...m, data };
  });
}

/** Le titre de la page, sous ses deux noms (« title » pour une page vue) : il peut dire un prénom, il ne part jamais. */
const TITRES = new Set(["title", "$title"]);

/* Les propriétés d’un événement nettoyées : les adresses et les chemins, et jamais le titre de la page */
function proprietesSures(p: Properties, origine: string): Properties {
  const sures: Properties = {};
  for (const [cle, valeur] of Object.entries(p)) {
    if (TITRES.has(cle)) continue;
    if (cle === "$snapshot_data") sures[cle] = morceauxSurs(valeur, origine);
    else if (typeof valeur !== "string") sures[cle] = valeur;
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
  persistence: "memory",
  person_profiles: "never",
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_exceptions: false,
  capture_performance: false,
  disable_session_recording: false,
  enable_recording_console_log: false,
  session_recording: {
    maskAllInputs: true,
    /* Chaque texte passe par masquerTexte, qui décide : l’interface lisible, la conv et qui l’on est masqués */
    maskTextSelector: "*",
    maskTextFn: (texte, element) => masquerTexte(texte, element),
    blockSelector: "img, picture, video, canvas, iframe, object, embed",
    maskAttributeFn: (nom, valeur) => attributSur(nom, valeur),
    slimDOMOptions: "all",
    recordHeaders: false,
    recordBody: false,
    recordCrossOriginIframes: false,
    captureJsonLd: false,
    collectFonts: false,
    /* Les morceaux partent tels quels (la requête, elle, reste compressée) : before_send peut en nettoyer l’adresse */
    compress_events: false,
  },
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  disable_external_dependency_loading: true,
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
  /* L’enregistreur avec PostHog : il se pose sur la page (window.__PosthogExtensions__), qu’aucun script ne vienne de chez PostHog */
  const charger = () =>
    void Promise.all([import("posthog-js"), import("posthog-js/dist/posthog-recorder")]).then(
      ([{ default: ph }]) => {
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
