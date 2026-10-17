import { CATALOGUE, prixDe } from "./offres";
import { lePack, PACK_CONSEILLE } from "./recharge";

/*
 * Les textes des mails des séquences (src/server/sequences.ts), la V3 du canvas « BLUSH · Séquences mail » (17 octobre) :
 * BLUSH parle en bulles roses, dans la voix de Dozo, à une personne. Son prénom, celui de l’autre et ce que BLUSH a
 * compris (son verdict, son prochain pas) peuvent être dans le corps ; jamais un de leurs messages, et rien de la conv
 * dans le sujet, l’aperçu ni le texte brut (ce que montre un écran verrouillé). Chaque texte s’accorde : `moi.elle` (elle
 * a choisi « elle » sur « Qui es-tu ? »), `autre.il`. Sans prénom, « lui » ou « elle ».
 * Le lot 1 : S3 (après l’achat : le rapport prêt, « il t’a répondu ? », le vocal, le prochain pas) et S4 (les bulles).
 */

/** Qui parle à qui : son prénom à elle (ou à lui), son pronom, et l’autre. */
export type Personnes = { moi: { prenom: string | null; elle: boolean }; autre: { prenom: string | null; il: boolean } };

/** Un mot accordé à son pronom à elle (ou à lui) : « oubliée » ou « oublié ». */
const accord = (p: Personnes, f: string, m: string) => (p.moi.elle ? f : m);

/** Ce que disent les pronoms de l’autre, et son prénom (« lui » ou « elle » quand on ne l’a pas). */
function lAutre(p: Personnes) {
  const il = p.autre.il;
  return { il: il ? "il" : "elle", Il: il ? "Il" : "Elle", le: il ? "le" : "la", nom: p.autre.prenom ?? (il ? "lui" : "elle") };
}

/** « 2 bulles », « 1 bulle ». */
const nBulles = (n: number, mot = "bulle") => `${n}\u00a0${mot}${n > 1 ? "s" : ""}`;

/** Un mail des séquences : son sujet, son aperçu, son texte brut (sans prénom), et ce que dessine son gabarit (src/server/mail-sequence.ts). */
export type MailDeSequence = {
  sujet: string;
  apercu: string;
  texte: string;
  bulles: string[];
  /** Un exemple d’échange : ce que l’autre dit, la réponse à éviter, le conseil, la bonne. */
  exemple?: { recu: string; non: string; conseil: string; oui: string };
  /** Le prochain pas du verdict, sur fond noir. */
  pas?: string;
  /** La réponse prête, dessinée floue : son étiquette. */
  floue?: string;
  titre: string;
  corps: string;
  /** Un encart gris sous le texte : sa ligne en gras, puis sa ligne. */
  encart?: { gras: string; ligne: string };
  /** Un bouton, ou deux à une touche : leur libellé, et ce qu’ils écrivent d’avance dans le chat (`dire`). */
  boutons: { libelle: string; dire?: string }[];
  mini?: string;
  ps?: string;
  /** La ligne du pied, au-dessus de la désinscription. */
  pied: string;
};

const PIED = "Ce mail ne cite aucun de vos messages.";

/* ———— S3 · Après l’achat ———— */

/**
 * S3 J0, « ton rapport est prêt » (src/server/mail-rapport.ts) : ses bulles, et les réponses de BLUSH qu’elle a d’avance,
 * selon ce qu’elle a pris : le rapport (10), ou Premium (90, dont 30 offertes) et sa promesse.
 */
export function mailRapportPret(p: Personnes, { chapitres, premium }: { chapitres: number; premium: boolean }) {
  const { nom, Il } = lAutre(p);
  return {
    sujet: "📖 ton rapport est prêt. j’ai pas été tendre",
    bulles: [p.moi.prenom ? `${p.moi.prenom}, j’ai fini 📖` : "j’ai fini ton rapport 📖", `${chapitres} chapitres sur toi et ${nom}`, "le 4 va piquer un peu 😏"],
    titre: `Tout ce que tu te demandais sur ${nom}.`,
    encart: premium
      ? {
          gras: `Et ${CATALOGUE.premium.bulles} réponses de BLUSH d’avance, dont ${CATALOGUE.pack30.bulles} offertes`,
          ligne: `${Il} t’écrit\u00a0? Tu colles son message, je t’aide à répondre, message après message. 1 réponse = 1 bulle.`,
        }
      : { gras: `Et ${CATALOGUE.rapport.bulles} réponses de BLUSH d’avance`, ligne: `${Il} t’écrit\u00a0? Tu colles son message, je te dis quoi répondre. 1 réponse = 1 bulle.` },
    ps: "ps\u00a0: lis le chapitre 8 en dernier. c’est ton plan",
  };
}

/** S3 J+1, « il t’a répondu ? » : rien dit au chat depuis l’achat. L’exemple suit son pronom à elle (ou à lui). */
export function mailRepondre(p: Personnes, { bulles }: { bulles: number }): MailDeSequence {
  const { il } = lAutre(p);
  /* Une fille tend une perche pour qu’il propose ; un garçon propose, avec un jour et une heure */
  const exemple = p.moi.elle
    ? {
        recu: "tu fais quoi ce week-end\u00a0?",
        non: "rien de spécial et toi\u00a0?? 😊",
        conseil: "ça, non. attends 20 min, puis\u00a0:",
        oui: "ça dépend, tu proposes quoi\u00a0?",
      }
    : {
        recu: "tu fais quoi ce week-end\u00a0?",
        non: "rien de spécial et toi\u00a0?? 😊",
        conseil: "ça, non. propose, avec un jour\u00a0:",
        oui: "samedi 20 h, un verre\u00a0? je connais un spot",
      };
  return {
    sujet: "alors\u00a0?",
    apercu: "colle-moi son dernier message. je te dis quoi répondre.",
    texte: "Colle-moi son dernier message\u00a0: je te dis quoi répondre, et surtout quoi pas répondre.",
    bulles: ["alors", `${p.autre.prenom ?? il} t’a répondu\u00a0?`, "colle-moi son message. je te dis quoi répondre, et surtout quoi PAS répondre"],
    exemple,
    titre: "Plus jamais un message envoyé en tremblant.",
    corps: `Chaque réponse, je l’écris avec tout ce que je sais de vous deux.${bulles > 0 ? ` T’as ${nBulles(bulles, "réponse")} d’avance.` : ""}`,
    boutons: [{ libelle: "Lui répondre avec BLUSH", dire: "son dernier message\u00a0: " }],
    mini: "1 réponse = 1 bulle · elles n’expirent jamais",
    ps: "ps\u00a0: la 1re réponse après un rapport, c’est celle qui compte le plus. garde pas tes bulles pour plus tard",
    pied: PIED,
  };
}

/** S3 J+2, le vocal pas encore écouté : sa durée. */
export function mailVocal(p: Personnes, { secondes }: { secondes: number }): MailDeSequence {
  const { nom } = lAutre(p);
  return {
    sujet: "t’as pas écouté ce que j’ai dit sur toi",
    apercu: `${secondes} secondes. sans filtre. mets des écouteurs.`,
    texte: `Ton vocal t’attend\u00a0: ${secondes} secondes, sans filtre. Mets des écouteurs.`,
    bulles: ["t’as zappé mon vocal", `${secondes} secondes sur toi et ${nom}`, "j’ai pas mâché mes mots 🎙️"],
    titre: "Ta situation, dite à voix haute.",
    corps: `Comme si ${accord(p, "ta meilleure pote", "ton meilleur pote")} avait lu toute ta conv et te disait la vérité en face. Mets des écouteurs. Sérieux.`,
    boutons: [{ libelle: "Écouter" }],
    ps: "ps\u00a0: ça dure moins longtemps que relire son dernier message",
    pied: PIED,
  };
}

/** S3 J+4, le prochain pas (🔥 🤏 🤔) tel que le verdict l’a écrit, et deux réponses à une touche. */
export function mailProchainPas(p: Personnes, { emoji, pas, bulles }: { emoji: "🔥" | "🤏" | "🤔"; pas: string | null; bulles: number }): MailDeSequence {
  const accroche = emoji === "🔥" ? "alors, ce plan\u00a0?" : emoji === "🤏" ? "alors, t’as osé\u00a0?" : "alors, ça penche de quel côté\u00a0?";
  return {
    sujet: accroche,
    apercu: "t’as fait ce qu’on avait dit\u00a0?",
    texte: "Ton prochain pas, t’en es où\u00a0? Si c’est fait, raconte. Si t’as pas osé, on trouve les mots ensemble.",
    bulles: [p.moi.prenom ? `${p.moi.prenom}, ${accroche}` : accroche, `t’as fait ce qu’on avait dit avec ${lAutre(p).nom}\u00a0?`],
    ...(pas && { pas }),
    titre: "Ça s’est passé comment\u00a0?",
    corps: "Si c’est fait, raconte\u00a0: je te dis la suite. Si t’as pas osé, on trouve les mots ensemble. Maintenant.",
    boutons: [
      { libelle: "C’est fait", dire: "c’est fait\u00a0! " },
      { libelle: "J’ai pas osé", dire: "j’ai pas osé…" },
    ],
    ...(bulles > 0 && { mini: `Il te reste ${nBulles(bulles)}.` }),
    ps: "ps\u00a0: si t’as pas osé, c’est pas grave. ce qui serait dommage, c’est d’attendre encore deux semaines",
    pied: PIED,
  };
}

/** S3 J+4 après un 🧊 : rien à vendre, jamais l’aider à le faire revenir, et le 3114. */
export function mailGlace(p: Personnes): MailDeSequence {
  const { le } = lAutre(p);
  return {
    sujet: "comment tu vas, vraiment\u00a0?",
    apercu: "pas la version polie. la vraie.",
    texte: "Comment tu vas, vraiment\u00a0? Si t’as besoin de vider ton sac, BLUSH est là. Si ça pèse vraiment trop, le 3114 répond jour et nuit.",
    bulles: [p.moi.prenom ? `${p.moi.prenom}, comment tu vas\u00a0?` : "comment tu vas\u00a0?", "pas la version polie. la vraie"],
    titre: "T’as le droit d’être à l’envers.",
    corps: `Ce que t’as lu dans ton rapport, ça fait cogiter. Si t’as besoin de vider ton sac, je suis là. Pas pour ${le} faire revenir\u00a0: pour que toi, t’ailles mieux.`,
    boutons: [{ libelle: "Parler à BLUSH" }],
    mini: "Si ça pèse vraiment trop, parles-en à quelqu’un de confiance, ou appelle le 3114, jour et nuit.",
    ps: "ps\u00a0: t’as le droit de pas répondre. je bouge pas",
    pied: PIED,
  };
}

/* ———— S4 · Les bulles ———— */

/** Le pack conseillé, avec le bonus de la 1re recharge (④) quand il vaut : « 70 bulles + 50 offertes · 13,90 € · 120 réponses ». */
function packConseille(bonus: boolean) {
  const { titre, offertes, total, prix } = lePack(PACK_CONSEILLE, bonus);
  const parReponse = `${(CATALOGUE[PACK_CONSEILLE].centimes / 100 / total).toFixed(2).replace(".", ",")}\u00a0€`;
  return { prix, total, ligne: `${titre} + ${offertes} offertes · ${prix} · ${total} réponses, ${parReponse} la réponse` };
}

/** Le bonus de la 1re recharge, en bulles : ce que ④ ajoute au pack conseillé. */
const BONUS = lePack(PACK_CONSEILLE, true).offertes - lePack(PACK_CONSEILLE, false).offertes;

/** S4, 2 bulles ou moins : le pack conseillé. `actif` : elle a écrit au chat ces deux derniers jours. */
export function mailPeuDeBulles(p: Personnes, { bulles, bonus, actif }: { bulles: number; bonus: boolean; actif: boolean }): MailDeSequence {
  const { il, nom } = lAutre(p);
  return {
    sujet: `il te reste ${nBulles(bulles, "réponse")}`,
    apercu: "et la conv, elle, est pas finie.",
    texte: `Il te reste ${nBulles(bulles)}. Recharge maintenant, et t’es tranquille pour des semaines.`,
    bulles: [`plus que ${nBulles(bulles)}`, actif ? `et vu comme ça repart avec ${nom}, ça va pas suffire 👀` : `et ${nom} a pas fini de t’écrire 👀`],
    titre: "Tomber à sec au mauvais moment, c’est non.",
    corps: `Le pire moment pour plus avoir de bulles, c’est quand ${il} t’écrit un truc important à minuit. Recharge maintenant, t’es tranquille pour des semaines.`,
    encart: { gras: bonus ? `Ta 1re recharge\u00a0: +${BONUS} offertes` : "Le pack conseillé", ligne: packConseille(bonus).ligne },
    boutons: [{ libelle: `Recharger avant qu’${il} écrive` }],
    mini: "Paiement unique, pas d’abonnement · Apple Pay ou carte",
    ps: bonus ? "ps\u00a0: tes bulles expirent jamais. le bonus, lui, c’est que sur ta 1re recharge" : "ps\u00a0: tes bulles expirent jamais",
    pied: PIED,
  };
}

/** S4, la réponse écrite à 0 bulle qui attend sa recharge : dessinée floue, et le plus petit pack. */
export function mailReponsePrete(p: Personnes, { bonus }: { bonus: boolean }): MailDeSequence {
  const { il, Il, nom } = lAutre(p);
  const conseille = packConseille(bonus);
  return {
    sujet: "ta réponse est prête",
    apercu: "elle attend que toi.",
    texte: "Ta réponse est prête. Il te manque juste des bulles\u00a0: recharge, elle s’affiche tout de suite.",
    bulles: ["j’ai ta réponse", "elle est bonne. genre vraiment bonne 😏", "il te manque juste des bulles"],
    floue: `Pour ${nom} · prête`,
    titre: `${Il} attend ta réponse. Ta réponse attend ${prixDe("pack30")}.`,
    corps: `Je l’ai écrite pour ce qu’${il} vient de te dire, avec tout ce que je sais de vous deux. Tu recharges, elle s’affiche, tu copies, t’envoies.`,
    encart: {
      gras: `${CATALOGUE.pack30.bulles} bulles · ${prixDe("pack30")}`,
      ligne: bonus ? `ou ${conseille.total} avec ta 1re recharge à ${conseille.prix}` : `ou ${conseille.total} à ${conseille.prix}`,
    },
    boutons: [{ libelle: "Afficher ma réponse" }],
    mini: "Paiement unique · Apple Pay ou carte",
    ps: `ps\u00a0: ${CATALOGUE.pack30.bulles} bulles, c’est ${CATALOGUE.pack30.bulles} réponses comme celle-là`,
    pied: "Ce mail ne contient pas ta réponse\u00a0: le flou est un dessin.",
  };
}

/** S4, à zéro depuis 3 jours : tout ce que BLUSH garde (des nombres seulement), et la recharge. */
export function mailZeroBulle(p: Personnes, { faits, messages, echanges }: { faits: number; messages: number; echanges: number }): MailDeSequence {
  const { il, nom } = lAutre(p);
  const garde = [
    ...(faits ? [`Sa fiche, ${faits} chose${faits > 1 ? "s" : ""} sur ${nom}`] : []),
    `vos ${messages.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")} messages`,
    "ton rapport",
    ...(echanges ? [`nos ${echanges} échange${echanges > 1 ? "s" : ""}`] : []),
  ];
  return {
    sujet: `je t’ai pas ${accord(p, "oubliée", "oublié")}`,
    apercu: "ni toi, ni votre histoire.",
    texte: "Tout ce que tu m’as raconté est là, quand tu reviens. T’as juste à recharger.",
    bulles: [`je t’ai pas ${accord(p, "oubliée", "oublié")}`, `ni ${nom}, ni tout ce que tu m’as raconté`, "tout est là, quand tu reviens"],
    titre: `Le jour où ${il} te réécrit, t’as rien à me réexpliquer.`,
    corps: "Je reprends exactement là où on en était. T’as juste à recharger.",
    encart: { gras: "Tout est gardé", ligne: `${garde.join(" · ").replace(/^./, (c) => c.toUpperCase())}.` },
    boutons: [{ libelle: "Recharger mes bulles" }],
    mini: "Tes bulles n’expirent jamais.",
    ps: `ps\u00a0: ${il} t’a réécrit et t’as répondu ${accord(p, "toute seule", "tout seul")}\u00a0? raconte, je veux savoir comment ça s’est passé 😏`,
    pied: PIED,
  };
}

/** La désinscription en pied, selon ce qu’est le mail : un conseil (S3) ou une offre (S4). */
export const DESINSCRIPTION = { conseils: "Plus de conseils comme ça", offres: "Plus d’offres comme ça" } as const;
