/*
 * L’aide à un toucher, partout où l’appli la donne, écrite une fois : les numéros d’urgence (les conditions, le chat en
 * alerte, et le chat quand il n’y a plus de bulles), les lignes d’écoute du rapport doux (le mode sobre), et les lignes
 * par situation qui les suivent. Les lignes d’écoute et par situation se voient sur la feuille d’aide du rapport doux et
 * dans son PDF (depuis les 21 et 22 octobre 2026, seule la règle de l’âge, alerteSobre, met une conv en mode sobre ; un
 * verdict gardé d’avant le reste, `mode_sobre`), et dans le bloc d’aide des guides et du lexique (zones orange et rouge,
 * src/components/article/pieces.tsx). La réponse 402 les porte aussi, mais l’écran n’en montre que la première ligne
 * (URGENCES).
 * Un numéro changé ici change partout dans l’appli, mais pas dans ce que dit le modèle : les prompts ont leur propre
 * liste d’aide (AIDE, prompts/lib/contextes.ts, dans le sous-module privé), à aligner à la main.
 * Aucune détection de la détresse ne tourne sur le serveur avant le modèle : c’est le modèle qui lève une alerte (le
 * mode sobre pour la règle de l’âge ; une réponse du chat en alerte se paie comme les autres depuis le 21 octobre
 * 2026, mais verrouillée, elle montre les numéros d’urgence). Un message envoyé sans bulles quand une réponse verrouillée attend déjà
 * n’arrive pas jusqu’à lui (402 « bulles ») : cette réponse porte toujours les numéros d’aide (AIDE_SANS_BULLES), et
 * l’écran dit les numéros d’urgence seulement si ses mots font penser à un danger (detresseProbable, src/lib/detresse.ts ;
 * décidé le 9 novembre 2026, avant ils suivaient chaque fois, « aucun rapport » avec la recharge).
 */

/**
 * Les numéros de la phrase des urgences, dans son ordre : la police, le numéro d’urgence européen, la prévention du
 * suicide. URGENCES est écrite avec eux, et /aide en fait un bouton chacun (src/contenu/pages-de-confiance.ts) : un
 * numéro à ajouter à la phrase s’ajoute ici, jamais à la main dans son texte, où il n’aurait pas de bouton.
 */
export const NUMEROS_D_URGENCE = { police: "17", europeen: "112", suicide: "3114" } as const;

/** Les numéros d’urgence, et celui de la prévention du suicide, en une phrase. */
export const URGENCES = `Si tu te sens en danger, appelle le ${NUMEROS_D_URGENCE.police} ou le ${NUMEROS_D_URGENCE.europeen}. Si tu vas mal, le ${NUMEROS_D_URGENCE.suicide} répond jour et nuit, gratuitement.`;

/** Les lignes d’écoute du rapport doux (le mode sobre), absentes des maquettes (validées). */
export const LIGNES_D_ECOUTE = [
  { name: "Fil Santé Jeunes", detail: "Anonyme et gratuit, tous les jours de 9 h à 23 h", tel: "0800235236", label: "0 800 235 236" },
  { name: "SOS Amitié", detail: "À l’écoute 24 h sur 24", tel: "0972394050", label: "09 72 39 40 50" },
] as const;

/*
 * Les lignes par situation (la décision n° 5 du plan SEO, « Les cinq », du 3 novembre 2026), sous les lignes d’écoute :
 * chacune dit pour qui elle est (`pour`, en tutoiement), ce que les sources promettent et rien de plus (`detail`),
 * comment la joindre d’un toucher (`lien` : un appel, un SMS ou une page) et ce qu’on lit (`label`). Une ligne qui se
 * joint aussi par écrit a un second geste (`tchat` : la page de son tchat), à côté de l’appel. Les faits viennent
 * des sources officielles (service-public.gouv.fr, masecurite.interieur.gouv.fr, allo119.gouv.fr, e-enfance.org,
 * commentonsaime.fr, enavanttoutes.fr), lues puis relues le 2026-11-03 ; chaque ligne garde ses sources au-dessus d’elle.
 * L’ordre va du plus urgent au moins urgent : le 114 fait venir les secours, le 119 a le statut de numéro d’urgence, le
 * 3919 écoute jour et nuit, le 3018 de 9 h à 23 h, le tchat a ses horaires. « Anonyme », parmi les cinq, seulement pour
 * l’appel au 3919 : le 114 demande ton nom et ton adresse, l’appel au 119 est identifié (confidentiel, pas anonyme), le
 * 3018 peut lever l’anonymat en cas de danger grave, et le tchat de commentonsaime.fr peut signaler un mineur à la
 * justice. Ces lignes sont lues surtout par des mineurs : la feuille ne s’ouvre plus que pour la règle de l’âge (et les
 * verdicts sobres d’avant).
 * TODO(produit): les textes des cinq lignes et leur place sous les lignes d’écoute, sans maquette, à valider. L’ordre
 * aussi : le 119, la ligne des mineurs, vient en 4e, sous Fil Santé Jeunes, SOS Amitié et le 114 (hors du premier écran
 * à 320 × 568) ; le mettre en tête de la feuille ?
 * Ni le 17 ni le 112 sur la feuille et dans le PDF : décidé par l’utilisateur le 3 novembre 2026 (la feuille reste
 * telle quelle), alors que la phrase vérifiée du 3919 finit par « En danger : appelle le 17 (ou le 112) » et que ni le
 * 3919 ni le tchat ne traitent les urgences. Si on y revient : une ligne « Police secours · 17 » en tête, ou URGENCES en
 * haut de la feuille comme dans le chat en alerte ; jamais dans la carte du 3919, qui appelle le 3919 d’un toucher.
 * TODO(produit): dans l’appli, les cinq ne se voient que sur la feuille du rapport doux et dans son PDF (et sur les
 * guides, dans le bloc d’aide). Le chat en alerte ne montre que URGENCES (src/server/historique.ts, décidé le 3 novembre
 * 2026 : on n’y ajoute rien), le rapport complet d’une alerte « danger » ou « détresse » aucune ligne, et le modèle a sa
 * liste à part (AIDE des prompts, sans le 119, le 3018 ni commentonsaime.fr, le 3919 sans « femmes ») : les
 * montrer aussi au chat en alerte et à ce rapport, et aligner la liste des prompts ?
 * TODO(produit): des promesses valables en France : l’appel au 3919 n’est gratuit que depuis la métropole et les DROM,
 * les horaires du 3018 et du tchat sont ceux de Paris (le 3018 en a d’autres outre-mer), et ces numéros courts ne
 * répondent pas depuis l’étranger. À revoir si l’appli s’ouvre hors de France.
 */
/** Les lignes par situation du rapport doux, du plus urgent au moins urgent (sources officielles, vérifiées le 2026-11-03). */
export const LIGNES_PAR_SITUATION = [
  /*
   * Le SMS au 114, ouvert à qui ne peut pas parler à voix haute (l’auteur des violences dans la même pièce) : ministère
   * de l’Intérieur (fiche du 114, mise à jour le 17/03/2026), service-public.gouv.fr F33954 (vérifiée le 25/08/2026) et
   * F33953. Jamais « appelle » : il ne reçoit pas les appels vocaux. Le site du service (info.urgence114.fr) le dit
   * encore réservé aux personnes sourdes, malentendantes et aphasiques : l’État fait foi, pour l’urgence seulement
   * (« maintenant » : hors urgence, le ministère renvoie au tchat de la police et de la gendarmerie). Sans réponse au
   * bout d’une minute, il faut renvoyer le SMS (le mode d’emploi d’info.urgence114.fr).
   */
  {
    name: "Urgence par SMS",
    pour: "Si tu es en danger maintenant et ne peux pas parler à voix haute",
    detail: "Gratuit, 24\u00a0h sur 24\u00a0: écris ton nom, ton adresse précise et ce qui se passe\u00a0; sans réponse au bout d’une minute, renvoie ton SMS",
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
   * téléphone n’a répondu qu’à 36 % des sollicitations en 2025, tous les tchats ont eu leur réponse : le tchat vaut
   * l’appel, et la ligne a deux gestes. Le second ouvre e-enfance.org/besoin-daide, où mène 3018.fr : son bouton « Besoin
   * d’aide ? » ouvre le tchat (un écoutant y répond de 9 h à 23 h, vu le 2026-11-03), et la page donne l’application
   * 3018. Le texte écrit l’adresse qu’écrit e-enfance.org/le3018 (3018.fr), pour le PDF, où rien ne se touche, et sans
   * le trait d’union de « e-enfance.org », où la ligne se coupait sur un téléphone.
   */
  {
    name: "Harcèlement en ligne",
    pour: "Si on diffuse tes photos intimes ou qu’on te fait chanter en ligne",
    detail: "Moins de 25 ans, gratuit et confidentiel, tous les jours de 9\u00a0h à 23\u00a0h, ou en tchat sur 3018.fr",
    lien: "tel:3018",
    label: "3018",
    tchat: "https://e-enfance.org/besoin-daide/",
  },
  /*
   * Le tchat de commentonsaime.fr (l’association En avant toute(s)) : sa page du tchat et enavanttoutes.fr. Gratuit, on
   * y entre sous un prénom ou un pseudo (et son département), pas un dispositif d’urgence ; le dimanche n’est pas dans
   * ses horaires. Pour une personne mineure, l’équipe peut devoir signaler les faits à la justice, et une enquête de
   * police peut suivre : ni « anonyme » (comme pour le 119 et le 3018) ni « confidentiel » ici, seulement ce qu’on donne.
   */
  {
    name: "Comment on s’aime",
    pour: "Si ta relation te fait du mal et que tu préfères écrire",
    detail: "Tchat gratuit, sous un prénom ou un pseudo, du lundi au jeudi de 10\u00a0h à minuit, vendredi et samedi de 10\u00a0h à 21\u00a0h",
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
