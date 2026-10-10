/*
 * Les erreurs de l’API, du serveur jusqu’aux écrans : la seule liste de leurs codes, avec leur statut HTTP. Sans
 * server-only : le serveur répond `{ erreur: code }` (src/server/http.ts), le navigateur en fait une ErreurApi, et ses
 * écrans un texte (src/lib/messages-erreur.ts). Un code ne dit jamais rien d’interne.
 * Une seule exception : un mauvais code de connexion (/api/auth/verifier) répond 200 `{ ok: false }`, la même réponse
 * pour tous, invités ou non.
 */
export const ERREURS_API = {
  /* La requête */
  /** Elle ne vient pas de l’appli (memeOrigine). */
  origine: 403,
  /** Pas de session (ou plus de session), ou la bêta fermée qui demande un compte. */
  connexion: 401,
  /** La purge de la nuit, sans le bon secret. */
  interdit: 401,
  /** Bêta fermée : un email retiré de la liste après l’envoi de son code. */
  beta: 403,
  /** Une limite atteinte (src/server/limites.ts). */
  trop: 429,

  /* Ce qu’elle désigne */
  /** Pas de conv ouverte (ou plus). */
  aucune: 404,
  /** Ce qu’on demande n’existe pas, ou pas dans ce compte (un vocal, un échange à partager). */
  introuvable: 404,
  /** Le lien de retrait de la liste d’attente ne vaut plus rien. */
  lien: 404,
  /** La conv n’en est pas là : le rapport, la mémoire ou le vocal ne sont pas encore faits. */
  pas_pret: 409,
  /** La fiche a changé trois fois pendant qu’on l’enregistrait. */
  occupe: 409,
  /** Une alerte de danger (le mode sobre) : le verdict ne se partage pas. */
  sobre: 409,
  /** Réservé à BLUSH+. */
  acces: 402,
  /** Le paiement n’existe pas encore (la bêta) : seuls les comptes de BLUSH_ACCES_LIBRE débloquent. */
  bientot: 402,

  /* Ce qu’elle envoie */
  email: 422,
  texte: 422,
  faits: 422,
  offre: 422,
  cible: 422,
  invalide: 422,
  /** « Qui es-tu ? » n’est pas rempli : la lecture ne peut pas partir. */
  qui: 422,
  /** Un fichier qui n’est pas un export lisible (ou des captures hors des bornes). */
  fichier: 422,
  /** Une conv de groupe. */
  groupe: 422,
  /** Une conv trop courte pour un verdict. */
  courte: 422,
  /** Des captures où rien ne se lit. */
  capture: 422,
  /** Un export d’une autre conv que la leur (un ajout). */
  autre_conv: 422,
  /** Un ajout sans rien de nouveau. */
  rien_de_neuf: 422,
  /** Un vocal vide, ou trop long. */
  vocal: 422,
  vocal_vide: 422,
  /** La transcription des vocaux n’est pas configurée. */
  vocal_bientot: 503,

  /* Le modèle, au chat et à la fiche : seulement codePublic */
  refus: 502,
  transcription: 502,
  panne: 502,
} as const;

export type CodeErreur = keyof typeof ERREURS_API;

/**
 * Les codes qu’une ErreurApi reçoit dans le navigateur, sans réponse du serveur : « erreur », une réponse sans code (un
 * serveur qui tombe, une page d’erreur) ; « annule », on a fermé « Quelle conv ? » sans choisir ; « video » et « longue »,
 * un enregistrement illisible ou trop long (src/services/preparer-video.ts) ; « image », l’image à partager n’est pas venue.
 */
type CodeLocal = "erreur" | "annule" | "video" | "longue" | "image";

/** Le code d’une ErreurApi. */
export type CodeApi = CodeErreur | CodeLocal;

/** Une erreur du back-end (ou du navigateur, voir CodeLocal) : son code, jamais de détail interne. */
export class ErreurApi extends Error {
  constructor(
    readonly code: CodeApi,
    readonly status: number,
  ) {
    super(code);
  }
}

/** Ce qu’une étape du modèle peut dire au navigateur (le chat, la fiche). */
export type CodePublic = Extract<CodeErreur, "refus" | "transcription" | "panne">;

/**
 * Le code public d’une erreur d’étape (ErreurTache, src/server/erreurs.ts). Son code interne (« refus:cyber »,
 * « sortie_illisible ») reste dans les alertes et les tâches : le navigateur n’apprend que le refus du modèle, un vocal
 * qui ne s’écoute pas, ou une panne.
 */
export function codePublic(interne: string): CodePublic {
  if (interne === "refus" || interne.startsWith("refus:")) return "refus";
  return interne === "transcription" ? "transcription" : "panne";
}
