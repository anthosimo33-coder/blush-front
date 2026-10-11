/*
 * Les limites que le navigateur et le serveur partagent, écrites une fois : ce module est pur (ni server-only, ni
 * client-only) et s’importe des deux côtés. Seules y vont les bornes qui mesurent la même chose des deux côtés ; celles
 * du serveur seul (la taille d’une image reçue, d’un vocal, d’un message du chat) restent près de leur code. Les seuils
 * de messages d’une conv sont ceux de sa lecture (MIN_MESSAGES, prompts/lib/conv.ts).
 */

const MO = 1024 * 1024;

/** Au plus 20 captures dans un envoi : l’écran garde les 20 premières, le serveur refuse au-delà (src/server/captures.ts). */
export const CAPTURES_MAX = 20;

/** Le grand côté d’une image lue par le modèle, en pixels (il ne lit pas plus fin) : captures et images d’une vidéo y sont réduites. */
export const COTE_IMAGE_MAX = 1568;

/**
 * Le texte d’une conv (un .txt, ou un fichier de la conv dans un .zip) : au-delà, ce n’est pas une conv. Le serveur
 * refuse un fichier reçu tel quel plus gros, et ne décompresse pas un paquet au-delà (src/server/import.ts). Le
 * navigateur mesure les deux avant de rien envoyer (src/services/preparer-export.ts) : il refuse un fichier plus gros,
 * et coupe un paquet dont le JSON (les fichiers de la conv réunis, leurs échappements) dépasserait.
 */
export const TEXTE_CONV_MAX = 40 * MO;

/** Le corps d’une requête, au plus, chez Vercel : au-delà, il répond 413 sans appeler la fonction. */
export const CORPS_VERCEL_MAX = 4.5 * MO;
/** Le paquet d’un export (un seul fichier compressé) : la limite de Vercel, moins 0,3 Mo pour le formulaire qui l’emballe. */
export const ENVOI_EXPORT_MAX = CORPS_VERCEL_MAX - 0.3 * MO;
/** Des images (jusqu’à 20 captures, ou un lot d’images d’une vidéo) : 0,5 Mo de marge, chaque fichier ajoutant ses en-têtes au formulaire. */
export const ENVOI_IMAGES_MAX = CORPS_VERCEL_MAX - 0.5 * MO;

/** Ton prénom, sur des captures (où tu n’es que « Moi ») : le champ de « Qui es-tu ? », et la route qui lance la lecture. */
export const PRENOM_MAX = 40;
/** « Ta question » sur le rapport (le champ). Elle part par le chat, dont la limite est plus large. */
export const QUESTION_MAX = 200;

/** Combien de minutes un code de connexion marche : en base (src/server/auth.ts), sur l’écran du code et dans son mail. */
export const CODE_MINUTES = 10;
/**
 * Une minute au moins entre deux mails de code pour un même email dans un même navigateur : le serveur n’en écrit pas
 * d’autre tant que le dernier, encore bon, a moins d’une minute (src/server/auth.ts), et « Renvoyer le code » attend autant.
 */
export const CODE_RENVOI_S = 60;

/** L’extension d’un vocal, d’après le type que le navigateur a enregistré (webm sur Chrome, mp4 sur Safari, d’où « m4a » par défaut). */
export const extensionAudio = (type: string) => (type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "m4a");
