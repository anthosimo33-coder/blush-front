/*
 * Les limites que le navigateur et le serveur partagent, écrites une fois : ce module est pur (ni server-only, ni
 * client-only) et s’importe des deux côtés. Seules y vont les bornes qui mesurent la même chose des deux côtés ; celles
 * du serveur seul (la taille d’une image reçue, d’un vocal, d’un message du chat) restent près de leur code. Les seuils
 * de messages d’une conv sont ceux de sa lecture (MIN_MESSAGES, prompts/lib/conv.ts). Les filtres des sélecteurs de
 * fichiers (ce qu’un écran propose de choisir) y sont aussi : chaque écran qui importe les reprend, sans les recopier.
 */

const MO = 1024 * 1024;

/** Au plus 20 captures dans un envoi : l’écran garde les 20 premières, le serveur refuse au-delà (src/server/captures.ts). */
export const CAPTURES_MAX = 20;

/**
 * Les écrans d’un lot d’enregistrement d’écran, au plus (tailleDesLots et lotsDe, src/services/preparer-video.ts) : douze
 * pour toutes les vidéos depuis le 27 octobre (de six pour une courte à douze pour une longue avant), découpés en partant
 * de la fin : le lot le plus récent plein, le reste dans le plus ancien. /api/captures/video borne les messages d’un lot
 * en conséquence, et /api/captures/lot les images d’un envoi (CAPTURES_MAX).
 */
export const ECRANS_PAR_LOT = 12;

/**
 * Les envois d’avant dont un enregistrement reprend des lots déjà lus dans l’onglet (src/services/preparer-video.ts), au
 * plus, que sa fin donne au serveur (`repris`, POST /api/captures/video) : quelques nouveaux essais de la même vidéo.
 */
export const ENVOIS_REPRIS_MAX = 10;

/**
 * Les lots d’un enregistrement lus en même temps par le navigateur (chacun est un appel au modèle : lotParIp et
 * lotsParCompte les bornent). Une vidéo de plus de lots que ça ne se lit pas en un seul tour : c’est une longue vidéo
 * (plus de 56 écrans en lots de douze, moins quand des écrans lourds font couper un lot), que la lecture partielle peut
 * ne lire qu’en partie avant l’achat (src/server/lecture-partielle.ts).
 */
export const LECTEURS_DE_LOTS = 5;

/**
 * La lecture partielle visée par le plan du 27 octobre 2026, pour toutes les vidéos et non plus les seules longues :
 * une vidéo d’au moins ce nombre de lots peut ne se lire avant l’achat que dans sa partie la plus récente (un lot seul se
 * lit toujours en entier). Mesurée d’abord sans rien changer à la lecture (BLUSH_LECTURE_PARTIELLE à « mesure » :
 * leContrefactuel, src/server/lecture-partielle.ts) ; l’A/B la suivra.
 */
export const LOTS_MIN_PARTIELLE = 2;

/**
 * La taille commune d’un tour de cette lecture partielle visée : son premier tour (le lot le plus récent, plein depuis
 * la découpe en partant de la fin), puis chaque tour de plus, jusqu’à ce que la règle d’arrêt dise « assez » (decider).
 * Un tour d’un lot se lit en 25 à 30 s.
 */
export const LOTS_PAR_TOUR = 1;

/** Les lots d’un enregistrement, au plus, pour le serveur (/api/captures/video, /api/captures/ecrans) : un très long en fait quinze. */
export const LOTS_MAX = 40;

/**
 * Au plus 50 invitations de la liste d’attente dans un lot (/admin, POST /api/admin) : le formulaire s’arrête là, le
 * serveur refuse au-delà (src/server/attente.ts, inviterLaListe). Le plafond des mails du jour arrête souvent avant.
 */
export const INVITATIONS_PAR_LOT = 50;

/** Le nom d’une conv de tournage (/admin, POST /api/admin : sa campagne), en caractères (src/server/tournage.ts). */
export const NOM_TOURNAGE_MAX = 80;

/** Ce que propose le sélecteur de captures (l’import, le chat, la fiche) : des images, que le navigateur réduit avant l’envoi. */
export const ACCEPT_IMAGES = "image/*";
/** Une image choisie ou déposée : une capture. */
export const estImage = (f: Blob) => f.type.startsWith("image/");

/* Un export de conv : WhatsApp .zip ou .txt, Instagram .html ou .json ; par extension, et par type pour un navigateur qui ne lit que lui */
const EXTENSIONS_EXPORT = ["zip", "txt", "json", "html"];
const TYPES_EXPORT = ["application/zip", "text/plain", "application/json", "text/html"];
/** Ce que propose le sélecteur d’un export de conv (l’import, le chat, la fiche). */
export const ACCEPT_EXPORT = [...EXTENSIONS_EXPORT.map((e) => `.${e}`), ...TYPES_EXPORT].join(",");
/** Un fichier déposé qui peut être un export (son extension ou son type) : ce que la fiche garde d’un glisser-déposer. */
export const estExport = (f: File) => EXTENSIONS_EXPORT.some((e) => f.name.toLowerCase().endsWith(`.${e}`)) || TYPES_EXPORT.includes(f.type);

/**
 * Les fichiers d’une conv dans le paquet d’un export (les message_N d’Instagram, un seul .txt pour WhatsApp) : le
 * serveur refuse un paquet qui en compte plus (src/server/import.ts), le navigateur garde les plus récents
 * (src/services/preparer-export.ts), comme pour une conv trop longue.
 */
export const PARTIES_MAX = 50;

/**
 * Le paquet d’un export, tel que le navigateur l’écrit (src/services/preparer-export.ts) et que le serveur le relit
 * (src/server/import.ts) : le nom du fichier choisi, les fichiers de la conv (au plus PARTIES_MAX), et `coupe` quand
 * le navigateur n’en a gardé que la partie la plus récente.
 */
export type Paquet = { nom: string; parties: { nom: string; contenu: string }[]; coupe?: boolean };

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
export const extensionAudio = (type: string) =>
  type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "m4a";
