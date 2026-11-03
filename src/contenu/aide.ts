/*
 * L’aide à un toucher, partout où l’appli la donne, écrite une fois : les numéros d’urgence (les conditions, et le chat
 * quand il n’y a plus de bulles), les lignes d’écoute du rapport doux (le mode sobre), et les lignes par situation qui
 * les suivent. Un numéro changé ici change partout.
 * Aucune détection de la détresse ne tourne sur le serveur avant le modèle : c’est le modèle qui lève une alerte (le
 * mode sobre pour la règle de l’âge ; une réponse du chat en alerte se paie comme les autres depuis le 21 octobre
 * 2026, mais verrouillée, elle montre les numéros d’urgence). Un message envoyé sans bulles quand une réponse verrouillée attend déjà
 * n’arrive pas jusqu’à lui (402 « bulles ») : cette réponse, et ce que l’écran en dit, portent donc toujours les
 * numéros d’urgence (AIDE_SANS_BULLES), quoi qu’il ait écrit.
 */

/** Les numéros d’urgence, et celui de la prévention du suicide, en une phrase. */
export const URGENCES = "Si tu te sens en danger, appelle le 17 ou le 112. Si tu vas mal, le 3114 répond jour et nuit, gratuitement.";

/** Les lignes d’écoute du rapport doux (le mode sobre), absentes des maquettes (validées). */
export const LIGNES_D_ECOUTE = [
  { name: "Fil Santé Jeunes", detail: "Anonyme et gratuit, tous les jours de 9 h à 23 h", tel: "0800235236", label: "0 800 235 236" },
  { name: "SOS Amitié", detail: "À l’écoute 24 h sur 24", tel: "0972394050", label: "09 72 39 40 50" },
] as const;

/*
 * Les lignes par situation (la décision n° 5 du plan SEO, « Les cinq », du 3 novembre 2026), sous les lignes d’écoute :
 * chacune dit pour qui elle est (`pour`, en tutoiement), ce que les sources promettent et rien de plus (`detail`),
 * comment la joindre d’un toucher (`lien` : un appel, un SMS ou une page) et ce qu’on lit (`label`). Les faits viennent
 * des sources officielles (service-public.gouv.fr, masecurite.interieur.gouv.fr, allo119.gouv.fr, e-enfance.org,
 * commentonsaime.fr, enavanttoutes.fr), lues puis relues le 2026-11-03 ; chaque ligne garde ses sources au-dessus d’elle.
 * L’ordre va du plus urgent au moins urgent : le 114 fait venir les secours, le 119 a le statut de numéro d’urgence, le
 * 3919 écoute jour et nuit, le 3018 de 9 h à 23 h, le tchat a ses horaires. « Anonyme » seulement là où la source le
 * dit : le 114 demande ton nom et ton adresse, l’appel au 119 est identifié (confidentiel, pas anonyme), le 3018 peut
 * lever l’anonymat en cas de danger grave.
 * TODO(produit): les textes des cinq lignes et leur place sous les lignes d’écoute, sans maquette, à valider.
 */
/** Les lignes par situation du rapport doux, du plus urgent au moins urgent (sources officielles, vérifiées le 2026-11-03). */
export const LIGNES_PAR_SITUATION = [
  /*
   * Le SMS au 114, ouvert à qui ne peut pas parler à voix haute (l’auteur des violences dans la même pièce) : ministère
   * de l’Intérieur (fiche du 114, mise à jour le 17/03/2026), service-public.gouv.fr F33954 (vérifiée le 25/08/2026) et
   * F33953. Jamais « appelle » : il ne reçoit pas les appels vocaux. Le site du service (info.urgence114.fr) le dit
   * encore réservé aux personnes sourdes, malentendantes et aphasiques : l’État fait foi, pour l’urgence seulement.
   */
  {
    name: "Urgence par SMS",
    pour: "Si tu es en danger et ne peux pas parler à voix haute",
    detail: "Gratuit, 24\u00a0h sur 24\u00a0: écris ton nom, ton adresse précise et ce qui se passe",
    lien: "sms:114",
    label: "114",
  },
  /*
   * Le 119 – Enfance en danger (France Enfance Protégée, GIP) : allo119.gouv.fr, l’annuaire de service-public R20576
   * (vérifié le 08/10/2026) et le bulletin 2025 du 119 (les sollicitations ne sont « pas anonymes »). Gratuit depuis
   * tous les téléphones, invisible sur les factures, les appels de mineurs en priorité.
   */
  {
    name: "Enfance en danger",
    pour: "Si tu as moins de 18 ans et que tu es en danger, ou qu’un enfant l’est",
    detail: "Appel gratuit et confidentiel, 24\u00a0h sur 24, invisible sur la facture",
    lien: "tel:119",
    label: "119",
  },
  /*
   * Le 3919 – Violences Femmes Info (la FNSF) : service-public.gouv.fr F33954 (25/08/2026), F12544 (01/04/2026) et
   * l’actualité A16929 (04/02/2026). Une ligne pour les femmes, pas un numéro généraliste (réponse ministérielle du
   * 30/12/2025) ; 24 h sur 24, gratuit et anonyme pour l’appel seulement (le tchat : en semaine de 13 h à 20 h).
   */
  {
    name: "Violences Femmes Info",
    pour: "Si tu es une femme victime de violences, dans ton couple ou ailleurs",
    detail: "Appel gratuit et anonyme, 24\u00a0h sur 24, invisible sur la facture",
    lien: "tel:3919",
    label: "3919",
  },
  /*
   * Le 3018 (l’association e-Enfance) : e-enfance.org (besoin-daide, le3018, la sextorsion), son rapport de
   * transparence 2025 (« pour les jeunes de moins de 25 ans ») et service-public.gouv.fr F32239 (07/08/2026). Le
   * téléphone n’a répondu qu’à 36 % des sollicitations en 2025, tous les tchats ont eu leur réponse : la ligne donne
   * donc aussi le tchat, sous l’adresse qu’écrit e-enfance.org/le3018 (3018.fr, qui mène au tchat de
   * e-enfance.org/besoin-daide), sans le trait d’union de « e-enfance.org », où la ligne se coupait sur un téléphone.
   */
  {
    name: "Harcèlement en ligne",
    pour: "Si on diffuse tes photos intimes ou qu’on te fait chanter en ligne",
    detail: "Moins de 25 ans, gratuit et confidentiel, tous les jours de 9\u00a0h à 23\u00a0h, ou en tchat sur 3018.fr",
    lien: "tel:3018",
    label: "3018",
  },
  /*
   * Le tchat de commentonsaime.fr (l’association En avant toute(s)) : sa page du tchat et enavanttoutes.fr. Anonyme
   * (un prénom ou un pseudo), gratuit, pas un dispositif d’urgence ; le dimanche n’est pas dans ses horaires. Pour une
   * personne mineure, l’équipe peut devoir signaler les faits à la justice : jamais « confidentiel » ici.
   */
  {
    name: "Comment on s’aime",
    pour: "Si ta relation te fait du mal et que tu préfères écrire",
    detail: "Tchat anonyme et gratuit, du lundi au jeudi de 10\u00a0h à minuit, vendredi et samedi de 10\u00a0h à 21\u00a0h",
    lien: "https://commentonsaime.fr/besoin-daide/le-tchat-pour-discuter/",
    label: "commentonsaime.fr",
  },
] as const;

/** « Gratuit » → « gratuit » au milieu d’une phrase ; un sigle (« SMS ») reste tel quel. */
const auMilieu = (texte: string) => texte.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());

/**
 * Ce que porte toute réponse 402 « bulles » (src/server/http.ts) : les numéros d’urgence, puis les lignes d’écoute et
 * les lignes par situation, une ligne chacune. Le navigateur dit la première sous « plus de bulles »
 * (src/lib/messages-erreur.ts).
 */
export const AIDE_SANS_BULLES: readonly string[] = [
  URGENCES,
  ...LIGNES_D_ECOUTE.map((l) => `${l.name}\u00a0: ${l.label} (${l.detail})`),
  ...LIGNES_PAR_SITUATION.map((l) => `${l.name}\u00a0: ${l.label} (${l.pour}, ${auMilieu(l.detail)})`),
];
