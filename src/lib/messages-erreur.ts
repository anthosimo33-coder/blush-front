/*
 * Ce que les écrans disent d’une erreur, d’après son code (src/types/erreurs-api.ts) : une seule table, action par
 * action. Un code absent d’une action prend son texte par défaut (le réseau, un bug). Les textes des écrans d’erreur de
 * l’import, avec leur action, sont dans src/lib/copie-erreur.ts.
 */
import { URGENCES } from "@/contenu/aide";
import type { FicheUpdate } from "@/types";
import { ErreurApi, type CodeApi, type CodeErreur } from "@/types/erreurs-api";

/** Une phrase, ou quelques bulles dans le chat (une idée par bulle). */
type Texte = string | readonly string[];

/* Le budget de l’IA du jour est atteint (« souffle ») : le texte décidé, le seul (la lecture, le rapport, l’ajout à sa fiche, l’import de captures) */
const SOUFFLE_TITRE = "BLUSH souffle un peu";
/** « BLUSH souffle un peu, réessaie demain. » : le budget de l’IA du jour est atteint (src/server/budget.ts). */
export const SOUFFLE = `${SOUFFLE_TITRE}, réessaie demain.`;

/* Ce que BLUSH répond au chat comme à la question du rapport */
const CHAT_ET_QUESTION = {
  trop: "tu m’as fait parler toute la journée 😮‍💨 on reprend demain\u00a0?",
  /* « BLUSH souffle un peu, réessaie demain », dit par BLUSH lui-même */
  souffle: "je souffle un peu, réessaie demain",
  pas_pret: "je finis d’écrire ton rapport, repasse dans deux minutes",
  /*
   * Plus de bulles : une réponse verrouillée attend déjà (src/server/bulles.ts), ou la lire en demande plus que le solde.
   * Le message n’a pas atteint le modèle : s’il disait sa détresse, personne ne l’a lu. Les numéros d’urgence suivent
   * donc toujours (URGENCES, la même source que les conditions et la réponse 402).
   * TODO(produit): texte nouveau, sans maquette (le prototype des bulles n’a pas ce cas) ; la recharge viendra avec lui
   */
  bulles: ["plus de bulles pour l’instant 🫧", "recharge, et je te réponds", URGENCES],
  /* Le même message, déjà parti, s’écrit encore (« Réessayer » trop tôt). TODO(produit): texte nouveau, sans maquette */
  occupe: "je t’écris encore, deux secondes",
} as const;

/** BLUSH n’a pas pu écouter son vocal (la transcription en panne, ou un format illisible) : qu’il écrive. */
const ECOUTE_IMPOSSIBLE = "j’arrive pas à écouter ton vocal là, écris-moi";

/*
 * Il dit « avec cet email », mais la porte se ferme aussi pour ce navigateur seul (dix essais ratés), ou depuis cette
 * adresse (vingt, sauf la réserve d’un navigateur), avant celle de l’email (soixante).
 */
/** Trop d’essais de code ratés aujourd’hui (src/server/auth.ts) : ni un code tapé, ni un nouveau code n’y font plus rien. */
const ESSAIS_DU_JOUR = "Trop d’essais pour aujourd’hui avec cet email. Réessaie demain.";

/*
 * Le CAPTCHA n’a pas laissé passer (src/server/captcha.ts) : le widget n’a pas rendu de jeton (bloqué par une extension,
 * le réseau, un geste demandé et pas fait), ou Cloudflare l’a refusé. Le widget en tire un neuf : réessayer suffit
 * souvent. TODO(produit): texte nouveau, à valider.
 */
const CAPTCHA = "On n’a pas pu vérifier que tu n’es pas un robot. Réessaie dans un instant (et coche la case si elle apparaît).";

/**
 * Le mode tournage arrêté : son lien a changé, ou ce compte de créatrice n’a plus le sien (src/server/tournage.ts). Qui ne
 * filme pas (l’équipe, qui a essayé un lien) le quitte dans « Mon compte ». TODO(produit): la seconde phrase, à valider.
 */
const TOURNAGE_ARRETE =
  "Ce lien de tournage a été arrêté. Rouvre le nouveau lien de ta mission sur ce téléphone, puis recommence la prise. Tu ne filmes pas\u00a0? Quitte le mode tournage dans «\u00a0Mon compte\u00a0».";

/*
 * Un morceau ajouté à la conv qu’on importe (une conv en plusieurs morceaux, src/server/morceaux.ts), que le serveur
 * n’ajoute pas : rien de nouveau dedans, ou la conv (son brouillon) qui n’est plus là. Avec quelqu’un d’autre :
 * pasLaMemePersonne, qui la nomme. TODO(produit): textes nouveaux, absents de la maquette.
 */
const AJOUT_D_UN_MORCEAU = {
  rien_de_neuf: "BLUSH a déjà tous ces messages\u00a0: rien de nouveau dans ce morceau.",
  aucune: "Ta conv n’est plus là\u00a0: recommence depuis le début.",
  autre_conv: "Ce morceau n’est pas avec la même personne.",
} as const;

/** Un morceau ajouté avec quelqu’un d’autre (« autre_conv ») : la personne de la conv, par son prénom quand on sait qui c’est. */
export const pasLaMemePersonne = (prenom: string | null) => (prenom ? `Ce morceau n’est pas avec ${prenom}.` : AJOUT_D_UN_MORCEAU.autre_conv);

const MESSAGES = {
  /* L’envoi du code de connexion : /email, /connexion, et « Renvoyer » sur l’écran du code */
  code: {
    trop: "Trop de codes demandés. Réessaie dans une heure.",
    codes: "Trop de codes demandés aujourd’hui. Réessaie demain.",
    essais: ESSAIS_DU_JOUR,
    captcha: CAPTCHA,
    /* Le domaine ne reçoit aucun mail (src/server/domaine-email.ts). TODO(produit): texte nouveau, à valider (maquette du 26 octobre) */
    domaine: "Cette adresse ne peut recevoir aucun mail. Vérifie ce qu’il y a après le @.",
    defaut: "Le code n’est pas parti. Réessaie dans un instant.",
  },
  /* La vérification du code reçu (un mauvais code a son propre message, sur l’écran) */
  verification: {
    trop: "Trop d’essais d’un coup. Attends quelques minutes, puis réessaie.",
    essais: ESSAIS_DU_JOUR,
    beta: "Cet email n’est pas encore dans la bêta.",
    defaut: "Ça n’a pas pu partir. Vérifie ta connexion et réessaie.",
  },
  /* Un export qui n’a pas pu partir (le fichier lui-même a son écran : erreurDeParcours) */
  export: {
    /* Le mode tournage, sans fichier : son lien arrêté depuis l’ouverture de l’écran (src/server/tournage.ts) */
    tournage: TOURNAGE_ARRETE,
    trop: "Beaucoup d’imports d’un coup. Réessaie dans une heure.",
    /* Le budget d’octets du jour, de son adresse ou de tous (S-02) : il repart à minuit, ou 24 h après le premier import de l’adresse. TODO(produit): texte nouveau */
    trop_jour: "Beaucoup de convs importées aujourd’hui. Réessaie demain.",
    captcha: CAPTCHA,
    ...AJOUT_D_UN_MORCEAU,
    defaut: "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.",
  },
  /* L’import de captures ou d’un enregistrement d’écran (la conv elle-même a son écran : erreurDeParcours) */
  captures: {
    tournage: TOURNAGE_ARRETE,
    trop: "BLUSH a lu beaucoup de captures d’un coup\u00a0: réessaie un peu plus tard. Tes captures restent là.",
    /* La lecture des captures est payée par le compte connecté, ou par la part sans compte (src/server/budget.ts) */
    souffle: `${SOUFFLE} Tes captures restent là.`,
    /* Un refus de l’IA : réessayer n’y changerait rien */
    refus: "BLUSH ne peut pas lire ces captures. Essaie avec d’autres.",
    captcha: `${CAPTCHA} Tes captures restent là.`,
    ...AJOUT_D_UN_MORCEAU,
    defaut: "Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.",
  },
  /* « Lancer la lecture », sur « Qui es-tu ? » */
  lecture: {
    trop: "Tu as lancé beaucoup de lectures aujourd’hui. Réessaie demain.",
    /* Le mode tournage arrêté (src/server/tournage.ts). TODO(produit): texte nouveau, à valider */
    tournage: TOURNAGE_ARRETE,
    /* Une conv gardée trop courte, qui attend un morceau (l’écran de la conv reçue le dit d’abord). TODO(produit): texte nouveau */
    courte: "Votre conv est encore trop courte pour une lecture juste. Ajoute un morceau de votre histoire.",
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
    /* Un format que le serveur ne sait pas lire : renvoyer le même vocal n’y changerait rien, le texte de la transcription en panne */
    vocal_illisible: ECOUTE_IMPOSSIBLE,
    vocal: "ton vocal est trop long, même pour moi 😭 fais-moi la version courte",
    transcription: ECOUTE_IMPOSSIBLE,
    /* Un refus de l’IA (malgré le repli sur un autre modèle) : on le dit, sans parler de bug */
    refus: ["là-dessus je peux pas t’aider", "reformule, ou envoie-moi autre chose"],
    defaut: "j’ai eu un bug, renvoie-moi ça",
  },
  /* La question du rapport, qui passe par le chat : BLUSH le dit en une phrase, l’écran garde la question */
  question: {
    ...CHAT_ET_QUESTION,
    /* TODO(produit): texte nouveau, sans maquette (voir CHAT_ET_QUESTION) */
    bulles: `plus de bulles pour l’instant, recharge et je te réponds. ${URGENCES}`,
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
 * dans src/lib/copie-erreur.ts. « lecture » n’est pas un code de l’API : plus aucun écran ne la pose (l’échec de la lecture se dit
 * sur /lecture), on n’y arrive qu’en tapant l’adresse.
 */
export const ERREURS_PARCOURS = ["fichier", "groupe", "courte", "lecture", "capture", "video"] as const satisfies readonly (CodeApi | "lecture")[];
export type ErreurParcours = (typeof ERREURS_PARCOURS)[number];

/*
 * Ce qui vient du fichier ou de la conv elle-même, et qui a son écran d’erreur, d’après l’écran de l’import. Le reste
 * (le réseau, une limite) se dit sur l’écran, et on réessaie.
 */
const PARCOURS = {
  export: ["fichier", "groupe", "courte"],
  captures: ["courte", "groupe", "video"],
} as const satisfies Record<string, readonly ErreurParcours[]>;

/** L’écran d’erreur prévu pour cette erreur d’un import, ou null (elle se dit sur l’écran). */
export function erreurDeParcours<D extends keyof typeof PARCOURS>(depuis: D, e: unknown): (typeof PARCOURS)[D][number] | null {
  const codes: readonly (typeof PARCOURS)[D][number][] = PARCOURS[depuis];
  const code = codeDe(e);
  return codes.find((c) => c === code) ?? null;
}

/* ———— Un ajout à sa fiche ———— */

/* Les erreurs d’un ajout que l’écran de la fiche sait dire ; les autres sont un bug */
const PROBLEMES_AJOUT = ["capture", "fichier", "autre_conv", "trop", "souffle", "refus"] as const satisfies readonly CodeErreur[];

/**
 * Pourquoi un ajout à sa fiche n’a rien rangé : une erreur de PROBLEMES_AJOUT, ou un bug. La liste en est la source ;
 * FicheUpdate["problem"] (src/types) l’écrit aussi, et les deux se vérifient l’un l’autre : messageAjoutFiche lit
 * AJOUT_FICHE avec le sien, et ce que rend problemeAjout va dans une FicheUpdate (src/services/api.ts).
 */
type ProblemeAjout = (typeof PROBLEMES_AJOUT)[number] | "bug";

/*
 * Un ajout (des captures, un export) qui n’a rien rangé : un titre et une phrase. `quoi` : ce qu’il a envoyé (« ta
 * capture », « tes 3 captures », « votre conv ») ; `prenom` : le sien. « rien_de_neuf » n’est pas une erreur.
 */
const AJOUT_FICHE = {
  capture: (quoi) => ({
    title: `BLUSH n’arrive pas à lire ${quoi}`,
    detail: quoi === "ta capture" ? "Renvoie-la en entier, sans la rogner." : "Renvoie-les en entier, sans les rogner.",
  }),
  fichier: () => ({ title: "BLUSH n’arrive pas à ouvrir ce fichier", detail: "Envoie l’export de votre conv\u00a0: le .zip WhatsApp, ou le message_1.html d’Instagram." }),
  autre_conv: (_, prenom) => ({ title: "Ce n’est pas votre conv", detail: `Envoie l’export de ta conv avec ${prenom}.` }),
  trop: () => ({ title: "Beaucoup d’ajouts aujourd’hui", detail: "Réessaie demain." }),
  souffle: () => ({ title: SOUFFLE_TITRE, detail: "Réessaie demain." }),
  /* Un refus de l’IA (malgré le repli sur un autre modèle) : on le dit, sans parler de bug ; réessayer n’y changerait rien */
  refus: (quoi) => ({ title: `BLUSH ne peut pas lire ${quoi}`, detail: "Essaie avec d’autres captures." }),
  bug: () => ({ title: "Ça n’a pas marché", detail: "Un bug de notre côté. Réessaie dans un instant." }),
} satisfies Record<ProblemeAjout, (quoi: string, prenom: string) => { title: string; detail: string }>;

/** Ce que dit l’écran de la fiche d’un ajout qui n’a rien rangé. */
export const messageAjoutFiche = (probleme: NonNullable<FicheUpdate["problem"]>, quoi: string, prenom: string) => AJOUT_FICHE[probleme](quoi, prenom);

/** Pourquoi un ajout à sa fiche n’a rien rangé : ce que l’écran sait dire, un bug pour le reste, rien si rien n’était neuf. */
export function problemeAjout(e: unknown): ProblemeAjout | undefined {
  const code = codeDe(e);
  if (code === "rien_de_neuf") return undefined;
  return PROBLEMES_AJOUT.find((p) => p === code) ?? "bug";
}
