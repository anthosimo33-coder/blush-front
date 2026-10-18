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
    quoi: "Ce que les gens ont vraiment payé sur la période, une fois les remboursements et les contestations retirés.",
    calcul:
      "Les achats payés sur la période (même remboursés depuis), moins ceux remboursés et ceux contestés sur la période. En TTC\u00a0: le prix payé, figé à la commande. Whop reverse ensuite la TVA et garde ses frais. Les colonnes montrent le payé de chaque heure (sur 24\u00a0h) ou de chaque jour de Paris, remboursements non retirés.",
    repere: "La flèche compare à la période d’avant, de même durée. La colonne rose est celle en cours\u00a0: elle n’est pas finie.",
    siCaBouge: "S’il baisse alors que les visiteurs montent, le problème est après l’arrivée\u00a0: regarde le tunnel. S’il baisse avec les visiteurs, c’est la distribution.",
  },
  live: {
    titre: "En direct",
    de: "le direct",
    quoi: "Les personnes sur le site en ce moment, l’écran où elles sont, d’où elles arrivent et la ville d’où elles se connectent.",
    calcul:
      "Chaque onglet ouvert et visible fait signe toutes les 40\u00a0secondes\u00a0; il compte en ligne s’il a fait signe dans la dernière minute et demie. La ville vient de la connexion, à la ville près\u00a0: l’adresse IP n’est jamais gardée, et ni compte, ni conv, ni nom n’apparaît. Les outils de l’équipe (/admin, /apercu) ne comptent pas.",
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
      "Les comptes qui ont payé au moins un achat sur la période, divisés par les visiteurs de la même période. Un compte qui achète deux fois compte une fois\u00a0; un visiteur revenu deux jours compte deux fois\u00a0: le taux est plutôt prudent.",
    repere: "Entre 2 et 4\u00a0% est bon pour un achat sous 15\u00a0€ venu des réseaux.",
    siCaBouge: "S’il baisse, regarde quelle étape du tunnel a lâché, puis quelle source a changé.",
  },
  panier: {
    titre: "Revenu par acheteur",
    de: "le revenu par acheteur",
    quoi: "Ce qu’un acheteur dépense en moyenne sur la période, recharges de bulles comprises.",
    calcul: "Le payé TTC de la période (remboursements non retirés), divisé par les comptes qui ont payé au moins un achat.",
    repere: "Au-dessus de 13,90\u00a0€, Premium et les recharges font leur travail. Le plafond naturel est autour de 19\u00a0€.",
    siCaBouge: "S’il baisse\u00a0: Premium est moins choisi sur la feuille du paiement, ou les coups de pouce ne se montrent plus.",
  },
  marge: {
    titre: "Marge après IA",
    de: "la marge après IA",
    quoi: "Ce qu’il reste du chiffre d’affaires hors taxes une fois l’IA payée.",
    calcul:
      "(Chiffre d’affaires net hors taxes − ce qu’a coûté l’IA, en euros) ÷ chiffre d’affaires net hors taxes. La TVA retirée est celle de la France (20\u00a0%), le dollar compté à son cours du 11 octobre. Hors frais Whop et hors créatrices\u00a0: c’est une estimation.",
    repere: `La cible\u00a0: ${CIBLE_DE_MARGE}\u00a0% ou plus. En dessous, la carte passe en orange.`,
    siCaBouge: "Si elle baisse\u00a0: le chat coûte trop par réponse, ou des bulles offertes partent en réponses. Regarde ce que coûte l’IA, poste par poste.",
  },
  tunnel: {
    titre: "Le tunnel",
    de: "le tunnel",
    quoi: "Où les gens s’arrêtent, de l’arrivée sur le site au deuxième achat.",
    calcul:
      "Les visiteurs de la période, les convs importées sur la période, celles d’entre elles qui ont leur verdict, les comptes qui ont payé sur la période, et ceux d’entre eux qui ont payé au moins deux achats (depuis toujours). Le pourcentage du haut se fait sur l’étape d’avant.",
    repere: "La colonne orange est la plus grosse fuite, entre l’arrivée et l’achat\u00a0: c’est là qu’un changement rapporte le plus.",
    siCaBouge: "Change une seule chose à la fois, et compare avec la période d’après.",
  },
  import: {
    titre: "L’import, écran par écran",
    de: "l’import, écran par écran",
    quoi: "Où les visiteurs lâchent entre l’arrivée et la lecture lancée\u00a0: le choix de l’appli, le tuto de l’export, le fichier, «\u00a0Qui es-tu\u00a0?\u00a0», l’email et son code.",
    calcul:
      "Chaque étape compte les personnes qui l’ont passée sur la période, une fois par jour, par la même empreinte sans cookie que les visiteurs (src/lib/jalons.ts). «\u00a0Conv bien reçue\u00a0»\u00a0: l’envoi a marché. «\u00a0Envois ratés\u00a0»\u00a0: un fichier illisible, une conv trop courte ou de groupe, le réseau. Le pourcentage se fait sur l’étape d’avant.",
    repere:
      "La ligne orange est la plus grosse perte. Un compte déjà connecté passe de «\u00a0Qui es-tu\u00a0?\u00a0» à la lecture sans email ni code\u00a0: ces deux étapes peuvent compter moins que la suivante. Un taux se lit à partir de 30\u00a0personnes.",
    siCaBouge:
      "Beaucoup choisissent leur appli mais pas de fichier\u00a0: le tuto de l’export est trop dur, revois sa vidéo. Beaucoup demandent un code sans le valider\u00a0: le mail arrive mal (les spams, le délai).",
  },
  paywall: {
    titre: "Le paywall, jusqu’au paiement",
    de: "le paywall, jusqu’au paiement",
    quoi: "Ce qui se passe entre l’arrivée au paywall et le paiement\u00a0: jusqu’où l’on descend, la formule touchée, le bouton qui paie, le formulaire de Whop et ce qu’il devient.",
    calcul:
      "Les personnes qui ont passé chaque étape sur la période, une fois par jour (la même empreinte que les visiteurs). «\u00a0Voient le formulaire de Whop\u00a0»\u00a0: la carte de Whop affichée, ou Apple Pay ouvert. «\u00a0Refermé sans payer\u00a0»\u00a0: la feuille de la carte refermée, ou Apple Pay annulé. Seul le paywall d’avant la lecture compte ici, ni la feuille du rapport, ni les recharges, ni l’offre ①.",
    repere:
      "Plus de feuilles de carte ouvertes que de formulaires affichés\u00a0: la carte de Whop charge mal. «\u00a0Premium au bouton\u00a0» se compare à «\u00a0Ce qui se vend\u00a0». Un taux se lit à partir de 30\u00a0personnes.",
    siCaBouge:
      "Peu de monde descend jusqu’aux avis\u00a0: remonte une preuve. Beaucoup voient le formulaire sans envoyer\u00a0: le prix ou la confiance coince au dernier moment. Beaucoup de refus\u00a0: regarde Whop.",
  },
  hauts: {
    titre: "Le haut du paywall",
    de: "le haut du paywall",
    quoi: "Le titre que chaque conv voit en haut de son paywall, parmi cinq (la tendance, tout vient de toi, tout vient de l’autre, le contraste, l’égalité), et combien de rapports se débloquent après chacun.",
    calcul:
      "Le code choisit le titre d’après les chiffres de la conv, sans le modèle (src/contenu/haut-du-paywall.ts). «\u00a0Vus\u00a0»\u00a0: les convs arrivées au paywall avec ce titre, comptées le jour de leur arrivée. «\u00a0Payés\u00a0»\u00a0: les rapports de ces convs débloqués (payés, ou par un rapport d’avance), comptés le jour du paiement. Le titre d’une conv reste chiffré avec elle\u00a0: ici, seulement des comptes par jour.",
    repere:
      "Compare les taux d’un titre à l’autre, pas les nombres de vus\u00a0: chaque titre va à des convs différentes. Un taux se lit à partir de 30\u00a0vus. Un payé peut venir d’un vu de la période d’avant.",
    siCaBouge:
      "Un titre qui paie nettement moins que les autres\u00a0: réécris-le, ou change sa place dans la règle. Beaucoup de «\u00a0Sans assez de chiffres\u00a0»\u00a0: les convs arrivent trop courtes.",
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
    quoi: "Le canal par lequel les visiteurs arrivent, et ce que ses acheteurs ont payé.",
    calcul:
      "Le lien d’une créatrice (utm_source), sinon un verdict partagé, sinon le site d’avant, sinon l’appli qui a ouvert le lien, sinon «\u00a0Direct\u00a0». Les acheteurs se rangent d’après le canal de leur compte\u00a0; «\u00a0Avant le suivi\u00a0»\u00a0: des comptes venus avant qu’on compte les visites.",
    repere: "Juge un canal sur son taux d’achat et ce qu’il rapporte, jamais sur ses visiteurs seuls. Le «\u00a0meilleur taux\u00a0» ne se donne qu’à partir de 30\u00a0visiteurs.",
    siCaBouge: "Mets plus de vidéos sur le canal qui achète le mieux, et retravaille l’accroche de celui qui achète le moins.",
  },
  mix: {
    titre: "Ce qui se vend",
    de: "ce qui se vend",
    quoi: "Le payé de la période, par offre.",
    calcul: "Les achats payés sur la période, TTC, remboursements non retirés. «\u00a0Bulles\u00a0» réunit les packs et les 80 bulles en plus après le rapport.",
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
    quoi: "Ce que coûtent les appels au modèle (écrire, lire, répondre) sur la période.",
    calcul:
      "La somme de chaque appel, en dollars comme sur la facture, rangée par poste. Par acheteur\u00a0: le total divisé par les comptes qui ont payé. Le budget du jour (fixé côté serveur) coupe les appels une fois atteint\u00a0; l’équipe est prévenue à 50 et 80\u00a0%.",
    repere: `Par acheteur, sous 3\u00a0$ pour tenir ${CIBLE_DE_MARGE}\u00a0% de marge.`,
    siCaBouge: "Si le chat grimpe\u00a0: vérifie la mémoire et la longueur des réponses de BLUSH.",
  },
  sante: {
    titre: "Santé",
    de: "la santé",
    quoi: "Ce qui coince côté technique\u00a0: l’IA qui échoue, une tâche bloquée, un paiement refusé, une route ou une page qui plante.",
    calcul:
      "Les tâches passées en échec sur la période (avec leurs codes), celles bloquées en ce moment, les paiements refusés sur la période, les réponses de BLUSH sorties en alerte danger (leurs bulles rendues), et les pannes du serveur\u00a0: une route /api qui répond «\u00a0panne\u00a0» ou une page qui plante, comptées par route ou par page et par jour (sur 24\u00a0h, celles d’aujourd’hui). Un paiement resté en attente n’y est pas\u00a0: c’est surtout un panier abandonné. Une personne qui quitte une page avant la fin de son chargement n’est pas une panne.",
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
