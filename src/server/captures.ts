import "server-only";
import { versTexteCaptures, type TexteCaptures } from "@prompts/lib/captures";
import { requeteCaptures, type Image } from "@prompts/lib/contextes";
import { Sortie01, type Captures } from "@prompts/lib/schemas";
import { CAPTURES_MAX } from "@/lib/limites";
import type { CodeErreur } from "@/types/erreurs-api";
import { utilisateurDeSession } from "./auth";
import { empreinte, jeton } from "./chiffrement";
import { lireSession } from "./cookies";
import type { LimiteDuCompte } from "./email-canonique";
import { env } from "./env";
import { ErreurPublique } from "./erreurs";
import { brouillonDe, metaDe, type Meta } from "./histoires";
import { ErreurImport } from "./import";
import { exigerSortie } from "./ia/appel-verifie";
import { appeler, type OptionsAppel } from "./ia/claude";
import { LIMITES, sousLaLimite } from "./limites";
import { sousLaLimiteDuCompte } from "./requete";
import { aujourdhuiParis } from "./temps";

const PLAFONDS = {
  captures: { anonymes: "capturesAnonymesParJour", compte: "capturesParCompte" },
  lots: { anonymes: "lotsAnonymesParJour", compte: "lotsParCompte" },
} as const satisfies Record<string, { anonymes: keyof typeof LIMITES; compte: LimiteDuCompte }>;

/**
 * Peut-on lire des captures (`quoi` : « captures », ou les « lots » d’un enregistrement d’écran) pour cette requête ? Le
 * modèle payant les lit avant l’email. À appeler une fois l’envoi vérifié, juste avant de lire : un envoi invalide ne
 * compte pas. `null` : la règle de la bêta seule (rien ne sera lu par le modèle).
 * - Bêta fermée, sans compte : « connexion ». Qui n’est pas invité ne pourrait pas lancer la lecture ensuite : on ne paie
 *   pas pour lui, et l’invité se connecte d’abord (l’écran des captures l’y envoie).
 * - Un compte connecté : sous sa limite du jour (rangée sur son email canonique), sinon « trop ».
 * - Bêta ouverte, sans compte : sous un plafond pour tous et par jour, sinon « trop ».
 * Les limites par IP de la route s’appliquent en plus.
 */
export async function lecturePermise(quoi: keyof typeof PLAFONDS | null): Promise<"ok" | LectureRefusee["code"]> {
  const utilisateur = await utilisateurDeSession(await lireSession());
  if (!utilisateur && env().BLUSH_BETA_FERMEE) return "connexion";
  if (!quoi) return "ok";
  const { anonymes, compte } = PLAFONDS[quoi];
  const ok = utilisateur ? await sousLaLimiteDuCompte(utilisateur, compte) : await sousLaLimite(anonymes, LIMITES[anonymes]);
  return ok ? "ok" : "trop";
}

/** La taille d’une capture reçue (déjà réduite par le navigateur) ; leur nombre, CAPTURES_MAX. */
const TAILLE_IMAGE_MAX = 2 * 1024 * 1024;

/**
 * Le type d’une image d’après ses premiers octets (sa « signature »), pas d’après celui que le navigateur déclare :
 * PNG (89 50 4E 47), JPEG (FF D8 FF), WEBP (« RIFF », 4 octets de taille, « WEBP »). Rien d’autre ne part au modèle.
 */
function typeImage(octets: Uint8Array): Image["media"] | null {
  const a = (k: number, ...attendus: number[]) => attendus.every((o, i) => octets[k + i] === o);
  if (a(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (a(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (a(0, 0x52, 0x49, 0x46, 0x46) && a(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Les captures envoyées (des fichiers image), vérifiées : nombre, taille, et type lu dans leurs octets. */
export async function imagesDe(fichiers: File[]): Promise<Image[]> {
  if (!fichiers.length || fichiers.length > CAPTURES_MAX) throw new ErreurImport("fichier");
  return Promise.all(
    fichiers.map(async (f) => {
      if (!f.type.startsWith("image/") || f.size > TAILLE_IMAGE_MAX) throw new ErreurImport("fichier");
      const octets = new Uint8Array(await f.arrayBuffer());
      const media = typeImage(octets);
      if (!media) throw new ErreurImport("fichier");
      return { media, base64: Buffer.from(octets).toString("base64") };
    }),
  );
}

/**
 * Lit les captures (prompt 01) et les remet au format « captures » que la lecture connaît. `envoi` : l’empreinte de
 * l’envoi (src/server/imports.ts), notée avec le coût de la lecture.
 * Rien de lisible (que des captures hors sujet) : l’erreur « capture », que le front sait afficher.
 */
export async function lireCaptures(images: Image[], appli: string, envoi: string | null = null): Promise<TexteCaptures> {
  return enTexte(await lireLot(images, appli, "captures", { envoi }));
}

/**
 * Ce qui accompagne la lecture d’un lot : l’empreinte de son envoi (la mesure des imports, src/server/imports.ts), et
 * pour un lot d’enregistrement (src/server/lots.ts) la sienne (`lot` : un nouvel essai qui le reprend en prend le coût),
 * de quoi l’arrêter (`signal` : son envoi abandonné), suivre son flux (`surAvance`) et dire quand sa réponse commence
 * (`auDebut` : le premier lot de l’envoi). Un lot gardé d’une longue vidéo, lu après le paiement
 * (src/server/suite-video.ts) : sa conv (`storyId`) et le jour de son import (`jour`, AAAA-MM-JJ : « hier » s’y date
 * comme à l’import).
 */
type SuiviDuLot = Pick<OptionsAppel, "envoi" | "lot" | "signal" | "surAvance" | "auDebut" | "storyId"> & { jour?: string };

/**
 * La lecture brute d’un lot d’images (des captures, ou les images d’un enregistrement d’écran). Les lots d’un
 * enregistrement sont notés à part dans ai_usage (« captures_video »), ceux de la suite d’une longue vidéo, lus après le
 * paiement, aussi (« captures_suite ») : la durée d’un import de captures (un seul appel, de 1 à 20 images) se mesure
 * alors sans eux, pour décider s’il faut le lire en lots. Une sortie illisible : « fichier » ; un refus du modèle :
 * « refus » (exigerSortie). Ce que lit le modèle ne dépend que des images, de l’appli et du jour : la même lecture peut
 * resservir (src/server/lots.ts).
 */
export async function lireLot(
  images: Image[],
  appli: string,
  etiquette: "captures" | "captures_video" | "captures_suite" = "captures",
  { jour, ...suivi }: SuiviDuLot = {},
): Promise<Captures> {
  /*
   * Le budget de l’IA du jour (src/server/budget.ts) : la suite d’une vidéo est payée par le compte de sa conv (lue hors
   * de toute requête du navigateur : la chaîne), une autre lecture par le compte connecté, sinon par la part sans compte
   */
  const compte = suivi.storyId ? undefined : await utilisateurDeSession(await lireSession());
  const aujourdhui = jour ? Date.parse(`${jour}T00:00:00Z`) : aujourdhuiParis().t;
  const a = await appeler(requeteCaptures({ prenom: "l’utilisateur", autre: null, appli, aujourdhui, images }), Sortie01, {
    etiquette,
    ...(compte === undefined ? {} : { compte }),
    ...suivi,
  });
  return exigerSortie(a, () => new ErreurImport("fichier"));
}

/** Une lecture au format « captures » que la lecture de la conv connaît. Rien de lisible : l’erreur « capture ». */
export function enTexte(c: Captures): TexteCaptures {
  const t = versTexteCaptures(c, { aujourdhui: aujourdhuiParis().iso });
  if (!t.messages) throw new ErreurCaptures();
  return t;
}

/** Aucune capture ne montre leur conv : « capture ». */
export class ErreurCaptures extends ErreurPublique<"capture"> {
  constructor() {
    super("capture");
  }
}

/** La lecture n’est pas permise (voir lecturePermise) : la route le dit au navigateur. */
export class LectureRefusee extends ErreurPublique<Extract<CodeErreur, "connexion" | "trop">> {}

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

/**
 * Des captures (ou un enregistrement) ajoutées une seule fois par envoi au brouillon `brouillon`, un morceau de plus
 * (src/server/morceaux.ts) : comme uneSeuleLecture, un nouvel essai rejoint l’ajout en cours sur cette instance, ou
 * retrouve le morceau déjà ajouté sous la clé de l’envoi (`deja`, sur n’importe quelle instance), sans rappeler le modèle.
 */
export async function unSeulAjout(cle: string | null, brouillon: string, ajouter: () => Promise<Brouillon>, deja: () => Promise<Brouillon | null>): Promise<Brouillon> {
  if (!cle) return ajouter();
  const k = empreinte(`ajout:${brouillon}:${cle}`);
  const maintenant = Date.now();
  for (const [c, r] of RECENTES) if (r.jusqua < maintenant) RECENTES.delete(c);
  const enCours = RECENTES.get(k);
  if (enCours) return enCours.lecture;
  /* Posé avant toute attente : deux essais arrivés ensemble n’ajoutent pas deux fois */
  const lecture = (async () => (await deja()) ?? ajouter())().catch((e: unknown) => {
    RECENTES.delete(k);
    throw e;
  });
  RECENTES.set(k, { lecture, jusqua: maintenant + GARDE_MS });
  return lecture;
}

async function dejaCree(secret: string): Promise<Brouillon | null> {
  const ligne = await brouillonDe(secret);
  return ligne ? { id: ligne.id, meta: metaDe(ligne), secret, messages: ligne.messageCount } : null;
}
