/*
 * Ce que les écrans disent d’une erreur, d’après son code (src/types/erreurs-api.ts) : une seule table, action par
 * action. Un code absent d’une action prend son texte par défaut (le réseau, un bug). Les textes des écrans d’erreur de
 * l’import, avec leur action, restent dans ErrorScreen.
 */
import type { FicheUpdate } from "@/types";
import { ErreurApi, type CodeApi } from "@/types/erreurs-api";

/** Une phrase, ou quelques bulles dans le chat (une idée par bulle). */
type Texte = string | readonly string[];

/* Ce que BLUSH répond au chat comme à la question du rapport */
const CHAT_ET_QUESTION = {
  trop: "tu m’as fait parler toute la journée 😮‍💨 on reprend demain\u00a0?",
  pas_pret: "je finis d’écrire ton rapport, repasse dans deux minutes",
  acces: "le chat avec moi, c’est dans BLUSH+",
} as const;

const MESSAGES = {
  /* L’envoi du code de connexion : /email, /connexion, et « Renvoyer » sur l’écran du code */
  code: {
    trop: "Trop de codes demandés. Réessaie dans une heure.",
    defaut: "Le code n’est pas parti. Réessaie dans un instant.",
  },
  /* La vérification du code reçu (un mauvais code a son propre message, sur l’écran) */
  verification: {
    trop: "Trop d’essais d’un coup. Attends quelques minutes, puis réessaie.",
    beta: "Cet email n’est pas encore dans la bêta.",
    defaut: "Ça n’a pas pu partir. Vérifie ta connexion et réessaie.",
  },
  /* Un export qui n’a pas pu partir (le fichier lui-même a son écran : erreurDeParcours) */
  export: {
    trop: "Beaucoup d’imports d’un coup. Réessaie dans une heure.",
    defaut: "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.",
  },
  /* « Lancer la lecture », sur « Qui es-tu ? » */
  lecture: {
    trop: "Tu as lancé beaucoup de lectures aujourd’hui. Réessaie demain.",
    defaut: "La lecture n’a pas pu partir. Réessaie dans un instant.",
  },
  /* « Relancer l’écriture » du rapport */
  relance: {
    trop: "Tu as déjà relancé plusieurs fois aujourd’hui. Réessaie demain.",
    defaut: "Ça n’a pas pu repartir. Vérifie ta connexion et réessaie.",
  },
  /* Une modification de sa fiche (PUT /api/fiche) : la limite du jour, réessayer tout de suite n’y changerait rien */
  fiche: {
    trop: "Tu as beaucoup modifié sa fiche aujourd’hui\u00a0: ta dernière modification n’a pas été enregistrée. Réessaie demain.",
    defaut: "Ta modification n’a pas été enregistrée. Vérifie ta connexion et réessaie.",
  },
  /* Le chat (un message, des captures, un export, un vocal), dans la voix de BLUSH : une idée par bulle */
  chat: {
    ...CHAT_ET_QUESTION,
    capture: ["j’arrive pas à lire tes captures", "renvoie-les en entier, sans les rogner"],
    fichier: ["j’arrive pas à ouvrir ce fichier", "envoie-moi l’export de votre conv\u00a0: le .zip WhatsApp, ou le message_1.html d’Instagram"],
    autre_conv: "c’est pas votre conv ça 👀 envoie-moi l’export de la vôtre",
    rien_de_neuf: "ça, je l’ai déjà 😌 rien de nouveau depuis la dernière fois",
    vocal_bientot: ["les vocaux, ça arrive très vite", "écris-moi en attendant, je te réponds pareil"],
    vocal_vide: "j’ai rien entendu dans ton vocal, tu me le renvoies\u00a0?",
    vocal: "ton vocal est trop long, même pour moi 😭 fais-moi la version courte",
    transcription: "j’arrive pas à écouter ton vocal là, écris-moi",
    /* Un refus de l’IA (malgré le repli sur un autre modèle) : on le dit, sans parler de bug */
    refus: ["là-dessus je peux pas t’aider", "reformule, ou envoie-moi autre chose"],
    defaut: "j’ai eu un bug, renvoie-moi ça",
  },
  /* La question du rapport, qui passe par le chat : BLUSH le dit en une phrase, l’écran garde la question */
  question: {
    ...CHAT_ET_QUESTION,
    refus: "là-dessus je peux pas t’aider, reformule ta question",
    defaut: "j’ai eu un bug, renvoie-moi ta question",
  },
} as const satisfies Record<string, { defaut: Texte } & Partial<Record<CodeApi, Texte>>>;

type Action = keyof typeof MESSAGES;
/** Les textes d’une action : une phrase partout, des bulles dans le chat. */
type TexteDe<A extends Action> = (typeof MESSAGES)[A][keyof (typeof MESSAGES)[A]];

/** Le code d’une erreur de l’API (ou du navigateur, voir CodeLocal) ; null pour le reste (le réseau, un bug). */
export const codeDe = (e: unknown): CodeApi | null => (e instanceof ErreurApi ? e.code : null);

/** Ce que l’écran de cette action dit de l’erreur `e`. */
export function messageErreur<A extends Action>(action: A, e: unknown): TexteDe<A> {
  const textes: { defaut: Texte } & Partial<Record<CodeApi, Texte>> = MESSAGES[action];
  const code = codeDe(e);
  return ((code && textes[code]) ?? textes.defaut) as TexteDe<A>;
}

/* ———— Les écrans d’erreur de l’import ———— */

/**
 * Les erreurs du parcours d’import, posées dans l’adresse (`?erreur=<code>`) : voir ErreurDeParcours, et leurs textes
 * dans ErrorScreen. « lecture » n’est pas un code de l’API : plus aucun écran ne la pose (l’échec de la lecture se dit
 * sur /lecture), on n’y arrive qu’en tapant l’adresse.
 */
export const ERREURS_PARCOURS = ["fichier", "groupe", "courte", "lecture", "capture", "video", "longue"] as const satisfies readonly (CodeApi | "lecture")[];
export type ErreurParcours = (typeof ERREURS_PARCOURS)[number];

/*
 * Ce qui vient du fichier ou de la conv elle-même, et qui a son écran d’erreur, d’après l’écran de l’import. Le reste
 * (le réseau, une limite) se dit sur l’écran, et on réessaie.
 */
const PARCOURS = {
  export: ["fichier", "groupe", "courte"],
  captures: ["courte", "groupe", "video", "longue"],
} as const satisfies Record<string, readonly ErreurParcours[]>;

/** L’écran d’erreur prévu pour cette erreur d’un import, ou null (elle se dit sur l’écran). */
export function erreurDeParcours<D extends keyof typeof PARCOURS>(depuis: D, e: unknown): (typeof PARCOURS)[D][number] | null {
  const codes: readonly (typeof PARCOURS)[D][number][] = PARCOURS[depuis];
  const code = codeDe(e);
  return codes.find((c) => c === code) ?? null;
}

/* ———— Un ajout à sa fiche ———— */

/*
 * Un ajout (des captures, un export) qui n’a rien rangé : un titre et une phrase. `quoi` : ce qu’il a envoyé (« ta
 * capture », « tes 3 captures », « votre conv ») ; `prenom` : le sien. « rien_de_neuf » n’est pas une erreur.
 */
const AJOUT_FICHE = {
  capture: (quoi) => ({ title: `BLUSH n’arrive pas à lire ${quoi}`, detail: quoi === "ta capture" ? "Renvoie-la en entier, sans la rogner." : "Renvoie-les en entier, sans les rogner." }),
  fichier: () => ({ title: "BLUSH n’arrive pas à ouvrir ce fichier", detail: "Envoie l’export de votre conv\u00a0: le .zip WhatsApp, ou le message_1.html d’Instagram." }),
  autre_conv: (_, prenom) => ({ title: "Ce n’est pas votre conv", detail: `Envoie l’export de ta conv avec ${prenom}.` }),
  trop: () => ({ title: "Beaucoup d’ajouts aujourd’hui", detail: "Réessaie demain." }),
  bug: () => ({ title: "Ça n’a pas marché", detail: "Un bug de notre côté. Réessaie dans un instant." }),
} satisfies Record<NonNullable<FicheUpdate["problem"]>, (quoi: string, prenom: string) => { title: string; detail: string }>;

/** Ce que dit l’écran de la fiche d’un ajout qui n’a rien rangé. */
export const messageAjoutFiche = (probleme: NonNullable<FicheUpdate["problem"]>, quoi: string, prenom: string) => AJOUT_FICHE[probleme](quoi, prenom);

/* Les erreurs d’un ajout que l’écran de la fiche sait dire ; les autres sont un bug */
const PROBLEMES_AJOUT = ["capture", "fichier", "autre_conv", "trop"] as const satisfies readonly NonNullable<FicheUpdate["problem"]>[];

/** Pourquoi un ajout à sa fiche n’a rien rangé : ce que l’écran sait dire, un bug pour le reste, rien si rien n’était neuf. */
export function problemeAjout(e: unknown): FicheUpdate["problem"] {
  const code = codeDe(e);
  if (code === "rien_de_neuf") return undefined;
  return PROBLEMES_AJOUT.find((p) => p === code) ?? "bug";
}
