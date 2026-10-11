import "server-only";
import { eq, sql } from "drizzle-orm";
import { empreinte } from "./chiffrement";
import { db, schema, uneLigne } from "./db";

/**
 * Les limites anti-abus : combien de fois, sur quelle fenêtre. Celles « par compte » se rangent sur son email canonique
 * (sousLaLimiteDuCompte, src/server/requete.ts), celles « par IP » sur son adresse, IPv6 regroupée par /64
 * (sousLaLimiteDeLIp) : deux familles de clés qui ne se croisent jamais (« analyse:compte:… », « analyse:ip:… »).
 */
export const LIMITES = {
  /** Les codes de connexion demandés depuis une adresse IP, quel que soit l’email. */
  codeParIp: { max: 20, fenetreS: 3600 },
  /**
   * Les codes demandés pour un email (canonique : src/server/email-canonique.ts) depuis une même adresse IP, par jour. Égal
   * au plafond de l’email depuis la réserve des codes (plus bas) : il garde une adresse sous ce plafond si on le relève.
   */
  codeParEmailEtIp: { max: 7, fenetreS: 86400 },
  /** Les codes demandés pour un email (canonique), par jour, d’où qu’ils viennent. TODO(produit): 7 (10 avant la réserve). */
  codeParEmail: { max: 7, fenetreS: 86400 },
  /*
   * La réserve des codes (S-08). N’importe qui peut demander les codes d’un email : un tiers qui remplit codeParEmail
   * ne doit pas priver la personne de code. Au-delà des deux plafonds du dessus, chaque adresse IP a encore `max` code de
   * réserve pour l’email (codeReserveParEmailEtIp), jusqu’à `max` pour l’email en tout (codeReserveParEmail). Rien ne
   * distingue le navigateur d’un tiers de celui de la personne (un cookie s’efface) : la réserve se compte par adresse.
   * Pour priver la personne de code partout, un tiers doit donc écrire depuis au moins cinq adresses (des /64 en IPv6) au
   * lieu d’une : plus cher, pas impossible, d’où le CAPTCHA prévu avant l’ouverture publique. Les codes du jour, réserve
   * comprise, donnent au plus echecsCodeParEmail essais (cinq chacun) : ce qui se devine ne grandit pas, et les essais
   * ratés d’un tiers ne ferment pas la porte avant ses codes (tests/unit/limites.test.ts). TODO(produit): 1 par adresse,
   * 5 par email.
   */
  codeReserveParEmailEtIp: { max: 1, fenetreS: 86400 },
  codeReserveParEmail: { max: 5, fenetreS: 86400 },
  /**
   * Les mails de code, pour tous et par jour (S-09) : leur part du quota du prestataire de mails (QUOTA_MAILS), les
   * autres mails se comptant sur le reste : les codes n’empêchent pas un rapport de partir, ni l’inverse. L’équipe est
   * prévenue à `alerteA` du plafond (80 %), puis quand il est atteint : tout le monde voit alors « trop de codes ». Sans
   * la boîte des tests de bout en bout, dont les mails ne partent pas. Une seule adresse IP peut l’épuiser en trois heures
   * (codeParIp, sur des emails jetables) : le CAPTCHA prévu avant l’ouverture publique y répond. TODO(produit): 60 par
   * jour (le plan gratuit du prestataire en permet 100) ; à relever avec un plan payant ou une clé réservée aux codes
   * (RESEND_API_KEY_CODES). Le relever, c’est aussi relever ce qui se devine en un jour sur tous les emails (cinq essais
   * par code) : revoir alors echecsCodeParEmail, codeParEmail et la réserve des codes (tests/unit/limites.test.ts).
   */
  mailsCodeParJour: { max: 60, fenetreS: 86400, alerteA: 0.8 },
  verificationParIp: { max: 30, fenetreS: 3600 },
  /*
   * Les essais de code ratés (S-07, S-08), par jour : un nouveau code ne remet aucun de ces comptes à zéro, un bon code
   * rend son essai à chacun. Ils se comptent à trois endroits : le navigateur qui tape (echecsCodeParNavigateur), son
   * adresse IP (echecsCodeParEmailEtIp) et l’email (echecsCodeParEmail), la borne de tout ce qui se devine en un jour.
   * Un tiers qui rate exprès les codes d’une personne n’épuise que les essais de son navigateur : il lui faudrait les
   * soixante de l’email, soit tous les codes du jour, réserve comprise, pour l’arrêter elle aussi.
   */
  /**
   * Les essais ratés d’un navigateur pour un email (canonique) : deux codes entiers (cinq essais chacun). Au-delà, ce
   * navigateur n’a plus d’essai aujourd’hui pour cet email ; les autres gardent les leurs. TODO(produit): 10 par
   * navigateur (deux codes entiers).
   */
  echecsCodeParNavigateur: { max: 10, fenetreS: 86400 },
  /**
   * Les essais ratés pour un email depuis une même adresse IP. Au-delà, un navigateur de cette adresse qui en a déjà raté
   * `reserveNavigateur` n’essaie plus (cinq au lieu de dix) ; un autre garde sa réserve, celle de la personne sur le même
   * Wi-Fi que le tiers. Elle ne ralentit pas un tiers qui change de navigateur (un cookie s’efface) : ce sont
   * codeParEmailEtIp et les plafonds de l’email qui le bornent. TODO(produit): 20, et une réserve de 5.
   */
  echecsCodeParEmailEtIp: { max: 20, fenetreS: 86400, reserveNavigateur: 5 },
  /**
   * Les essais ratés pour un email (canonique), d’où qu’ils viennent : au-delà, plus personne n’essaie pour lui
   * aujourd’hui. Un code sur un million par essai : 60 essais, c’est une chance sur plus de 16 000 de deviner un code dans
   * la journée. Les codes du jour, réserve comprise (douze, cinq essais chacun), n’en donnent pas plus dans une fenêtre :
   * seule une fenêtre des essais à cheval sur deux fenêtres des codes (elles ne commencent pas à la même heure) peut aller
   * au-delà, et c’est elle qui l’arrête. Une défense en profondeur. TODO(produit): 60 par jour (20 avant).
   */
  echecsCodeParEmail: { max: 60, fenetreS: 86400 },
  importParIp: { max: 20, fenetreS: 3600 },
  chatParCompte: { max: 150, fenetreS: 86400 },
  /**
   * Les vocaux envoyés au chat (S-15), par jour : chacun est transcrit, à la durée. Un message du chat les compte aussi
   * (chatParCompte). TODO(produit): 40 par jour.
   */
  vocalParCompte: { max: 40, fenetreS: 86400 },
  /**
   * Les secondes de son transcrites pour un compte, par jour : la durée mesurée, ou celle que le prestataire dit avoir
   * facturée si elle est plus longue (src/server/ia/transcription.ts). TODO(produit): 1 800, une demi-heure de vocaux.
   */
  secondesVocalParCompte: { max: 1800, fenetreS: 86400 },
  /**
   * Les caractères que la voix dit pour un compte (S-13), par jour : ses réponses du chat en vocal et le vocal de son
   * rapport. Au-delà, BLUSH répond par écrit (src/server/ia/voix.ts). TODO(produit): 6 000, environ 6 minutes de voix.
   */
  voixParCompte: { max: 6000, fenetreS: 86400 },
  /** Les nouvelles convs lues (un verdict, puis un rapport et une mémoire : environ 1 $ chacune). */
  analyseParCompte: { max: 5, fenetreS: 86400 },
  /**
   * Les mêmes lectures depuis une adresse IP, tous comptes confondus : ouvrir des comptes à la chaîne d’une même box ne
   * multiplie pas les verdicts. Large, pour un Wi-Fi partagé ou le NAT d’un opérateur. TODO(produit): 20 par jour, à
   * revoir avec les chiffres de l’ouverture.
   */
  analyseParIp: { max: 20, fenetreS: 86400 },
  /** Les moments d’écoute du vocal notés pour l’A/B test des voix. */
  ecouteParCompte: { max: 200, fenetreS: 86400 },
  /** « Relancer l’écriture » d’un rapport en échec (un rapport coûte environ 1 $). */
  relanceParCompte: { max: 3, fenetreS: 86400 },
  /**
   * Les alertes par mail à l’équipe (S-19), par jour : les `reserveImportantes` dernières sont gardées pour les alertes
   * importantes (le budget de l’IA, l’échec d’une lecture ou d’un rapport) : une alerte ordinaire s’arrête avant. Elles
   * partent aussi dans le quota des mails (QUOTA_MAILS : chaque destinataire compte), qui les arrête avant les rapports.
   * TODO(produit): 10, à revoir à l’usage.
   */
  alertesParJour: { max: 30, fenetreS: 86400, reserveImportantes: 10 },
  /** Les alertes d’un même sujet (« rapport_chapitres en échec », « repli sur un autre modèle »), par jour. TODO(produit): 5, à revoir à l’usage. */
  alertesParSujet: { max: 5, fenetreS: 86400 },
  /** Les inscriptions à la liste d’attente. */
  attenteParIp: { max: 10, fenetreS: 3600 },
  /** Les mails de la liste d’attente à un même email (l’inscription peut venir de n’importe qui : pas de rafale chez lui). */
  mailAttenteParEmail: { max: 3, fenetreS: 86400 },
  /**
   * Tous les mails de la liste d’attente, par jour : n’importe qui peut en déclencher, ils ne doivent épuiser ni le quota
   * des codes, ni la part des rapports et des alertes (QUOTA_MAILS, qui les arrête aussi les premiers). Au-delà, on
   * inscrit sans écrire. Sans la boîte des tests de bout en bout, dont les mails ne partent pas (comme mailsCodeParJour).
   * TODO(produit): 20.
   */
  mailsAttenteParJour: { max: 20, fenetreS: 86400 },
  /** Les images « Partager en image » (une réponse du chat, la chute d’un chapitre), dessinées à la demande. */
  imageParCompte: { max: 60, fenetreS: 86400 },
  /**
   * Les lots d’images d’un enregistrement d’écran, chacun lu par le modèle : des lots de six écrans (douze avant),
   * jusqu’à seize pour un long enregistrement. Les plafonds des lots ont doublé avec eux : autant d’enregistrements
   * qu’avant (un Wi-Fi partagé ou le NAT d’un opérateur en font passer plusieurs), pour à peu près autant d’images lues.
   */
  lotParIp: { max: 120, fenetreS: 3600 },
  /** Des captures ou un export envoyés après l’import (dans le chat ou pour sa fiche) : les lire coûte plus qu’un message. */
  ajoutParCompte: { max: 40, fenetreS: 86400 },
  /**
   * Bêta ouverte : les lectures de captures et de lots par des visiteurs sans compte, pour tous et par jour. Chacune fait
   * travailler le modèle payant avant l’email : changer d’adresse IP ne doit pas faire grimper la facture sans fin.
   */
  capturesAnonymesParJour: { max: 50, fenetreS: 86400 },
  lotsAnonymesParJour: { max: 400, fenetreS: 86400 },
  /** Les mêmes lectures pour un compte connecté, par jour (un compte gratuit suffirait sinon à passer outre le plafond). */
  capturesParCompte: { max: 30, fenetreS: 86400 },
  lotsParCompte: { max: 300, fenetreS: 86400 },
  /** Les corrections de sa fiche : chacune réécrit la mémoire, que le chat envoie ensuite au modèle à chaque message. */
  ficheParCompte: { max: 60, fenetreS: 86400 },
} as const;

/**
 * Le quota du prestataire de mails (S-09), par jour : 100 sur son plan gratuit, chaque destinataire compté. Les codes ont
 * leur part (mailsCodeParJour). Tous les autres mails qui partent avec RESEND_API_KEY (« ton rapport est prêt », les
 * alertes de l’équipe, la liste d’attente) se comptent ensemble sur ce qui reste (partDesAutresMails : 40, ou les 100
 * quand les codes ont leur clé, RESEND_API_KEY_CODES), et les moins nécessaires s’arrêtent les premiers : chaque sorte de
 * mail laisse `laisse[sorte]` mails de cette part aux suivantes. La liste d’attente en laisse 20, les alertes 10 (les
 * rapports les ont toujours), les rapports aucun : au pire, « ton rapport est prêt » ne part pas, et le rapport attend
 * dans l’appli (src/server/email.ts, envoyerMail). tests/unit/limites.test.ts y veille. Les fenêtres des compteurs ne
 * commencent pas à minuit comme le jour du prestataire : un jour du prestataire peut en voir deux, d’où la marge.
 * TODO(produit): 100, et ces parts.
 */
export const QUOTA_MAILS = { parJour: 100, laisse: { attente: 20, alerte: 10, rapport: 0 } } as const;
/** Ce qu’est un mail pour le quota : du plus nécessaire (le rapport) au moins nécessaire (la liste d’attente). */
export type SorteDeMail = keyof typeof QUOTA_MAILS.laisse;

/** La part du quota des mails autres que les codes : tout, quand les codes ont leur clé ; sinon, ce que les codes laissent. */
export const partDesAutresMails = (codesAPart: boolean) => QUOTA_MAILS.parJour - (codesAPart ? 0 : LIMITES.mailsCodeParJour.max);

/** Une limite : combien de passages au plus, sur quelle fenêtre (en secondes). */
export type Limite = { max: number; fenetreS: number };
/* L’empreinte de la clé : une adresse IP ou un email n’est jamais gardé en clair */
const cleDe = (cle: string) => empreinte(`limite:${cle}`);
/* La fenêtre de cette limite a expiré : le compte repart de zéro */
const expiree = (fenetreS: number) => sql`${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS})`;

/**
 * Compte un passage pour `cle` (ou `n` : la dépense d’un appel au modèle, src/server/budget.ts), et renvoie le compte de
 * la fenêtre. Une seule requête, atomique : la fenêtre repart à zéro quand elle a expiré.
 */
export async function compter(cle: string, { fenetreS }: Pick<Limite, "fenetreS">, n = 1): Promise<number> {
  const ligne = uneLigne(
    await db()
      .insert(schema.rateLimits)
      .values({ key: cleDe(cle), windowStart: new Date(), count: n })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`case when ${expiree(fenetreS)} then ${n}::int else ${schema.rateLimits.count} + ${n}::int end`,
          windowStart: sql`case when ${expiree(fenetreS)} then now() else ${schema.rateLimits.windowStart} end`,
        },
      })
      .returning({ count: schema.rateLimits.count }),
    "rate_limits (passage compté)",
  );
  return ligne.count;
}

/** Compte un passage pour `cle` et dit s’il reste sous la limite. */
export const sousLaLimite = async (cle: string, limite: Limite): Promise<boolean> => (await compter(cle, limite)) <= limite.max;

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
 * `n` mails de cette sorte (un par destinataire) tiennent-ils encore dans leur part du quota (QUOTA_MAILS) ? Comptés si
 * oui. On regarde d’abord sans compter : un mail retenu ne prend rien à ceux qui passent après lui.
 */
export async function dansLeQuotaDesMails(sorte: SorteDeMail, n: number, { codesAPart }: { codesAPart: boolean }): Promise<boolean> {
  const limite = { max: partDesAutresMails(codesAPart) - QUOTA_MAILS.laisse[sorte], fenetreS: 86400 };
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
  return groupeIp(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "") || "inconnue";
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
