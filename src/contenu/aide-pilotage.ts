import { prixDe } from "./offres";
import { CIBLE_DE_MARGE } from "./pilotage";

/*
 * Les « ? » du pilotage (/admin) : comment lire chaque carte et chaque chiffre clé. Les textes reprennent la maquette du
 * 13 octobre, ajustés aux vrais calculs (src/server/stats.ts, Pilotage ; src/server/visites.ts ; src/contenu/pilotage.ts) :
 * un texte qui dit autre chose que le calcul ment à l’équipe. Le panneau y ajoute la valeur du moment (src/app/admin/Aide.tsx).
 * Réservé à l’équipe : les prestataires (Whop, le modèle) peuvent y être nommés.
 * TODO(produit): textes des « ? » à valider.
 */

/** Une explication : son titre, ce qu’elle explique (« Comment lire … »), et ses quatre blocs. */
export type AideDuPilotage = {
  titre: string;
  /** La fin du nom du bouton : « Comment lire » + `de`. */
  de: string;
  quoi: string;
  calcul: string;
  repere: string;
  siCaBouge: string;
};

export const AIDES_DU_PILOTAGE = {
  ca: {
    titre: "Chiffre d’affaires",
    de: "le chiffre d’affaires",
    quoi: "Ce que les vrais clients ont payé sur la période, une fois les remboursements et les contestations retirés.",
    calcul:
      "Les achats payés sur la période (même remboursés depuis), moins ceux remboursés et ceux contestés sur la période. En TTC\u00a0: le prix payé, figé à la commande. Whop reverse ensuite la TVA et garde ses frais. Les vrais clients seulement\u00a0: les achats de l’équipe, du tournage et des invités, rangés une fois pour toutes à l’heure de leur paiement, sont retirés de toutes les ventes de /admin (le taux d’achat, le revenu par acheteur, les courbes, les sources, ce qui se vend)\u00a0; «\u00a0Achats d’essai retirés\u00a0» dit combien. Whop, lui, les compte\u00a0: son total peut être plus haut. Les colonnes montrent le payé de chaque heure (sur 24\u00a0h) ou de chaque jour de Paris, remboursements non retirés.",
    repere: "La flèche compare à la période d’avant, de même durée. La colonne rose est celle en cours\u00a0: elle n’est pas finie.",
    siCaBouge: "S’il baisse alors que les visiteurs montent, le problème est après l’arrivée\u00a0: regarde le tunnel. S’il baisse avec les visiteurs, c’est la distribution.",
  },
  live: {
    titre: "En direct",
    de: "le direct",
    quoi: "Les personnes sur le site en ce moment, l’écran où elles sont, d’où elles arrivent et la ville d’où elles se connectent.",
    calcul:
      "Chaque onglet ouvert et visible fait signe toutes les 40\u00a0secondes\u00a0; il compte en ligne s’il a fait signe dans la dernière minute et demie. La ville vient de la connexion, à la ville près\u00a0: l’adresse IP n’est jamais gardée, et ni compte, ni conv, ni nom n’apparaît. Les outils de l’équipe (/admin, /apercu) ne comptent pas. Le fil montre chaque achat, ceux de l’équipe compris\u00a0; le total du jour, lui, ne compte que les vrais clients.",
    repere: "Un pic soudain veut presque toujours dire qu’une vidéo vient de partir\u00a0: regarde «\u00a0D’où ils arrivent\u00a0» sur la page En direct.",
    siCaBouge: "Beaucoup de monde au paiement et aucun achat dans le fil\u00a0: vérifie que Whop répond.",
  },
  visiteurs: {
    titre: "Visiteurs",
    de: "les visiteurs",
    quoi: "Les personnes venues sur le site sur la période, comptées une fois par jour.",
    calcul:
      "Un visiteur se compte au premier signe de son onglet, une fois par jour de Paris, sans cookie\u00a0: son adresse IP et son navigateur sont mêlés à un sel tiré chaque jour et effacé le surlendemain, et l’adresse IP n’est jamais gardée. Une personne revenue deux jours compte deux fois. Les outils de l’équipe ne comptent pas.",
    repere: "Il suit tes vidéos\u00a0: un pic, c’est une vidéo qui marche. Compare-le au planning de publication.",
    siCaBouge: "S’il baisse, c’est la distribution (créatrices, posts, comptes), pas le produit.",
  },
  conversion: {
    titre: "Taux d’achat",
    de: "le taux d’achat",
    quoi: "La part des visiteurs qui achètent au moins une fois sur la période.",
    calcul:
      "Les vrais clients qui ont payé au moins un achat sur la période (sans l’équipe, le tournage ni les invités), divisés par les visiteurs de la même période. Un compte qui achète deux fois compte une fois\u00a0; un visiteur revenu deux jours compte deux fois\u00a0: le taux est plutôt prudent.",
    repere: "Entre 2 et 4\u00a0% est bon pour un achat sous 20\u00a0€ venu des réseaux.",
    siCaBouge: "S’il baisse, regarde quelle étape du tunnel a lâché, puis quelle source a changé.",
  },
  panier: {
    titre: "Revenu par acheteur",
    de: "le revenu par acheteur",
    quoi: "Ce qu’un acheteur dépense en moyenne sur la période, recharges de bulles comprises.",
    calcul:
      "Le payé TTC des vrais clients sur la période (remboursements non retirés, achats de l’équipe, du tournage et des invités retirés), divisé par les vrais clients qui ont payé au moins un achat.",
    repere: "Au-dessus de 9,90\u00a0€, Premium et les recharges font leur travail. Le plafond naturel est autour de 20\u00a0€.",
    siCaBouge: "S’il baisse\u00a0: Premium est moins choisi sur la feuille du paiement, ou les coups de pouce ne se montrent plus.",
  },
  marge: {
    titre: "Marge produit",
    de: "la marge produit",
    quoi: "Ce qu’il reste de ce que paient les vrais clients, hors taxes, une fois payée l’IA du produit. Les tests (l’équipe et le tournage) n’y comptent ni dans les ventes ni dans l’IA\u00a0: ils se lisent à côté.",
    calcul:
      "(Chiffre d’affaires net des vrais clients hors taxes − l’IA du produit, en euros) ÷ ce chiffre d’affaires. Les vrais clients\u00a0: les acheteurs qui ne sont ni de l’équipe, ni du tournage, ni des invités, rangés une fois pour toutes à l’heure de leur paiement (les achats d’essai de l’équipe sont retirés, même si son compte d’essai est effacé ensuite). L’IA du produit\u00a0: celle des clients et des prospects (ceux qui importent sans acheter\u00a0: ce qu’il en coûte pour faire des clients), chaque appel rangé par la même règle («\u00a0Ce que coûte l’IA\u00a0» la détaille). La TVA retirée est celle de la France (20\u00a0%), le dollar compté à son cours du 11 octobre. Hors frais Whop et hors créatrices\u00a0: c’est une estimation. La courbe\u00a0: le payé et l’IA du produit de chaque case.",
    repere: `La cible\u00a0: ${CIBLE_DE_MARGE}\u00a0% ou plus. En dessous, la carte passe en orange. Ce que coûtent les tests s’écrit dessous, à part, et le non classé avec la marge au pire (s’il était tout du produit).`,
    siCaBouge:
      "Si elle baisse\u00a0: le chat coûte trop par réponse, ou des bulles offertes partent en réponses. Regarde l’IA du produit, poste par poste. Des tests qui grimpent ne la touchent pas. Un appel «\u00a0non classé\u00a0» (une conv effacée avant sa note, une ligne d’avant la règle que rien ne rattache, une ligne pas encore rangée) n’y est pas non plus\u00a0: beaucoup de non classé, et la marge se lit trop belle, d’où la marge au pire écrite dessous. Juste après une mise en ligne, l’historique se range en quelques passages de 5\u00a0minutes\u00a0: lis la marge une fois le non classé retombé. Les lectures de captures d’avant le 26 octobre (sans conv ni envoi notés) sont rangées en prospect\u00a0: un essai de l’équipe sans compte peut s’y glisser.",
  },
  tunnel: {
    titre: "Le tunnel",
    de: "le tunnel",
    quoi: "Où les gens s’arrêtent, de l’arrivée sur le site au deuxième achat.",
    calcul:
      "Les visiteurs de la période, les convs importées sur la période, celles d’entre elles qui ont vu le paywall (leur lecture lancée\u00a0; le verdict, lui, vient après le paiement), les vrais clients qui ont payé sur la période, et ceux d’entre eux qui ont payé au moins deux achats (depuis toujours). Les convs et les achats de l’équipe, du tournage et des invités n’y sont pas\u00a0: une conv dont une lecture leur est rangée ne compte pas, ni une conv jamais lue de l’un de leurs comptes. Le pourcentage du haut se fait sur l’étape d’avant.",
    repere: "La colonne orange est la plus grosse fuite, entre l’arrivée et l’achat\u00a0: c’est là qu’un changement rapporte le plus.",
    siCaBouge: "Change une seule chose à la fois, et compare avec la période d’après.",
  },
  import: {
    titre: "L’import, écran par écran",
    de: "l’import, écran par écran",
    quoi: "Où les visiteurs lâchent entre l’arrivée et la lecture lancée\u00a0: le choix de l’appli, le tuto de l’export, le fichier, «\u00a0Qui es-tu\u00a0?\u00a0», l’email et son code.",
    calcul:
      "Chaque étape compte les personnes qui l’ont passée sur la période, une fois par jour, par la même empreinte sans cookie que les visiteurs (src/lib/jalons.ts). «\u00a0Conv bien reçue\u00a0»\u00a0: l’envoi a marché. «\u00a0Envois ratés\u00a0»\u00a0: un fichier illisible, une conv trop courte ou de groupe, le réseau. Le pourcentage se fait sur l’étape d’avant. Sous «\u00a0Choisissent leur fichier\u00a0», le même passage appli par appli\u00a0: ceux qui ouvrent l’écran de cette appli (l’export WhatsApp ou Instagram, les captures ou la vidéo), puis ceux qui y choisissent un fichier. Qui passe d’une appli à l’autre compte sous chacune\u00a0: les lignes additionnées peuvent dépasser l’étape.",
    repere:
      "La ligne orange est la plus grosse perte. Un compte déjà connecté passe de «\u00a0Qui es-tu\u00a0?\u00a0» à la lecture sans email ni code\u00a0: ces deux étapes peuvent compter moins que la suivante. Un taux se lit à partir de 30\u00a0personnes\u00a0: en dessous, une appli montre «\u00a0—\u00a0».",
    siCaBouge:
      "Beaucoup choisissent leur appli mais pas de fichier\u00a0: le tuto de l’export est trop dur, revois sa vidéo, en commençant par l’appli qui passe le moins au fichier. Beaucoup demandent un code sans le valider\u00a0: le mail arrive mal (les spams, le délai).",
  },
  paywall: {
    titre: "Le paywall, jusqu’au paiement",
    de: "le paywall, jusqu’au paiement",
    quoi: "Ce qui se passe entre l’arrivée au paywall et le paiement\u00a0: jusqu’où l’on descend, la formule touchée, le bouton qui paie, le formulaire de Whop et ce qu’il devient.",
    calcul:
      "Les personnes qui ont passé chaque étape sur la période, une fois par jour (la même empreinte que les visiteurs), l’équipe comprise\u00a0: ces étapes se notent sans compte, et ses essais au paywall y comptent, jusqu’au paiement. «\u00a0Voient le formulaire de Whop\u00a0»\u00a0: la carte de Whop affichée, ou Apple Pay ouvert. «\u00a0Refermé sans payer\u00a0»\u00a0: la feuille de la carte refermée, ou Apple Pay annulé. Seul le paywall d’avant la lecture compte ici (son offre ① comprise, depuis le 21 octobre), ni la feuille du rapport, ni les recharges. «\u00a0Qu’est-ce qui coince\u00a0?\u00a0» (depuis le 26 octobre)\u00a0: la question posée une fois par visite (la carte refermée sans payer, 40\u00a0s sans payer, ou le retour sur l’onglet), puis la réponse touchée\u00a0; l’offre ① ne vient plus qu’après «\u00a0C’est trop cher\u00a0».",
    repere:
      "Plus de feuilles de carte ouvertes que de formulaires affichés\u00a0: la carte de Whop charge mal. «\u00a0Premium au bouton\u00a0» se compare à «\u00a0Ce qui se vend\u00a0». Un taux se lit à partir de 30\u00a0personnes.",
    siCaBouge:
      "Peu de monde descend jusqu’aux avis\u00a0: remonte une preuve. Beaucoup voient le formulaire sans envoyer\u00a0: le prix ou la confiance coince au dernier moment. Beaucoup de refus\u00a0: regarde Whop. Beaucoup de «\u00a0trop cher\u00a0»\u00a0: regarde ce que l’offre ① en fait («\u00a0Les coups de pouce\u00a0»)\u00a0; beaucoup de «\u00a0pas confiance\u00a0»\u00a0: remonte les avis et la discrétion\u00a0; des «\u00a0ça a bugué\u00a0»\u00a0: regarde la santé et Whop.",
  },
  note: {
    titre: "Le rapport t’a parlé\u00a0?",
    de: "la note du rapport",
    quoi: "Ce que les clients disent de leur rapport, en un toucher au bas du rapport écrit\u00a0: «\u00a0Oui, grave\u00a0» ou «\u00a0Bof\u00a0», ce qui n’allait pas, et les avis laissés.",
    calcul:
      "Des compteurs par jour (src/server/note-du-rapport.ts), une fois par conv chacun, sans rien de la conv ni du compte\u00a0: la note au premier toucher d’une tuile, la raison à «\u00a0Envoyer\u00a0», l’avis à «\u00a0Publier\u00a0». Un avis part à l’équipe par mail\u00a0: le relire avant de le mettre sur le site.",
    repere: "La part de «\u00a0Oui, grave\u00a0» se lit à partir de 30\u00a0notes. Sous les deux tiers, le rapport déçoit\u00a0: lis les raisons.",
    siCaBouge:
      "Beaucoup de «\u00a0À côté de notre histoire\u00a0» ou de «\u00a0Pas assez précis\u00a0»\u00a0: le rapport (le prompt) est à revoir. Beaucoup de «\u00a0Trop dur\u00a0»\u00a0: le ton.",
  },
  quiImporte: {
    titre: "Qui importe",
    de: "qui importe",
    quoi: "Les filles et les garçons qui importent une conv, de qui ils parlent (un garçon, une fille), et qui achète le mieux.",
    calcul:
      "Chaque conv importée sur la période compte une fois, sans les prises du tournage ni les convs de l’équipe et des invités (une de leurs lectures leur est rangée, ou leur compte pour une conv jamais lue)\u00a0: une personne qui importe deux convs compte deux fois. Son genre est le pronom choisi sur «\u00a0Qui es-tu\u00a0?\u00a0»\u00a0; «\u00a0Pas encore dit\u00a0»\u00a0: la conv laissée avant cet écran. L’autre est celui que prend la lecture\u00a0: le pronom choisi sur sa fiche, sinon celui que ses accords laissent lire dans la conv, sinon l’opposé de celui qui importe («\u00a0devinés\u00a0»). «\u00a0Payées\u00a0»\u00a0: celles de ces convs dont le rapport a été payé depuis (le rapport, Premium, une offre unique, un 2e rapport), même remboursé, par un vrai client\u00a0; une conv offerte par l’équipe ou la bêta n’y est pas. Le taux\u00a0: payées ÷ importées, ligne par ligne (aucun pour «\u00a0Pas encore dit\u00a0»\u00a0: le paywall vient après «\u00a0Qui es-tu\u00a0?\u00a0»). Le genre reste chiffré avec la conv\u00a0: il se déchiffre le temps du calcul, et seuls des totaux en sortent.",
    repere:
      "Un taux se lit à partir de 30\u00a0convs\u00a0: en dessous, «\u00a0—\u00a0». Une conv importée à la fin de la période a encore le temps d’être payée\u00a0: le taux de 24\u00a0h est plus bas que celui de 30\u00a0jours. Beaucoup de «\u00a0devinés\u00a0»\u00a0: deux filles ou deux garçons qui ne l’ont pas corrigé sur la fiche comptent comme une fille et un garçon.",
    siCaBouge:
      "Le public qui achète le mieux est celui à viser\u00a0: ses vidéos, ses créatrices, ses accroches. Un genre qui importe beaucoup et achète peu\u00a0: le paywall lui parle mal, relis-le avec ses yeux.",
  },
  hauts: {
    titre: "Le haut du paywall",
    de: "le haut du paywall",
    quoi: "Le titre que chaque conv voit en haut de son paywall, parmi six (la tendance, tout vient de toi, tout vient de l’autre, le contraste, l’égalité, et «\u00a0sans heures\u00a0» pour les captures, les vidéos et les convs de quelques jours), et combien de rapports se débloquent après chacun.",
    calcul:
      "Le code choisit le titre d’après les chiffres de la conv, sans le modèle (src/contenu/haut-du-paywall.ts). «\u00a0Vus\u00a0»\u00a0: les convs arrivées au paywall avec ce titre, comptées le jour de leur arrivée. «\u00a0Payés\u00a0»\u00a0: les rapports de ces convs débloqués (payés, ou par un rapport d’avance), comptés le jour du paiement, ceux de l’équipe compris (des compteurs, pas les achats). Le titre d’une conv reste chiffré avec elle\u00a0: ici, seulement des comptes par jour.",
    repere:
      "Compare les taux d’un titre à l’autre, pas les nombres de vus\u00a0: chaque titre va à des convs différentes. Un taux se lit à partir de 30\u00a0vus. Un payé peut venir d’un vu de la période d’avant. «\u00a0Compté depuis le…\u00a0»\u00a0: le titre est arrivé en cours de période, ses chiffres n’en couvrent qu’une partie. Depuis l’arrivée de «\u00a0Sans heures\u00a0», «\u00a0Sans assez de chiffres\u00a0» ne garde que les convs de moins de 10\u00a0messages\u00a0: compare le taux de «\u00a0Sans heures\u00a0» à celui qu’avait «\u00a0Sans assez de chiffres\u00a0» avant (passe en 30\u00a0jours pour le voir).",
    siCaBouge:
      "Un titre qui paie nettement moins que les autres\u00a0: réécris-le, ou change sa place dans la règle. Beaucoup de «\u00a0Sans assez de chiffres\u00a0»\u00a0: les convs arrivent trop courtes.",
  },
  ventesDuChat: {
    titre: "La vente dans le chat",
    de: "la vente dans le chat",
    quoi: `Les cartes d’achat que le chat pose sous les réponses de BLUSH (une recharge, Premium pour ${prixDe("passe_premium")} de plus, une autre conv, le rapport à jour, le réimport d’un ancien rapport doux), ce que les gens en font, et ce qu’elles rapportent. En bas, le test A/B\u00a0: une moitié des comptes reçoit aussi les propositions spontanées, l’autre seulement ce qu’elle demande.`,
    calcul:
      "Le modèle repère le moment (il demande à acheter, parle de quelqu’un d’autre, envoie du neuf)\u00a0; le code choisit la carte (src/server/vente.ts), une spontanée par jour au plus (jamais la recharge, que le bandeau des bulles propose déjà), rien de spontané sur une réponse en alerte ni pendant 3\u00a0jours après un «\u00a0Pas maintenant\u00a0». «\u00a0Posées\u00a0», «\u00a0Touchées\u00a0», «\u00a0Pas maintenant\u00a0»\u00a0: comptées par jour de Paris. «\u00a0Payées\u00a0»\u00a0: les achats payés depuis la carte (la recharge, Premium), sur la période, même remboursés depuis\u00a0; une autre conv ou un réimport se paie plus tard sur son paywall, et ne compte que dans le test. Le test\u00a0: les comptes qui ont écrit au chat sur la période, partagés en deux moitiés fixes, et tout ce qu’ils ont payé sur la période.",
    repere:
      "Le chiffre qui tranche est le payé par compte de chaque moitié, à partir d’une centaine de comptes par moitié. Beaucoup de «\u00a0Pas maintenant\u00a0» sur une carte\u00a0: elle tombe au mauvais moment.",
    siCaBouge:
      "La moitié «\u00a0avec\u00a0» paie plus\u00a0: garde les propositions. Elle paie autant ou moins, ou ses comptes écrivent moins\u00a0: elles dérangent, resserre les seuils (SEUILS_DE_VENTE). Rien ne va\u00a0: BLUSH_VENTE_CHAT=0 coupe toutes les cartes.",
  },
  mails: {
    titre: "Les mails des séquences",
    de: "les mails des séquences",
    quoi: "Les mails que BLUSH envoie tout seul après l’achat (S3), pour les bulles (S4), quand le chat dort (S5), pour une offre gardée (S6), après un 🧊 (S7) et pour un anniversaire (S8)\u00a0: combien sont partis, combien de boutons ont été touchés, et combien de comptes ont payé dans les 3 jours.",
    calcul:
      "«\u00a0Envoyés\u00a0»\u00a0: les mails partis sur la période (envois_mails), sans ceux écartés au moment de les écrire (une alerte, un 🧊). «\u00a0Clics\u00a0»\u00a0: les boutons du mail touchés, comptés par jour (un même compte peut toucher deux fois). «\u00a0Payés\u00a0»\u00a0: les mails après lesquels le compte a payé quelque chose (un rapport, une recharge) dans les 3 jours, que ce soit grâce au mail ou non.",
    repere: "Le taux de clic se lit à partir de 30\u00a0envoyés. «\u00a0Payés\u00a0» compte aussi qui aurait payé sans le mail\u00a0: compare les mails entre eux, pas à zéro.",
    siCaBouge: "Un mail que personne ne touche\u00a0: réécris son sujet (il se lit avant tout le reste). Beaucoup de désinscriptions après un mail\u00a0: espace-le, ou retire-le.",
  },
  sources: {
    titre: "D’où ils viennent",
    de: "les sources",
    quoi: "Le canal par lequel les visiteurs arrivent, et ce que ses vrais clients ont payé.",
    calcul:
      "Le lien d’une créatrice (utm_source), sinon un verdict partagé, sinon le site d’avant, sinon l’appli qui a ouvert le lien, sinon «\u00a0Direct\u00a0». Les acheteurs se rangent d’après le canal de leur compte\u00a0; «\u00a0Avant le suivi\u00a0»\u00a0: des comptes venus avant qu’on compte les visites.",
    repere: "Juge un canal sur son taux d’achat et ce qu’il rapporte, jamais sur ses visiteurs seuls. Le «\u00a0meilleur taux\u00a0» ne se donne qu’à partir de 30\u00a0visiteurs.",
    siCaBouge: "Mets plus de vidéos sur le canal qui achète le mieux, et retravaille l’accroche de celui qui achète le moins.",
  },
  mix: {
    titre: "Ce qui se vend",
    de: "ce qui se vend",
    quoi: "Le payé des vrais clients sur la période, par offre.",
    calcul:
      "Les achats payés sur la période, TTC, remboursements non retirés, achats de l’équipe, du tournage et des invités retirés. «\u00a0Bulles\u00a0» réunit les packs et le passage en Premium après le rapport.",
    repere: "Premium au-dessus de la moitié\u00a0: la feuille du paiement fait son travail.",
    siCaBouge: "Si le rapport seul passe devant Premium, regarde ce que montre la feuille du paiement.",
  },
  coups: {
    titre: "Les coups de pouce",
    de: "les coups de pouce",
    quoi: "Les offres qui ne se montrent qu’une fois par compte, au bon moment.",
    calcul: "Celles montrées sur la période, et combien de celles-là ont été prises\u00a0: prises ÷ montrées.",
    repere: "Au-dessus de 10\u00a0%, l’offre mérite sa place.",
    siCaBouge: "Sous 5\u00a0%\u00a0: change le texte ou le moment, ou retire-la.",
  },
  couts: {
    titre: "Ce que coûte l’IA",
    de: "les coûts de l’IA",
    quoi: "Ce que coûtent les appels au modèle, à la voix et à la transcription sur la période, en deux\u00a0: l’IA du produit (les vrais clients et les prospects) et l’IA des tests (l’équipe et le tournage).",
    calcul:
      "La somme de chaque appel, en dollars comme sur la facture. Chaque appel est rangé une fois, à sa fin, par une seule règle, la première qui convient\u00a0: le tournage (une conv de tournage, son compte, le compte d’une créatrice), l’équipe (un compte qui ouvre /admin, ses alias compris, et toutes ses convs), les invités de BLUSH_ACCES_LIBRE (l’offert, à part\u00a0: ni un test, ni une vente), les clients (un achat payé avant l’appel), les prospects (un compte sans achat, ou des captures lues avant l’email), sinon «\u00a0non classé\u00a0» (une conv effacée avant la note, une ligne d’avant la règle que rien ne rattache, une ligne pas encore rangée). Les achats se rangent de même, une fois, à l’heure du paiement. IA des tests = l’équipe + le tournage\u00a0; IA du produit = les clients + les prospects. Un prospect qui achète garde ses appels d’avant en prospect\u00a0; des captures lues sans compte prennent la population du compte que leur conv trouve dans les deux jours. Les postes, par acheteur, par verdict et par rapport\u00a0: le produit seul, la même population en haut et en bas. Par acheteur\u00a0: l’IA du produit sur les acheteurs du produit. Par verdict (par rapport)\u00a0: tous les appels du verdict (du rapport, de sa mémoire) du produit, essais rejoués, verdicts refaits et convs effacées depuis compris, sur les verdicts (les rapports) gardés de la période dont un appel est du produit\u00a0: ce que coûte un verdict gardé, pas un appel. Le budget du jour, lui, compte tout ce qui part (fixé côté serveur)\u00a0: il coupe les appels une fois atteint\u00a0; l’équipe est prévenue à 50 et 80\u00a0%. Sans compte\u00a0: la part du budget des captures et des vidéos lues avant l’email, celles en cours comptées à ce qu’elles peuvent coûter au plus\u00a0; atteinte, elles s’arrêtent pour tous les visiteurs jusqu’à minuit (l’équipe est prévenue à 80\u00a0%, puis au premier refus). Les bancs des prompts, sur une autre clé, n’y sont pas. Les postes, d’après l’étiquette de chaque appel\u00a0: «\u00a0Captures\u00a0», les captures lues avant l’import et celles envoyées au chat (avec l’étiquette d’avant le 10\u00a0octobre 2026, «\u00a001\u00a0», qui réunissait captures et vidéos)\u00a0; «\u00a0Vidéo\u00a0», les lots d’un enregistrement d’écran lus avant l’achat\u00a0; «\u00a0Vidéo (la suite)\u00a0», les lots gardés d’une longue vidéo, lus après le paiement. Mémoire gardée en direct par une alerte (depuis le 27\u00a0octobre 2026)\u00a0: avec la mémoire en lot allumée, les mises à jour au calme d’une conv en alerte (la règle de l’âge, «\u00a0danger\u00a0», «\u00a0détresse\u00a0»), parties en direct au lieu du lot, par jour de Paris, celles du produit seulement\u00a0; face aux mises à jour du produit parties en lot sur les mêmes jours de Paris (les appels du poste «\u00a0Mémoire (en lot)\u00a0», pas sur la fenêtre glissante du poste\u00a0: juste après minuit, un jour de compteur ne fait que quelques minutes), la part que le garde-fou retire au lot, à partir de 30\u00a0mises à jour.",
    repere: `IA du produit par acheteur, sous 3\u00a0$ pour tenir ${CIBLE_DE_MARGE}\u00a0% de marge. Les tests se paient mais ne se vendent pas\u00a0: ils peuvent coûter plus que le produit sans toucher la marge.`,
    siCaBouge:
      "Si le chat du produit grimpe\u00a0: vérifie la mémoire et la longueur des réponses de BLUSH. Si les tests grimpent\u00a0: un tournage ou des essais tournent sur la production. Si la mémoire gardée en direct par une alerte dépasse environ 20\u00a0% des mises à jour au calme, la mémoire en lot épargne moins que prévu (environ 1,0 à 1,2\u00a0$ par semaine au lieu de 1,40\u00a0$)\u00a0: une conv en alerte le reste, elle ne repasse jamais en lot.",
  },
  avantLAchat: {
    titre: "L’IA avant l’achat",
    de: "l’IA avant l’achat",
    quoi: "Ce que coûte la lecture d’une conv avant que la personne paie, selon comment elle est arrivée\u00a0: un export (rien n’est lu avant l’achat), des captures (une lecture) ou un enregistrement d’écran (lu par lots).",
    calcul:
      "Chaque conv importée sur la période (sans les prises du mode tournage, ni les tests et les invités\u00a0: une conv dont une lecture est rangée équipe, tournage ou invité, par la règle de «\u00a0Ce que coûte l’IA\u00a0») garde son type, son appli, ses écrans et ses lots lus, sans rien de son contenu. Ses lectures (des captures, les lots d’une vidéo, ceux d’un morceau ajouté avant «\u00a0Qui es-tu\u00a0?\u00a0» compris, et ceux qu’un nouvel essai de la même vidéo a repris sans les relire) sont notées sous l’empreinte de son envoi, en dollars comme sur la facture, une lecture arrêtée en route comprise. Jusqu’au paywall\u00a0: le temps médian de sa première lecture (son import, pour un export) au paywall. Paywall\u00a0: sa lecture lancée, comme le tunnel. Paient\u00a0: un achat payé pour cette conv, même remboursé depuis (une conv effacée depuis n’y compte plus). IA par acheteur\u00a0: tout ce que le type a coûté avant l’achat, lu pour rien compris, divisé par les convs payées. Lu pour rien\u00a0: des lectures d’avant l’import qui n’ont mené à aucune conv (un enregistrement abandonné, des captures refusées, une lecture ratée), hors des tests et des invités. Vidéos arrêtées par un refus de lecture (depuis le 27\u00a0octobre 2026)\u00a0: les imports de vidéo dont le modèle a refusé de lire un lot, malgré son repli\u00a0; le navigateur arrête alors tout l’enregistrement, sans conv. Comptées une fois par envoi d’un premier import (un nouvel essai de la même vidéo compte encore, un morceau ajouté jamais), par jour de Paris, seulement pour les clients et les prospects (la règle de «\u00a0Ce que coûte l’IA\u00a0», jugée au refus)\u00a0; leur part se fait sur les vidéos envoyées les mêmes jours de Paris (pas sur la fenêtre glissante du tableau)\u00a0: celles importées, plus celles arrêtées ainsi. Jusque-là, un refus ne se voyait que dans les logs\u00a0; sa lecture compte dans le lu pour rien.",
    repere:
      "Un taux se lit à partir de 30\u00a0convs. Une vidéo de 160\u00a0écrans coûte environ 1,25\u00a0$ à lire. Dans /admin, les postes «\u00a0Captures\u00a0» et «\u00a0Vidéo\u00a0» de «\u00a0Ce que coûte l’IA\u00a0» ne montrent que l’IA du produit (seul le MCP donne aussi leur total, tests compris), à l’heure de chaque appel, lu pour rien compris\u00a0; «\u00a0Captures\u00a0» y ajoute les captures envoyées au chat après l’achat. Ici, chaque lecture se range sous son import, et un import est écarté dès qu’une seule de ses lectures est rangée équipe, tournage ou invité\u00a0: un poste plus haut que sa ligne d’ici, c’est le lu pour rien (à part ici), ces imports écartés, et des lectures faites d’un côté du début de la période pour un import de l’autre côté. Une vidéo arrêtée par un refus n’arrive jamais au paywall\u00a0: autant de ventes possibles perdues.",
    siCaBouge:
      "Si la vidéo coûte bien plus par acheteur que les captures sans payer plus souvent, lis-en moins avant l’achat (la partie la plus récente). Si «\u00a0lu pour rien\u00a0» grimpe\u00a0: regarde les envois ratés de «\u00a0L’import, écran par écran\u00a0» et la santé. Si les refus de lecture grimpent\u00a0: cherche «\u00a0route /api en échec\u00a0» (POST /api/captures/lot, le code «\u00a0refus\u00a0» et sa catégorie) dans les logs de Vercel\u00a0; c’est aussi ce qu’un lot gardé d’une vidéo lue en partie risque après le paiement.",
  },
  lecturePartielle: {
    titre: "Vidéos\u00a0: lecture partielle",
    de: "la lecture partielle des vidéos",
    quoi: "Ce qu’épargnerait la règle visée, avant tout A/B\u00a0: ne lire avant l’achat que la partie la plus récente d’une vidéo, d’abord son lot le plus récent (12\u00a0écrans), puis un lot de plus à la fois, jusqu’à assez pour le haut du paywall. Avec BLUSH_LECTURE_PARTIELLE à «\u00a0mesure\u00a0», toute vidéo de deux lots ou plus se lit en entier comme avant, et note ce que la règle aurait fait\u00a0: la personne ne voit rien de différent. Puis l’A/B des longues vidéos (plus de 5\u00a0lots, à «\u00a0ab\u00a0»)\u00a0: une moitié lue en entier avant l’achat, l’autre dans sa partie la plus récente, le reste de ses écrans gardé chiffré le temps que la conv puisse être achetée (11\u00a0jours après le paywall, le temps des relances), lu après le paiement juste avant le verdict, ou effacé sans avoir été lu.",
    calcul:
      "La règle visée est rejouée sans modèle sur les lots déjà lus de chaque vidéo lue en entier (hors des tests et des invités)\u00a0: en «\u00a0mesure\u00a0», toutes celles de deux lots ou plus\u00a0; en «\u00a0ab\u00a0», la moitié entière. Assez au premier tour\u00a0: le lot le plus récent suffisait. Un tour plus loin\u00a0: il en fallait au moins un de plus, mais pas tous. Jusqu’au bout\u00a0: la règle aurait tout lu, tour par tour. «\u00a0Tout\u00a0»\u00a0: elle aurait tout lu d’un coup, parce que le navigateur doute du sens de la vidéo, que les dates des repères reculent (ou dépassent le jour de l’import), ou que la partie lue a moins de 20\u00a0messages. Ces arrêts se comptent depuis le 27\u00a0octobre 2026. Le titre compare le haut du paywall de la partie que la règle aurait lue à celui de toute la vidéo\u00a0: le même, la tendance perdue, sa date décalée de plus de 7\u00a0jours, ou un autre titre (le titre «\u00a0volume\u00a0» sous une autre forme compris, ses chiffres seuls ne comptent pas). L’IA épargnable\u00a0: ce qu’ont coûté les lots de chaque vidéo, au prorata des écrans que la règle aurait laissés pour après le paiement (estimé)\u00a0; la vidéo seule, telle que mesurée à son import, sans les morceaux ajoutés ensuite (la règle ne les lirait pas), comme ses lots. Pour l’A/B\u00a0: la moitié se tire de l’empreinte des images du lot le plus récent, la même vidéo tombe toujours du même côté. Chaque vidéo compte dès son plan, avant sa lecture, qu’elle aille ou non jusqu’à l’import (ses essais réunis, celles des tests et des invités à part)\u00a0: la moitié entière, plus longue à lire, perd plus de monde en route. Importées, Paywall et Paient\u00a0: sur ces vidéos. Paient plus de 24\u00a0h après\u00a0: les achats faits plus d’un jour après l’import (les relances). IA avant l’achat\u00a0: les lots lus avant le paiement, ceux des vidéos jamais importées compris. Suite lue après\u00a0: les lots gardés, lus après le paiement (le poste «\u00a0Vidéo (la suite)\u00a0», l’étiquette «\u00a0captures_suite\u00a0»), divisés par les convs payées. Jusqu’au paywall\u00a0: de la première lecture d’un lot au paywall, «\u00a0Qui es-tu\u00a0?\u00a0» compris (la médiane). Tendance\u00a0: la part des paywalls de la moitié qui ont montré ce titre. Une suite est incomplète quand un lot gardé a été refusé ou illisible, perdue quand ses écrans ont été effacés avant le paiement (payé plus de 11\u00a0jours après le paywall). Coupées\u00a0: les vidéos dont la règle a gardé des lots pour après le paiement (les autres ont tout lu avant l’achat). Titre changé par la suite\u00a0: parmi les suites lues, les convs entières qui auraient montré un autre titre que celui vu au paywall.",
    repere:
      "Pour passer de «\u00a0mesure\u00a0» à «\u00a0ab\u00a0» sur toutes les vidéos, il faut environ 150\u00a0vidéos mesurées (3\u00a0semaines), avec\u00a0: assez au premier tour pour 70\u00a0% au moins, des tendances perdues pour 1 à 2\u00a0% au plus (aucune sur 150), un autre titre ou une date décalée pour moins de 5\u00a0%, des «\u00a0tout\u00a0» pour moins de 30\u00a0%, et un bilan en euros positif (l’IA épargnable, moins environ 1,80\u00a0€ de marge par tendance perdue). Dans l’A/B, le coût se lit en une semaine\u00a0: la moitié partielle doit coûter bien moins avant l’achat, pour un coût par acheteur proche. La part qui paie demande des milliers de vidéos pour un écart net\u00a0: garde-fou, si la partielle paie moins de la moitié de l’entière après 100\u00a0vidéos chacune, coupe.",
    siCaBouge:
      "Si des tendances se perdent ou des dates se décalent, ou si la suite change des titres, la règle s’arrête trop tôt\u00a0: lis plus avant l’achat (un premier tour de deux lots). Si les «\u00a0tout\u00a0» pour le sens douteux grimpent, c’est la vidéo que le navigateur juge mal filmée\u00a0; pour trop peu de messages, des écrans illisibles. Si des suites se perdent, des gens paient plus de 11\u00a0jours après le paywall\u00a0: garde-les plus longtemps. Pour tout couper\u00a0: BLUSH_LECTURE_PARTIELLE à «\u00a00\u00a0», les suites qui attendent se lisent quand même au paiement.",
  },
  parLongueur: {
    titre: "Par longueur",
    de: "les convs payées par longueur",
    quoi: "Combien de convs payées sont très longues (3\u202f000\u00a0messages ou plus), ce qu’elles achètent et ce que coûte vraiment leur IA, avant l’achat et pour leur lecture\u00a0: ce qu’il faut savoir avant de réserver ces convs à Premium.",
    calcul:
      "Les achats qui débloquent une conv sur la période, des vrais clients seulement (ceux de l’équipe, du tournage et des invités retirés, comme toutes les ventes), même remboursés depuis\u00a0: le rapport, Premium, ① et ⑥ payés sur la période, ⑤ utilisé sur la période (le jour où il débloque sa conv). Chacun se range par le nombre de messages de sa conv (stories.message_count)\u00a0: tous les messages reçus, pas ce que lit le modèle. C’est le total de l’import (après la coupe du navigateur pour un export trop lourd), recompté quand un morceau s’ajoute avant «\u00a0Qui es-tu\u00a0?\u00a0» ou quand la suite d’une vidéo est lue après le paiement, jamais plafonné\u00a0; le modèle, lui, lit au plus 500\u202f000\u00a0caractères (environ 7\u202f000\u00a0messages\u00a0: le début et surtout la fin). IA d’une lecture\u00a0: la médiane, conv par conv, de ses appels du produit au verdict (ses essais et ses verdicts refaits compris), au rapport (son plan, ses chapitres), à la création de la mémoire, au script du vocal et à la suite d’une longue vidéo (lue après le paiement), sur les convs dont la lecture a déjà coûté. La voix du vocal n’y est pas\u00a0: son étiquette est aussi celle des vocaux du chat (environ 0,09\u00a0$ de plus par lecture). IA avant l’achat\u00a0: la médiane, conv par conv, des appels du produit qui ont lu son import (des captures, les lots d’une vidéo, ses morceaux ajoutés avant «\u00a0Qui es-tu\u00a0?\u00a0» compris\u00a0; rien pour un export), sur les convs dont l’import est mesuré (depuis le 26\u00a0octobre 2026\u00a0: avant, ces lectures n’étaient pas rangées sous leur conv). Les captures envoyées au chat après n’y sont pas\u00a0: les bulles les paient. Les deux\u00a0: la médiane, conv par conv, de l’avant et de la lecture réunis (pas la somme des deux médianes), sur les convs lues dont l’import est mesuré\u00a0: tout ce qu’a coûté l’IA d’une vente, hors du chat. Jetons par message\u00a0: tout ce qu’ont lu les verdicts (l’entrée, le cache écrit et le cache lu), moins le socle du système (environ 15\u202f300\u00a0jetons), divisé par les messages de leur conv, seulement pour les verdicts d’après le 22\u00a0octobre 2026 à 22\u00a0h\u00a010 (le montage partagé\u00a0: le montage d’un appel n’est pas noté, et le système du verdict n’était pas le même avant). Sa consigne y reste (quelques jetons par message de trop sur une conv courte), et au-delà de 7\u202f000\u00a0messages, la conv coupée fait baisser le chiffre. Verdicts par conv\u00a0: ses lignes de verdict divisées par les convs\u00a0; «\u00a0à plusieurs\u00a0», les convs aux nouveaux essais ou au verdict refait. Payés plus de 48\u00a0h après\u00a0: l’achat (pour ⑤, son utilisation) plus de 48\u00a0h après l’arrivée de la conv au paywall, c’est-à-dire la tâche de son verdict, posée à «\u00a0Qui es-tu\u00a0?\u00a0» au moment où le titre du haut du paywall se compte\u00a0; sans elle, depuis l’import. Une conv effacée depuis n’a plus ni longueur ni paywall\u00a0: ses achats se comptent à part. Par modèle et les plus chers\u00a0: les lignes de verdict de ces mêmes convs, en nombres seulement.",
    repere: `Une conv très longue, c’est 3\u202f000\u00a0messages ou plus (environ 100\u202f000\u00a0jetons). Si moins d’un quart des ventes en sont, les réserver à Premium touche peu d’acheteurs\u00a0; si c’est la plupart, c’est le prix du rapport qui change. Environ 33\u00a0jetons par message en conv compacte\u00a0: bien plus, les vraies convs sont plus denses que celles des tests. Le rapport à ${prixDe("rapport")} garde ${CIBLE_DE_MARGE}\u00a0% de marge tant que tout ce qu’a coûté sa vente (l’IA avant l’achat, puis sa lecture) et la moitié de ses bulles coûtent moins d’environ 1,92\u00a0$. Un taux se lit à partir de 30\u00a0achats.`,
    siCaBouge: `Si l’IA médiane des deux réunis (la colonne «\u00a0Les deux\u00a0»\u00a0: avant l’achat et la lecture, pas la lecture seule) dépasse environ 1,80\u00a0$ dans une tranche (1,92\u00a0$ moins la moitié de ses bulles), le rapport à ${prixDe("rapport")} y passe sous ${CIBLE_DE_MARGE}\u00a0% de marge. Des verdicts à plusieurs lignes ou un modèle de repli plus cher\u00a0: regarde les refus et les échecs du verdict (la santé). Beaucoup d’achats plus de 48\u00a0h après le paywall\u00a0: les relances vendent, et la garde des écrans d’une vidéo (11\u00a0jours) doit rester.`,
  },
  sante: {
    titre: "Santé",
    de: "la santé",
    quoi: "Ce qui coince côté technique\u00a0: l’IA qui échoue, une tâche bloquée, un paiement refusé, une route ou une page qui plante.",
    calcul:
      "Les tâches passées en échec sur la période (avec leurs codes), celles bloquées en ce moment, les paiements refusés sur la période, les réponses de BLUSH sorties en alerte (danger, détresse ou mineur), comptées depuis le 21\u00a0octobre 2026, et les pannes du serveur\u00a0: une route /api qui répond «\u00a0panne\u00a0» ou une page qui plante, comptées par route ou par page et par jour (sur 24\u00a0h, celles d’aujourd’hui). Un paiement resté en attente n’y est pas\u00a0: c’est surtout un panier abandonné. Une personne qui quitte une page avant la fin de son chargement n’est pas une panne.",
    repere:
      "Vert\u00a0: rien à faire. La carte passe en orange dès qu’un chiffre bouge. La première panne du jour d’une route ou d’une page part aussi par mail à l’équipe (le nom et le code de l’erreur, jamais son message)\u00a0; les suivantes ne se voient qu’ici.",
    siCaBouge:
      "Une tâche bloquée se relance seule au prochain passage\u00a0; si elle reste, regarde le journal du serveur. Des paiements refusés en série\u00a0: regarde Whop. Des pannes sur une même route après une mise en production\u00a0: cherche «\u00a0route /api en panne\u00a0» ou «\u00a0requête en erreur\u00a0» dans les logs de Vercel, et reviens au déploiement d’avant si elle touche tout le monde.",
  },
  carte: {
    titre: "Où ils sont",
    de: "la carte",
    quoi: "Les villes d’où se connectent les personnes en ligne.",
    calcul:
      "La ville et ses coordonnées viennent de l’hébergeur, d’après la connexion, à la ville près. L’adresse IP n’est jamais gardée. Une ville hors de la carte (France, Belgique, Suisse) passe dans «\u00a0Hors carte\u00a0».",
    repere: "Une bulle grossit avec le nombre de personnes\u00a0; son nom s’écrit à partir de deux.",
    siCaBouge: "Une ville qui s’allume d’un coup\u00a0: une créatrice de là-bas vient de publier.",
  },
} as const satisfies Record<string, AideDuPilotage>;

export type CleDAide = keyof typeof AIDES_DU_PILOTAGE;
