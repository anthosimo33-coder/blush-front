/*
 * Un message que le modèle ne lira pas : envoyé sans bulles quand une réponse verrouillée attend déjà (la réponse 402
 * « bulles », src/server/paiement-chat.ts). Seul le modèle lève une alerte (src/contenu/aide.ts) : ce message-là n’en
 * lèvera aucune. Les numéros d’urgence (URGENCES) le suivent donc quand ses mots font penser à un danger ou à une
 * détresse (src/services/api.ts) : un filet, pas une lecture. Un faux positif ne fait que les montrer, comme chaque
 * fois avant le 9 novembre 2026 (l’utilisateur : « aucun rapport » avec la recharge) ; un vocal ou des captures sans un
 * mot ne se lisent pas ici, et ne les montrent pas.
 * Les mots s’écrivent sans accents ni majuscules, l’apostrophe droite : le texte est ramené à cette forme (normaliser).
 * Les hyperboles de tous les jours restent dehors (« je meurs », « ça me tue », « il va me jeter », « j’ai peur qu’il me
 * ghoste ») : ce sont elles qui faisaient des numéros sans rapport.
 */

/** Le texte en minuscules, sans accents, l’apostrophe droite et les espaces simples. */
const normaliser = (texte: string) => texte.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’ʼ`]/g, "'").replace(/\s+/g, " ");

/** Ce qui fait penser à un danger ou à une détresse, dans un texte normalisé. */
const SIGNES: readonly RegExp[] = [
  /* Se faire du mal, en finir */
  /suicid/,
  /\b(me|se) (tuer|buter|flinguer|pendre|foutre en l'air|faire du mal|scarifier|mutiler)\b/,
  /\bscarif|\bautomutil|\bphlebo\b/,
  /\ben finir\b/,
  /\b(envie de|veux|voudrais) mourir\b/,
  /\b(plus|pas) envie de vivre\b|\bmarre de (la vie|vivre)\b/,
  /\b(couper|ouvrir) les veines\b/,
  /\bje vais (tres |vraiment |trop )?mal\b|\bje vais pas bien\b/,
  /\bdepress/,
  /* Être en danger : les coups, les menaces, la peur de l’autre */
  /\bfrapp|\bgifl|\betrangl/,
  /\bviol(e|ee|es|ees|er|ait|ent|ente|ence|ences|eur)?\b/,
  /\bagress|\bmenac|\bharcel|\bchantage\b|\bsextor/,
  /\b(il|elle) me fai(t|s) peur\b|\bpeur (de lui|d'elle|pour ma vie)\b/,
  /\ben danger\b|\bau secours\b|\baidez[- ]moi\b|\bla police\b|\bporter plainte\b/,
  /\bkill (my ?self|me)\b|\bself[- ]harm/,
];

/** Vrai si ce texte fait penser à un danger ou à une détresse (voir l’en-tête du fichier). */
export const detresseProbable = (texte: string): boolean => {
  const t = normaliser(texte);
  return SIGNES.some((signe) => signe.test(t));
};
