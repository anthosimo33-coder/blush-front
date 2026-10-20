import "server-only";
import { eq, sql } from "drizzle-orm";
import { empreinte } from "./chiffrement";
import { db, schema, uneLigne } from "./db";
import { env } from "./env";

/**
 * Les limites anti-abus : combien de fois, sur quelle fenêtre. Celles « par compte » se rangent sur son email canonique
 * (sousLaLimiteDuCompte, src/server/requete.ts), celles « par IP » sur son adresse, IPv6 regroupée par /64
 * (sousLaLimiteDeLIp) : deux familles de clés qui ne se croisent jamais (« analyse:compte:… », « analyse:ip:… »).
 * Ce qu’aucune ne borne : un script qui change d’adresse IP à volonté (des /64 en IPv6, un réseau de proxys) et
 * d’email, pour ouvrir des comptes à la chaîne et leurs lectures offertes (S-04), demander les codes d’une personne (S-08)
 * ou épuiser le plafond des mails de code pour tous (S-09). Le CAPTCHA (src/server/captcha.ts) y répond : la demande de
 * code, l’import et les captures sans compte passent d’abord par lui, avant toute limite comptée. Il ne fait que rendre
 * chaque essai plus cher (un humain, ou un service payant qui en résout) : les limites restent la borne.
 */
export const LIMITES = {
  /** Les codes de connexion demandés depuis une adresse IP, quel que soit l’email. */
  codeParIp: { max: 100, fenetreS: 3600 },
  /**
   * Les codes demandés pour un email (canonique : src/server/email-canonique.ts) depuis une même adresse IP, par jour. Égal
   * au plafond de l’email depuis la réserve des codes (plus bas) : il garde une adresse sous ce plafond si on le relève.
   */
  codeParEmailEtIp: { max: 7, fenetreS: 86400 },
  /** Les codes demandés pour un email (canonique), par jour, d’où qu’ils viennent (10 avant la réserve). */
  codeParEmail: { max: 7, fenetreS: 86400 },
  /*
   * La réserve des codes (S-08). N’importe qui peut demander les codes d’un email : un tiers qui remplit codeParEmail
   * ne doit pas priver la personne de code. Au-delà des deux plafonds du dessus, chaque adresse IP a encore `max` code de
   * réserve pour l’email (codeReserveParEmailEtIp), jusqu’à `max` pour l’email en tout (codeReserveParEmail). Rien ne
   * distingue le navigateur d’un tiers de celui de la personne (un cookie s’efface) : la réserve se compte par adresse.
   * Pour priver la personne de code partout, un tiers doit donc écrire depuis au moins cinq adresses (des /64 en IPv6) au
   * lieu d’une : plus cher, pas impossible, d’où le CAPTCHA prévu avant l’ouverture publique. Les codes du jour, réserve
   * comprise, donnent au plus echecsCodeParEmail essais (cinq chacun) : ce qui se devine ne grandit pas, et les essais
   * ratés d’un tiers ne ferment pas la porte avant ses codes (tests/unit/limites.test.ts).
   */
  codeReserveParEmailEtIp: { max: 1, fenetreS: 86400 },
  codeReserveParEmail: { max: 5, fenetreS: 86400 },
  /* Les mails de code, pour tous et par jour : plafondsDesMails, plus bas (ils suivent le quota du prestataire) */
  verificationParIp: { max: 150, fenetreS: 3600 },
  /*
   * Les essais de code ratés (S-07, S-08), par jour : un nouveau code ne remet aucun de ces comptes à zéro, un bon code
   * rend son essai à chacun. Ils se comptent à trois endroits : le navigateur qui tape (echecsCodeParNavigateur), son
   * adresse IP (echecsCodeParEmailEtIp) et l’email (echecsCodeParEmail), la borne de tout ce qui se devine en un jour.
   * Un tiers qui rate exprès les codes d’une personne n’épuise que les essais de son navigateur : il lui faudrait les
   * soixante de l’email, soit tous les codes du jour, réserve comprise, pour l’arrêter elle aussi.
   */
  /**
   * Les essais ratés d’un navigateur pour un email (canonique) : deux codes entiers (cinq essais chacun). Au-delà, ce
   * navigateur n’a plus d’essai aujourd’hui pour cet email ; les autres gardent les leurs.
   */
  echecsCodeParNavigateur: { max: 10, fenetreS: 86400 },
  /**
   * Les essais ratés pour un email depuis une même adresse IP. Au-delà, un navigateur de cette adresse qui en a déjà raté
   * `reserveNavigateur` n’essaie plus (cinq au lieu de dix) ; un autre garde sa réserve, celle de la personne sur le même
   * Wi-Fi que le tiers. Elle ne ralentit pas un tiers qui change de navigateur (un cookie s’efface) : ce sont
   * codeParEmailEtIp et les plafonds de l’email qui le bornent.
   */
  echecsCodeParEmailEtIp: { max: 20, fenetreS: 86400, reserveNavigateur: 5 },
  /**
   * Les essais ratés pour un email (canonique), d’où qu’ils viennent : au-delà, plus personne n’essaie pour lui
   * aujourd’hui. Un code sur un million par essai : 60 essais, c’est une chance sur plus de 16 000 de deviner un code dans
   * la journée. Les codes du jour, réserve comprise (douze, cinq essais chacun), n’en donnent pas plus dans une fenêtre :
   * seule une fenêtre des essais à cheval sur deux fenêtres des codes (elles ne commencent pas à la même heure) peut aller
   * au-delà, et c’est elle qui l’arrête. Une défense en profondeur (20 par jour avant).
   */
  echecsCodeParEmail: { max: 60, fenetreS: 86400 },
  importParIp: { max: 100, fenetreS: 3600 },
  /*
   * Le budget d’octets des imports (S-02), en Ko (le compte de rate_limits est un entier de 32 bits) : la taille du
   * fichier reçu, comptée avant de le lire (src/app/api/import, octetsDansLeBudget de src/server/requete.ts). Un brouillon
   * reste en base jusqu’à environ 48 h (la purge passe une fois par nuit, et efface ceux de plus d’un jour) : sans ce
   * budget, des imports à la chaîne (100 par heure et par adresse, de 4,5 Mo chacun) rempliraient la base de Neon sans
   * rien payer. Par adresse IP (24 h), de quoi importer trois des plus gros exports par jour, des dizaines d’ordinaires ;
   * un fichier illisible y compte aussi. Pour tous, par jour de Paris (la clé porte le jour ; sa fenêtre ne fait que la
   * garder jusqu’au lendemain), seuls les imports devenus brouillons : dix adresses au moins pour le remplir. Prévenu à
   * `alerteA` (80 %), puis quand il refuse : tout le monde voit alors « trop_jour » à l’import, jusqu’à minuit.
   * Relevés pour l’ouverture (13 octobre, Neon payant) : 75 000 Ko par adresse (le NAT d’un opérateur mobile met des
   * centaines de personnes derrière une adresse) et 1 500 000 Ko pour tous, par jour ; la base garde environ deux fois
   * koBrouillonsParJour (deux nuits de brouillons), payés au Go chez Neon.
   */
  koImportParIp: { max: 75_000, fenetreS: 86400 },
  koBrouillonsParJour: { max: 1_500_000, fenetreS: 2 * 86400, alerteA: 0.8 },
  /** Les réponses de BLUSH pour un compte, par jour : larges, ce sont les bulles qui comptent ce qu’on paie. */
  chatParCompte: { max: 500, fenetreS: 86400 },
  /**
   * Les vocaux envoyés au chat (S-15), par jour : chacun est transcrit, à la durée. Un message du chat les compte aussi
   * (chatParCompte).
   */
  vocalParCompte: { max: 100, fenetreS: 86400 },
  /**
   * Les secondes de son transcrites pour un compte, par jour : la durée mesurée, ou celle que le prestataire dit avoir
   * facturée si elle est plus longue (src/server/ia/transcription.ts) : une heure et demie de vocaux.
   */
  secondesVocalParCompte: { max: 5400, fenetreS: 86400 },
  /**
   * Les caractères que la voix dit pour un compte (S-13), par jour : ses réponses du chat en vocal et le vocal de son
   * rapport, environ 20 minutes de voix. Au-delà, BLUSH répond par écrit (src/server/ia/voix.ts).
   */
  voixParCompte: { max: 20_000, fenetreS: 86400 },
  /** Les nouvelles convs lues (un verdict, puis un rapport et une mémoire : environ 1 $ chacune). */
  analyseParCompte: { max: 5, fenetreS: 86400 },
  /**
   * Les prises du mode tournage (src/server/tournage.ts), par jour : sans modèle, mais chacune recopie une lecture
   * entière, vocal compris. Large, pour une créatrice qui refait ses prises.
   */
  tournageParCompte: { max: 40, fenetreS: 86400 },
  /**
   * Les convs de tournage préparées par l’API (POST /api/admin/tournage), pour tous et par jour : chacune est une vraie
   * lecture (environ 1 $). De quoi préparer les liens de quatre créatrices d’un coup ; une boucle de l’outil s’arrête là.
   */
  tournageApiParJour: { max: 40, fenetreS: 86400 },
  /**
   * Les clients que Claude enregistre pour lire /admin (POST /api/oauth/enregistrement, src/server/mcp/acces.ts), pour
   * tous et par heure : un par connexion de l’équipe suffit, une boucle d’enregistrements s’arrête là.
   */
  mcpEnregistrementsParHeure: { max: 50, fenetreS: 3600 },
  /** Les échanges et rafraîchissements de jetons du serveur MCP (POST /api/oauth/jeton), par adresse IP et par heure. */
  mcpJetonParIp: { max: 120, fenetreS: 3600 },
  /**
   * Les mêmes lectures depuis une adresse IP, tous comptes confondus : ouvrir des comptes à la chaîne d’une même box ne
   * multiplie pas les verdicts. Large, pour un Wi-Fi partagé ou le NAT d’un opérateur (relevé pour l’ouverture, le
   * CAPTCHA arrête les robots).
   */
  analyseParIp: { max: 100, fenetreS: 86400 },
  /** Les moments d’écoute du vocal notés pour l’A/B test des voix. */
  ecouteParCompte: { max: 200, fenetreS: 86400 },
  /**
   * « Relancer » une lecture ou l’écriture d’un rapport en échec, par jour (un rapport coûte environ 1 $). Large : un échec
   * vient le plus souvent de notre côté (le prestataire d’IA en panne, son crédit épuisé, une clé changée), et la personne
   * ne doit pas buter dessus ; le budget de l’IA par compte (BUDGET_IA.compte) tient la facture.
   */
  relanceParCompte: { max: 20, fenetreS: 86400 },
  /**
   * Les mails des séquences (src/server/sequences.ts), pour tous, par 24 h : un garde-fou contre un envoi anormal (un
   * bug qui écrirait à toute la base d’un coup), pas un plafond de tous les jours (décidé le 17 octobre : 300). Atteint,
   * l’équipe est prévenue. À relever quand le volume normal s’en approche.
   */
  sequencesParJour: { max: 300, fenetreS: 86400 },
  /**
   * Les alertes par mail à l’équipe (S-19), par jour : les `reserveImportantes` dernières sont gardées pour les alertes
   * importantes (le budget de l’IA, l’échec d’une lecture ou d’un rapport) : une alerte ordinaire s’arrête avant. Elles
   * partent aussi dans le quota des mails (plafondsDesMails : chaque destinataire compte), qui les arrête avant les rapports.
   * À revoir à l’usage.
   */
  alertesParJour: { max: 30, fenetreS: 86400, reserveImportantes: 10 },
  /** Les alertes d’un même sujet (« rapport_chapitres en échec », « repli sur un autre modèle »), par jour ; à revoir à l’usage. */
  alertesParSujet: { max: 5, fenetreS: 86400 },
  /** Les inscriptions à la liste d’attente. */
  attenteParIp: { max: 50, fenetreS: 3600 },
  /** Les mails de la liste d’attente à un même email (l’inscription peut venir de n’importe qui : pas de rafale chez lui). */
  mailAttenteParEmail: { max: 3, fenetreS: 86400 },
  /** Les images « Partager en image » (une réponse du chat, la chute d’un chapitre) et le rapport en PDF, dessinés à la demande. */
  imageParCompte: { max: 60, fenetreS: 86400 },
  /**
   * Les lots d’images d’un enregistrement d’écran, chacun lu par le modèle : des lots de six écrans (douze avant),
   * jusqu’à trente-deux pour un long enregistrement (seize avant le 20 octobre). Les plafonds des lots ont doublé à
   * chaque fois : autant d’enregistrements qu’avant (un Wi-Fi partagé ou le NAT d’un opérateur en font passer
   * plusieurs), pour à peu près la même dépense (un lot lu par Sonnet coûte moitié moins qu’avec Opus).
   */
  lotParIp: { max: 1200, fenetreS: 3600 },
  /** Des captures ou un export envoyés après l’import (dans le chat ou pour sa fiche) : les lire coûte plus qu’un message. */
  ajoutParCompte: { max: 40, fenetreS: 86400 },
  /**
   * Bêta ouverte : les lectures de captures et de lots par des visiteurs sans compte, pour tous et par jour. Chacune fait
   * travailler le modèle payant avant l’email : changer d’adresse IP ne doit pas faire grimper la facture sans fin.
   * Relevés pour l’ouverture (13 octobre) : le CAPTCHA arrête les robots, et la part sans compte du budget de l’IA
   * (BUDGET_IA.anonyme) tient la facture.
   */
  capturesAnonymesParJour: { max: 1000, fenetreS: 86400 },
  lotsAnonymesParJour: { max: 16000, fenetreS: 86400 },
  /** Les mêmes lectures pour un compte connecté, par jour (un compte gratuit suffirait sinon à passer outre le plafond). */
  capturesParCompte: { max: 30, fenetreS: 86400 },
  lotsParCompte: { max: 600, fenetreS: 86400 },
  /** Les corrections de sa fiche : chacune réécrit la mémoire, que le chat envoie ensuite au modèle à chaque message. */
  ficheParCompte: { max: 60, fenetreS: 86400 },
  /**
   * Les paiements commencés par un compte (POST /api/paiement), par heure : chacun écrit un achat et crée une
   * configuration de paiement chez Whop (600 appels par minute au plus, pour tout BLUSH).
   */
  commandeParCompte: { max: 20, fenetreS: 3600 },
  /** Les vérifications d’un paiement chez Whop, par achat (la page du retour, quand le webhook tarde) : elle repasse chaque seconde. */
  verificationParAchat: { max: 20, fenetreS: 600 },
  /**
   * Les mêmes vérifications chez Whop, pour tous les achats d’un compte, par heure : sans elle, un compte qui multiplie
   * les commandes ferait tirer des milliers d’appels par heure avec notre clé, jusqu’au plafond de Whop pour tout BLUSH
   * (600 par minute), et plus personne ne pourrait payer (SECA-1). Une page du retour en use une vingtaine au plus.
   */
  verificationParCompte: { max: 120, fenetreS: 3600 },
  /**
   * Les jetons du CAPTCHA échangés contre un laissez-passer (/api/captcha), par adresse IP : un par import sans compte,
   * comptés à l’entrée (une rafale de faux jetons ne fait pas appeler Cloudflare sans fin).
   */
  captchaParIp: { max: 300, fenetreS: 3600 },
  /*
   * Ce qu’un laissez-passer du CAPTCHA permet (src/server/captcha.ts), pendant ses 20 minutes : un import, un envoi de
   * captures ou la fin d’un enregistrement (et un nouvel essai après une coupure du réseau), et les lots d’un
   * enregistrement (trente-deux au plus pour un long, quarante pour le serveur, chacun avec son nouvel essai).
   */
  laissezPasserBrouillons: { max: 2, fenetreS: 20 * 60 },
  laissezPasserLots: { max: 160, fenetreS: 20 * 60 },
  /** Les erreurs qu’un navigateur remonte (POST /api/navigateur/erreur), par adresse IP : une page qui boucle sur une erreur n’inonde pas la base. */
  erreurNavigateurParIp: { max: 30, fenetreS: 3600 },
  /** Les envois de mesures de vitesse (POST /api/navigateur/mesures, un par page quittée), par adresse IP. */
  mesuresParIp: { max: 120, fenetreS: 3600 },
  /** Les alertes d’une erreur de navigateur jamais vue du jour, pour tous et par jour : les suivantes ne se lisent que dans /admin. */
  alertesNavigateurParJour: { max: 10, fenetreS: 86400 },
  /** L’alerte d’un seuil de délivrabilité franchi (src/server/delivrabilite.ts) : une par jour au plus, le détail est dans /admin. */
  alertesDelivrabiliteParJour: { max: 1, fenetreS: 86400 },
} as const;

/*
 * Le quota du prestataire de mails (S-09), par jour : BLUSH_MAILS_PAR_JOUR (100 par défaut, son plan gratuit), chaque
 * destinataire compté. Tous les plafonds des mails en découlent, dans les mêmes proportions qu’à 100 (plafondsDesMails) :
 * relever le quota avec un plan payant les relève tous.
 * - Les codes ont leur part (`codes`, 60 % : 60 sur 100).
 * - Tous les autres mails qui partent avec RESEND_API_KEY (« ton rapport est prêt », les alertes de l’équipe, la liste
 *   d’attente) se comptent ensemble sur ce qui reste (partDesAutresMails : 40, ou les 100 quand les codes ont leur clé,
 *   RESEND_API_KEY_CODES), et les moins nécessaires s’arrêtent les premiers : chaque sorte de mail laisse `laisse[sorte]`
 *   mails de cette part aux suivantes. La liste d’attente en laisse 20 %, les alertes 10 % (les rapports les ont
 *   toujours), les rapports aucun : au pire, « ton rapport est prêt » ne part pas, et le rapport attend dans l’appli
 *   (src/server/email.ts, envoyerMail).
 * - Tous les mails de la liste d’attente (`attente`, 20 %) : n’importe qui peut en déclencher, ils ne doivent épuiser ni
 *   le quota des codes, ni la part des rapports et des alertes (qui les arrête aussi les premiers). Au-delà, on inscrit
 *   sans écrire. Les invitations de l’équipe (/admin) partent dans la même part. Sans la boîte des tests de bout en bout,
 *   dont les mails ne partent pas (comme les codes).
 * - Les relances (`relances`, 20 %, le mail « Ton rapport t’attend », src/server/relances.ts) : aussi peu nécessaires que la
 *   liste d’attente, elles laissent comme elle 20 % de la part des autres mails. Au-delà, elles attendent le lendemain.
 * tests/unit/limites.test.ts y veille, au défaut comme relevé. Les fenêtres des compteurs ne commencent pas à minuit
 * comme le jour du prestataire : un jour du prestataire peut en voir deux, d’où la marge.
 */
const PARTS_DES_MAILS = { codes: 0.6, attente: 0.2, relances: 0.2, laisse: { attente: 0.2, relance: 0.2, alerte: 0.1, rapport: 0 } } as const;

/** Ce qu’est un mail pour le quota : du plus nécessaire (le rapport) aux moins nécessaires (la liste d’attente, les relances). */
export type SorteDeMail = keyof typeof PARTS_DES_MAILS.laisse;

/** Les plafonds des mails du jour, tirés du quota du prestataire (`parJour` : BLUSH_MAILS_PAR_JOUR, voir plus haut). */
export function plafondsDesMails(parJour = env().BLUSH_MAILS_PAR_JOUR) {
  const part = (p: number) => Math.floor(parJour * p);
  const { laisse } = PARTS_DES_MAILS;
  return {
    parJour,
    /**
     * Les mails de code, pour tous et par jour (S-09) : leur part du quota, les autres mails se comptant sur le reste :
     * les codes n’empêchent pas un rapport de partir, ni l’inverse. L’équipe est prévenue à `alerteA` du plafond (80 %),
     * puis quand il est atteint : tout le monde voit alors « trop de codes ». Sans la boîte des tests de bout en bout,
     * dont les mails ne partent pas. Une seule adresse IP pourrait l’épuiser en moins d’une heure au défaut (codeParIp, sur des emails
     * jetables) : chaque demande passe d’abord par le CAPTCHA. 60 par jour au défaut, même avec une clé réservée aux codes
     * (RESEND_API_KEY_CODES). Le relever, c’est aussi relever ce qui se devine en un jour sur tous les emails (cinq
     * essais par code) : revoir alors echecsCodeParEmail, codeParEmail et la réserve des codes (tests/unit/limites.test.ts).
     */
    codes: { max: part(PARTS_DES_MAILS.codes), fenetreS: 86400, alerteA: 0.8 },
    /** Les mails de la liste d’attente (les inscriptions et les invitations de l’équipe), pour tous. */
    attente: { max: part(PARTS_DES_MAILS.attente), fenetreS: 86400 },
    /** Les relances (« Ton rapport t’attend »), pour tous. */
    relances: { max: part(PARTS_DES_MAILS.relances), fenetreS: 86400 },
    laisse: { attente: part(laisse.attente), relance: part(laisse.relance), alerte: part(laisse.alerte), rapport: part(laisse.rapport) },
  } as const satisfies { parJour: number; codes: Limite & { alerteA: number }; attente: Limite; relances: Limite; laisse: Record<SorteDeMail, number> };
}

/** La part du quota des mails autres que les codes : tout, quand les codes ont leur clé ; sinon, ce que les codes laissent. */
export function partDesAutresMails(codesAPart: boolean, plafonds = plafondsDesMails()): number {
  return plafonds.parJour - (codesAPart ? 0 : plafonds.codes.max);
}

/** Une limite : combien de passages au plus, sur quelle fenêtre (en secondes). */
export type Limite = { max: number; fenetreS: number };
/* L’empreinte de la clé : une adresse IP ou un email n’est jamais gardé en clair */
const cleDe = (cle: string) => empreinte(`limite:${cle}`);
/* La fenêtre de cette limite a expiré : le compte repart de zéro */
const expiree = (fenetreS: number) => sql`${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS})`;
/* La durée d’une fenêtre, pour en écrire la fin (expires_at) */
const duree = (fenetreS: number) => sql`make_interval(secs => ${fenetreS})`;

/**
 * Compte un passage pour `cle` (ou `n` : la dépense d’un appel au modèle, src/server/budget.ts), et renvoie le compte de
 * la fenêtre. Une seule requête, atomique : la fenêtre repart à zéro quand elle a expiré. La fin de la fenêtre
 * (expires_at) est écrite avec elle : la purge (src/server/purge.ts) n’efface la clé qu’après, même pour une fenêtre de
 * 40 jours (S-13 : le compteur du mois de la voix ne repart plus à zéro chaque nuit). Une ligne d’avant la colonne la
 * reçoit au passage suivant.
 */
export async function compter(cle: string, { fenetreS }: Pick<Limite, "fenetreS">, n = 1): Promise<number> {
  const ligne = uneLigne(
    await db()
      .insert(schema.rateLimits)
      .values({ key: cleDe(cle), windowStart: sql`now()`, expiresAt: sql`now() + ${duree(fenetreS)}`, count: n })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`case when ${expiree(fenetreS)} then ${n}::int else ${schema.rateLimits.count} + ${n}::int end`,
          windowStart: sql`case when ${expiree(fenetreS)} then now() else ${schema.rateLimits.windowStart} end`,
          expiresAt: sql`case when ${expiree(fenetreS)} then now() + ${duree(fenetreS)} else ${schema.rateLimits.windowStart} + ${duree(fenetreS)} end`,
        },
      })
      .returning({ count: schema.rateLimits.count }),
    "rate_limits:passage",
  );
  return ligne.count;
}

/** Compte un passage pour `cle` (ou `n` : des Ko d’import) et dit s’il reste sous la limite. */
export const sousLaLimite = async (cle: string, limite: Limite, n = 1): Promise<boolean> => (await compter(cle, limite, n)) <= limite.max;

/** Le compte de la fenêtre en cours pour `cle` (0 si elle a expiré), sans compter de passage. */
export async function compteDe(cle: string, { fenetreS }: Pick<Limite, "fenetreS">): Promise<number> {
  const [ligne] = await db()
    .select({ n: sql<number>`case when ${expiree(fenetreS)} then 0 else ${schema.rateLimits.count} end`.mapWith(Number) })
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, cleDe(cle)));
  return ligne?.n ?? 0;
}

/** La limite est-elle déjà atteinte pour `cle` ? Sans compter de passage. */
export async function limiteAtteinte(cle: string, { max, fenetreS }: Limite): Promise<boolean> {
  const [ligne] = await db()
    .select({ atteinte: sql<boolean>`not (${expiree(fenetreS)}) and ${schema.rateLimits.count} >= ${max}` })
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, cleDe(cle)));
  return ligne?.atteinte ?? false;
}

/**
 * Rend un passage compté pour `cle` (ce qui l’a compté n’a finalement pas compté : un bon code, par exemple), ou `n` :
 * des caractères de la voix réservés, puis pas facturés (src/server/ia/voix.ts).
 */
export async function rendre(cle: string, n = 1): Promise<void> {
  await db()
    .update(schema.rateLimits)
    .set({ count: sql`greatest(${schema.rateLimits.count} - ${n}::int, 0)` })
    .where(eq(schema.rateLimits.key, cleDe(cle)));
}

/* Le compteur du jour des mails autres que les codes */
const MAILS_DU_JOUR = "mails:autres";

/**
 * `n` mails de cette sorte (un par destinataire) tiennent-ils encore dans leur part du quota (plafondsDesMails) ? Comptés si
 * oui. On regarde d’abord sans compter : un mail retenu ne prend rien à ceux qui passent après lui.
 */
export async function dansLeQuotaDesMails(sorte: SorteDeMail, n: number, { codesAPart }: { codesAPart: boolean }): Promise<boolean> {
  const plafonds = plafondsDesMails();
  const limite = { max: partDesAutresMails(codesAPart, plafonds) - plafonds.laisse[sorte], fenetreS: 86400 };
  if ((await compteDe(MAILS_DU_JOUR, limite)) + n > limite.max) return false;
  if ((await compter(MAILS_DU_JOUR, limite, n)) <= limite.max) return true;
  /* D’autres mails sont passés entre la question et le compte : celui-ci ne part pas, et rend sa place */
  await rendre(MAILS_DU_JOUR, n);
  return false;
}

/** Rend au quota des mails `n` mails comptés qui ne sont pas partis (le prestataire les a refusés). */
export const rendreAuQuotaDesMails = (n: number) => rendre(MAILS_DU_JOUR, n);

/**
 * L’adresse IP de la requête (derrière le proxy de Vercel, qui réécrit x-forwarded-for), telle que les limites la
 * comptent : une IPv4 telle quelle, une IPv6 par son préfixe /64 (voir groupeIp).
 */
export function ipDe(req: Request): string {
  return groupeIp(adresseDe(req) ?? "") || "inconnue";
}

/** L’adresse IP de la requête telle quelle (pas regroupée : ce que Cloudflare attend du CAPTCHA), ou null. */
export function adresseDe(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || null;
}

/* Un groupe de 16 bits d’une IPv6, écrit en hexadécimal */
const HEXTET = /^[0-9a-f]{1,4}$/;

/**
 * Ce qui identifie une adresse pour les limites. Une box IPv6 reçoit un bloc /64 entier : changer d’adresse dedans ne
 * doit pas remettre les compteurs à zéro, on ne garde donc que ses 64 premiers bits (« 2001:db8:0:1::/64 »). Une IPv4
 * reste telle quelle, aussi écrite en IPv6 (« ::ffff:203.0.113.7 »). Ce qui n’est pas une adresse lisible reste tel quel
 * (en minuscules) : compté à part, comme avant. Vide : rien à compter.
 */
export function groupeIp(brute: string): string {
  const ip = brute
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\](:\d+)?$/, "$1")
    .replace(/%.*$/, "");
  if (!ip.includes(":")) return ip;
  const v4 = ip.match(/^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1]!;
  const [tete, queue, deTrop] = ip.split("::");
  if (deTrop !== undefined) return ip;
  const groupes = (texte: string | undefined) => (texte ? texte.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])) : []);
  const debut = groupes(tete);
  const fin = queue === undefined ? [] : groupes(queue);
  const manquants = 8 - debut.length - fin.length;
  if (queue === undefined ? manquants !== 0 : manquants < 1) return ip;
  const tous = [...debut, ...Array.from({ length: manquants }, () => "0"), ...fin];
  if (!tous.every((g) => HEXTET.test(g))) return ip;
  return `${tous
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}
