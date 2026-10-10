import "server-only";
import { versTexteCaptures, type TexteCaptures } from "@prompts/lib/captures";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import { Sortie01, type Captures } from "@prompts/lib/schemas";
import { utilisateurDeSession } from "./auth";
import { empreinte, jeton } from "./chiffrement";
import { lireSession } from "./cookies";
import { env } from "./env";
import { brouillonDe, ErreurImport, metaDe, type Meta } from "./histoires";
import { appeler } from "./ia/claude";
import { LIMITES, sousLaLimite } from "./limites";
import { aujourdhuiParis } from "./temps";

const PLAFONDS = {
  captures: { anonymes: "capturesAnonymesParJour", compte: "capturesParCompte" },
  lots: { anonymes: "lotsAnonymesParJour", compte: "lotsParCompte" },
} as const;

/**
 * Peut-on lire des captures (`quoi` : « captures », ou les « lots » d’un enregistrement d’écran) pour cette requête ? Le
 * modèle payant les lit avant l’email. À appeler une fois l’envoi vérifié, juste avant de lire : un envoi invalide ne
 * compte pas. `null` : la règle de la bêta seule (rien ne sera lu par le modèle).
 * - Bêta fermée, sans compte : « connexion ». Qui n’est pas invité ne pourrait pas lancer la lecture ensuite : on ne paie
 *   pas pour lui, et l’invité se connecte d’abord (l’écran des captures l’y envoie).
 * - Un compte connecté : sous sa limite du jour, sinon « trop ».
 * - Bêta ouverte, sans compte : sous un plafond pour tous et par jour, sinon « trop ».
 * Les limites par IP de la route s’appliquent en plus.
 */
export async function lecturePermise(quoi: keyof typeof PLAFONDS | null): Promise<"ok" | "connexion" | "trop"> {
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur && env().BLUSH_BETA_FERMEE) return "connexion";
  if (!quoi) return "ok";
  const { anonymes, compte } = PLAFONDS[quoi];
  const ok = utilisateur ? await sousLaLimite(`${compte}:${utilisateur.id}`, LIMITES[compte]) : await sousLaLimite(anonymes, LIMITES[anonymes]);
  return ok ? "ok" : "trop";
}

/** Combien de captures à la fois, et leur taille (déjà réduites par le navigateur). */
const CAPTURES_MAX = 20;
const TAILLE_IMAGE_MAX = 2 * 1024 * 1024;

/** Les captures envoyées (des fichiers image), vérifiées : type, nombre, taille. */
export async function imagesDe(fichiers: File[]): Promise<Image[]> {
  if (!fichiers.length || fichiers.length > CAPTURES_MAX) throw new ErreurImport("fichier");
  return Promise.all(
    fichiers.map(async (f) => {
      const media = f.type === "image/png" || f.type === "image/webp" ? f.type : "image/jpeg";
      if (!f.type.startsWith("image/") || f.size > TAILLE_IMAGE_MAX) throw new ErreurImport("fichier");
      return { media, base64: Buffer.from(await f.arrayBuffer()).toString("base64") };
    }),
  );
}

/**
 * Lit les captures (prompt 01) et les remet au format « captures » que la lecture connaît.
 * Rien de lisible (que des captures hors sujet) : l’erreur « capture », que le front sait afficher.
 */
export async function lireCaptures(images: Image[], appli: string): Promise<TexteCaptures> {
  return enTexte(await lireLot(images, appli));
}

/**
 * La lecture brute d’un lot d’images (des captures, ou les images d’un enregistrement d’écran). Les lots d’un
 * enregistrement sont notés à part dans ai_usage (« captures_video ») : la durée d’un import de captures (un seul appel,
 * de 1 à 20 images) se mesure alors sans eux, pour décider s’il faut le lire en lots.
 */
export async function lireLot(images: Image[], appli: string, etiquette: "captures" | "captures_video" = "captures"): Promise<Captures> {
  const a = await appeler(requeteCaptures({ prenom: "l’utilisateur", autre: null, appli, aujourdhui: aujourdhuiParis().t, images }), Sortie01, { etiquette });
  if (!a.sortie) throw new ErreurImport("fichier");
  return a.sortie;
}

/** Une lecture au format « captures » que la lecture de la conv connaît. Rien de lisible : l’erreur « capture ». */
export function enTexte(c: Captures): TexteCaptures {
  const t = versTexteCaptures(c, { aujourdhui: aujourdhuiParis().iso });
  if (!t.messages) throw new ErreurCaptures();
  return t;
}

/** Aucune capture ne montre leur conv. */
export class ErreurCaptures extends Error {}

/** La lecture n’est pas permise (voir lecturePermise) : la route le dit au navigateur. */
export class LectureRefusee extends Error {
  constructor(readonly code: "connexion" | "trop") {
    super(code);
  }
}

/* ———— Un envoi coupé, repris ———— */

/** La clé d’un envoi, venue du navigateur (un uuid) ; ce qui n’en a pas la forme est ignoré (une lecture, comme avant). */
export const cleEnvoi = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f-]{16,64}$/i.test(v) ? v : null);

/** Ce qu’une lecture de captures (ou d’enregistrement) a créé : le brouillon, et combien de messages elle a lus. */
export type Brouillon = { id: string; meta: Meta; secret: string; messages: number };

/*
 * Les lectures en cours ou finies depuis peu sur cette instance, par secret de brouillon : un nouvel essai qui arrive
 * pendant la lecture la rejoint, au lieu d’en lancer une seconde (payée deux fois).
 */
const RECENTES = new Map<string, { lecture: Promise<Brouillon>; jusqua: number }>();
const GARDE_MS = 10 * 60e3;

/**
 * Une lecture une seule fois par envoi. La lecture de 30 s à 2 min tient dans une seule réponse : si le réseau coupe
 * (Safari en arrière-plan, le Wi-Fi qui passe en 4G), le navigateur réessaie avec la même clé. Le secret du brouillon
 * est tiré de cette clé et du compte connecté : le nouvel essai rejoint la lecture en cours (cette instance), ou retrouve
 * le brouillon déjà créé (n’importe quelle instance), sans rappeler le modèle ni recompter les plafonds. Une clé ne sert
 * qu’à son compte ; sans compte, seul le navigateur qui l’a tirée la connaît. La lecture continue même si le navigateur
 * est parti : c’est ce qui permet de la reprendre. Sans clé : une lecture, comme avant.
 */
export async function uneSeuleLecture(cle: string | null, lire: (secret: string) => Promise<Brouillon>): Promise<Brouillon> {
  if (!cle) return lire(jeton());
  const utilisateur = await utilisateurDeSession(await lireSession());
  const secret = empreinte(`reprise:${utilisateur?.id ?? "-"}:${cle}`);
  const maintenant = Date.now();
  for (const [k, r] of RECENTES) if (r.jusqua < maintenant) RECENTES.delete(k);
  const enCours = RECENTES.get(secret);
  if (enCours) return enCours.lecture;
  /* Posée avant toute attente : deux essais arrivés ensemble ne lisent pas deux fois */
  const lecture = (async () => (await dejaCree(secret)) ?? lire(secret))().catch(async (e: unknown) => {
    RECENTES.delete(secret);
    /* Deux essais lus en même temps sur deux instances : le second bute sur le brouillon du premier, qu’on rend */
    const deja = await dejaCree(secret).catch(() => null);
    if (deja) return deja;
    throw e;
  });
  RECENTES.set(secret, { lecture, jusqua: maintenant + GARDE_MS });
  return lecture;
}

async function dejaCree(secret: string): Promise<Brouillon | null> {
  const ligne = await brouillonDe(secret);
  return ligne ? { id: ligne.id, meta: metaDe(ligne), secret, messages: ligne.messageCount } : null;
}
