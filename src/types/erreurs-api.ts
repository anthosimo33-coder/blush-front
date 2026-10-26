/*
 * Les erreurs de l’API, du serveur jusqu’aux écrans : la seule liste de leurs codes, avec leur statut HTTP. Sans
 * server-only : le serveur répond `{ erreur: code }` (src/server/http.ts), le navigateur en fait une ErreurApi, et ses
 * écrans un texte (src/lib/messages-erreur.ts). Un code ne dit jamais rien d’interne.
 * Seule exception d’une route d’action : un mauvais code de connexion (/api/auth/verifier) répond 200 `{ ok: false }`,
 * la même réponse pour tous, invités ou non. Hors de ce contrat : /api/reveil, un réveil sans code, répond 503
 * `{ ok: false }` quand la base ne répond pas.
 */
export const ERREURS_API = {
  /* La requête */
  /** Elle ne vient pas de l’appli (memeOrigine). */
  origine: 403,
  /** Pas de session (ou plus de session), ou la bêta fermée qui demande un compte. */
  connexion: 401,
  /** La purge de la nuit, sans le bon secret ; un webhook de paiement mal signé (ou le paiement pas branché). */
  interdit: 401,
  /** Bêta fermée : un email retiré de la liste après l’envoi de son code. */
  beta: 403,
  /** Le CAPTCHA (src/server/captcha.ts) : sans compte, un jeton du widget absent ou refusé, ou pas de laissez-passer valable. */
  captcha: 403,
  /** Une limite atteinte (src/server/limites.ts). */
  trop: 429,
  /** Le budget d’octets des imports du jour (S-02) : celui de cette adresse, ou le plafond de tous (octetsDansLeBudget, src/server/requete.ts). */
  trop_jour: 429,
  /** Les codes de connexion du jour : trop demandés pour cet email, ou le plafond des mails atteint pour tous. */
  codes: 429,
  /** Trop d’essais de code ratés aujourd’hui, pour ce navigateur, cette adresse ou l’email (src/server/auth.ts, prendreCode) : à la vérification, et à la demande d’un nouveau code. */
  essais: 429,

  /* Ce qu’elle désigne */
  /** Pas de conv ouverte (ou plus). */
  aucune: 404,
  /** Ce qu’on demande n’existe pas, ou pas dans ce compte (un vocal, un échange à partager). */
  introuvable: 404,
  /** Le lien de retrait de la liste d’attente ne vaut plus rien. */
  lien: 404,
  /** La conv n’en est pas là : le rapport, la mémoire ou le vocal ne sont pas encore faits. */
  pas_pret: 409,
  /** La fiche a changé trois fois pendant qu’on l’enregistrait ; un message au chat (sa clé) déjà parti, qui s’écrit encore. */
  occupe: 409,
  /** Une alerte de danger (le mode sobre) : le verdict ne se partage pas. */
  sobre: 409,
  /**
   * Le mode tournage arrêté (src/server/tournage.ts) : ce navigateur garde un lien de tournage arrêté, ou le compte est
   * celui d’une créatrice. Aucune vraie lecture ne part : elle doit rouvrir le nouveau lien de l’équipe.
   */
  tournage: 409,
  /** Rien à payer : le rapport de cette conv est déjà débloqué, ou le compte est de l’équipe. */
  deja: 409,
  /** Pas encore payé : sa fiche (un client), la chute d’un chapitre (le rapport débloqué). */
  acces: 402,
  /** Le paiement n’est pas encore branché (ni Whop, ni le faux Whop) : rien ne s’achète. */
  bientot: 402,
  /** Le paiement dans la feuille refusé par la banque (la carte, le portefeuille) : rien n’a été débité, on peut réessayer. */
  carte: 402,
  /**
   * Plus assez de bulles (src/server/bulles.ts) : une réponse verrouillée attend déjà d’être payée (une seule par compte),
   * ou la lire en demande plus que le solde. Rien n’est parti au modèle.
   */
  bulles: 402,

  /* Ce qu’elle envoie */
  /** Un email qui n’en est pas un (le code de connexion, la liste d’attente). */
  email: 422,
  /** Un email dont le domaine ne reçoit aucun mail (src/server/domaine-email.ts) : le code n’est pas parti. */
  domaine: 422,
  /** Un message au chat vide, ou trop long. */
  texte: 422,
  /** Sa fiche corrigée, mal formée. */
  faits: 422,
  /** Une offre qui n’existe pas, ou qui ne s’achète pas (plus) : une offre unique passée, ③ sans rapport payé. */
  offre: 422,
  /** Un paiement sans la renonciation au délai de rétractation (sa version, que le geste de payer envoie), ou avec une version qui n’est plus la bonne : le paiement ne part pas. */
  renonciation: 422,
  /** Ce qu’on veut partager en image (une réponse du chat, un chapitre) n’est pas désigné comme il faut. */
  cible: 422,
  /** Le reste de ce qu’une route attend (le mode vocal du chat, un moment de l’écoute du vocal). */
  invalide: 422,
  /** Un import sans l’accord de l’import (sa version, que le geste du bouton envoie), ou avec une version de son texte qui n’est plus la bonne (src/server/juridique.ts). */
  consentement: 422,
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
  /** Un vocal trop lourd, ou trop long. */
  vocal: 422,
  /** Un vocal vide, qui ne dure rien, ou où la transcription n’entend rien. */
  vocal_vide: 422,
  /** Un vocal dans un format que le serveur ne sait pas lire (pas celui d’un enregistreur de navigateur connu). */
  vocal_illisible: 422,
  /** La transcription des vocaux n’est pas configurée. */
  vocal_bientot: 503,

  /* Le modèle, au chat, à la fiche et à l’import de captures : seulement codePublic */
  /** Le modèle refuse de répondre (ses règles, ou les filtres de son prestataire), malgré le repli sur un autre. */
  refus: 502,
  /** Le vocal n’a pas pu être transcrit. */
  transcription: 502,
  /** Le reste : une sortie illisible, le temps écoulé, un bug. */
  panne: 502,
  /** Le budget de l’IA du jour est atteint, pour tous ou pour ce compte (src/server/budget.ts) : ça repart après minuit. */
  souffle: 503,
} as const;

export type CodeErreur = keyof typeof ERREURS_API;

/**
 * Les codes qu’une ErreurApi reçoit dans le navigateur, sans réponse du serveur : « erreur », une réponse sans code (un
 * serveur qui tombe, une page d’erreur) ; « annule », on a fermé « Quelle conv ? » sans choisir ; « video », un
 * enregistrement illisible (src/services/preparer-video.ts) ; « image », l’image à partager n’est pas venue.
 */
type CodeLocal = "erreur" | "annule" | "video" | "image";

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
export type CodePublic = Extract<CodeErreur, "refus" | "transcription" | "souffle" | "panne">;

/**
 * Le code public d’une erreur d’étape (ErreurTache, src/server/erreurs.ts). Son code interne (« refus:cyber »,
 * « sortie_illisible ») reste dans les alertes et les tâches : le navigateur n’apprend que le refus du modèle, un vocal
 * qui ne s’écoute pas, le budget du jour atteint (« budget » : BLUSH souffle), ou une panne.
 */
export function codePublic(interne: string): CodePublic {
  if (interne === "refus" || interne.startsWith("refus:")) return "refus";
  /* « souffle » est déjà public : codePublic(codeDErreur(e)) le garde tel quel */
  if (interne === "budget" || interne === "souffle") return "souffle";
  return interne === "transcription" ? "transcription" : "panne";
}
