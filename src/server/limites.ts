import "server-only";
import { eq, sql } from "drizzle-orm";
import { empreinte } from "./chiffrement";
import { db, schema } from "./db";

/**
 * Les limites anti-abus : combien de fois, sur quelle fenêtre. Celles « par compte » se rangent sur son email canonique
 * (cleDuCompte, src/server/email-canonique.ts), celles « par IP » sur son adresse, IPv6 regroupée par /64 (ipDe).
 */
export const LIMITES = {
  /** Les codes de connexion demandés depuis une adresse IP, quel que soit l’email. */
  codeParIp: { max: 20, fenetreS: 3600 },
  /**
   * Les codes demandés pour un email (canonique : src/server/email-canonique.ts) depuis une même adresse IP, par jour. En
   * dessous du plafond de l’email : quelqu’un qui en demande pour l’email d’un autre, d’une seule adresse, lui en laisse.
   */
  codeParEmailEtIp: { max: 7, fenetreS: 86400 },
  /** Les codes demandés pour un email (canonique), par jour, d’où qu’ils viennent. */
  codeParEmail: { max: 10, fenetreS: 86400 },
  /**
   * Les mails de code, pour tous et par jour : sous le quota de Resend, pour que les codes partent toujours. L’équipe est
   * prévenue à `alerteA` du plafond (80 %), puis quand il est atteint : tout le monde voit alors « trop de codes ». Sans
   * la boîte des tests de bout en bout, dont les mails ne partent pas.
   */
  mailsCodeParJour: { max: 80, fenetreS: 86400, alerteA: 0.8 },
  verificationParIp: { max: 30, fenetreS: 3600 },
  /** Les essais de code ratés pour un email (canonique), par jour : un nouveau code ne remet pas ce compte à zéro. */
  echecsCodeParEmail: { max: 20, fenetreS: 86400 },
  importParIp: { max: 20, fenetreS: 3600 },
  chatParCompte: { max: 150, fenetreS: 86400 },
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
  /** Les alertes par mail à l’équipe. */
  alertesParJour: { max: 30, fenetreS: 86400 },
  /** Les inscriptions à la liste d’attente. */
  attenteParIp: { max: 10, fenetreS: 3600 },
  /** Les mails de la liste d’attente à un même email (l’inscription peut venir de n’importe qui : pas de rafale chez lui). */
  mailAttenteParEmail: { max: 3, fenetreS: 86400 },
  /** Tous les mails de la liste d’attente, par jour : n’importe qui peut en déclencher, ils ne doivent pas épuiser le quota des codes. */
  mailsAttenteParJour: { max: 50, fenetreS: 86400 },
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

type Limite = { max: number; fenetreS: number };
/* L’empreinte de la clé : une adresse IP ou un email n’est jamais gardé en clair */
const cleDe = (cle: string) => empreinte(`limite:${cle}`);
/* La fenêtre de cette limite a expiré : le compte repart de zéro */
const expiree = (fenetreS: number) => sql`${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS})`;

/** Compte un passage pour `cle`, et renvoie le compte de la fenêtre. Une seule requête, atomique : la fenêtre repart à zéro quand elle a expiré. */
export async function compter(cle: string, { fenetreS }: Limite): Promise<number> {
  const [ligne] = await db()
    .insert(schema.rateLimits)
    .values({ key: cleDe(cle), windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${expiree(fenetreS)} then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expiree(fenetreS)} then now() else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return ligne.count;
}

/** Compte un passage pour `cle` et dit s’il reste sous la limite. */
export const sousLaLimite = async (cle: string, limite: Limite): Promise<boolean> => (await compter(cle, limite)) <= limite.max;

/** La limite est-elle déjà atteinte pour `cle` ? Sans compter de passage. */
export async function limiteAtteinte(cle: string, { max, fenetreS }: Limite): Promise<boolean> {
  const [ligne] = await db()
    .select({ atteinte: sql<boolean>`not (${expiree(fenetreS)}) and ${schema.rateLimits.count} >= ${max}` })
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, cleDe(cle)));
  return ligne?.atteinte ?? false;
}

/** Rend un passage compté pour `cle` (ce qui l’a compté n’a finalement pas compté : un bon code, par exemple). */
export async function rendre(cle: string): Promise<void> {
  await db()
    .update(schema.rateLimits)
    .set({ count: sql`greatest(${schema.rateLimits.count} - 1, 0)` })
    .where(eq(schema.rateLimits.key, cleDe(cle)));
}

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
  if (v4) return v4[1];
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
