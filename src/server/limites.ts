import "server-only";
import { sql } from "drizzle-orm";
import { empreinte } from "./chiffrement";
import { db, schema } from "./db";

/** Les limites anti-abus : combien de fois, sur quelle fenêtre. */
export const LIMITES = {
  codeParEmail: { max: 5, fenetreS: 3600 },
  codeParIp: { max: 20, fenetreS: 3600 },
  verificationParIp: { max: 30, fenetreS: 3600 },
  importParIp: { max: 20, fenetreS: 3600 },
  chatParCompte: { max: 150, fenetreS: 86400 },
  /** Les nouvelles convs lues (un verdict, puis un rapport et une mémoire : environ 1 $ chacune). */
  analyseParCompte: { max: 5, fenetreS: 86400 },
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
 * Compte un passage pour `cle` et dit s’il reste sous la limite. Une seule requête, atomique :
 * la fenêtre repart à zéro quand elle a expiré.
 */
export async function sousLaLimite(cle: string, { max, fenetreS }: { max: number; fenetreS: number }): Promise<boolean> {
  const [ligne] = await db()
    .insert(schema.rateLimits)
    /* L’empreinte de la clé : une adresse IP ou un email n’est jamais gardé en clair */
    .values({ key: empreinte(`limite:${cle}`), windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS}) then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${schema.rateLimits.windowStart} < now() - make_interval(secs => ${fenetreS}) then now() else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return ligne.count <= max;
}

/** L’adresse IP de la requête (derrière le proxy de Vercel). */
export function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
}
