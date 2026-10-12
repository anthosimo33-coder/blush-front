import "server-only";
import { randomUUID } from "node:crypto";
import type { IssueDuFauxWhop } from "@/types";
import type { Achat } from "../achats";
import { COMPTE_FACTICE, MEMBRE_FACTICE, MOYEN_FACTICE, SECRET_FACTICE } from "./factice-valeurs";
import { signerWebhook, type EntetesWebhook } from "./signature";

/*
 * Le faux Whop (BLUSH_PAIEMENT_FACTICE : le dev, les tests, jamais Vercel). Sa page de paiement est locale
 * (/paiement/factice, ouverte seulement en local comme /apercu : src/proxy.ts) ; ses boutons fabriquent ici un vrai
 * webhook de Whop, signé de son secret de test (SECRET_FACTICE), que le navigateur poste à /api/paiement/whop : la
 * vérification de la signature et la livraison sont les vraies. Un paiement du faux Whop garde un moyen de paiement
 * (MOYEN_FACTICE) : l’offre ③ s’y paie en un geste.
 */

/** Un webhook du faux Whop : son corps brut et ses en-têtes signés, tels que Whop les posterait. */
export type WebhookFactice = { corps: string; entetes: EntetesWebhook };

/** Un webhook de ce type, sur ces données, signé du secret du faux Whop, à cette heure (en millisecondes). */
export function webhookFactice(type: string, data: Record<string, unknown>, maintenant = Date.now()): WebhookFactice {
  const corps = JSON.stringify({ id: `evt_faux_${randomUUID()}`, type, timestamp: new Date(maintenant).toISOString(), account_id: COMPTE_FACTICE, data });
  return { corps, entetes: signerWebhook(SECRET_FACTICE, `msg_faux_${randomUUID()}`, corps, maintenant) };
}

/** Le paiement d’un achat, tel que Whop le décrirait : son prix TTC en euros, l’achat dans ses métadonnées, un moyen de paiement gardé. */
const paiementDe = (achat: Pick<Achat, "id" | "centimes" | "devise" | "checkoutId">, statut: "paid" | "failed") => ({
  id: `pay_faux_${randomUUID().replaceAll("-", "")}`,
  status: statut,
  metadata: { achat: achat.id },
  checkout_configuration_id: achat.checkoutId,
  total: { amount: (achat.centimes / 100).toFixed(2), currency: achat.devise },
  currency: achat.devise,
  member_id: MEMBRE_FACTICE,
  payment_method_id: MOYEN_FACTICE,
  auto_refunded: false,
});

/**
 * Le webhook que Whop enverrait pour cette issue de l’achat (ISSUES_DU_FAUX_WHOP) : payment.succeeded (payé), payment.failed (refusé), ou
 * refund.created réussi (remboursé : seulement un achat payé, dont on connaît le paiement). Null : rien à rembourser.
 */
export function webhookDeLIssue(achat: Pick<Achat, "id" | "centimes" | "devise" | "checkoutId" | "paiementId">, issue: IssueDuFauxWhop): WebhookFactice | null {
  if (issue === "rembourser") {
    if (!achat.paiementId) return null;
    return webhookFactice("refund.created", { id: `rfnd_faux_${randomUUID().replaceAll("-", "")}`, status: "succeeded", payment_id: achat.paiementId });
  }
  return webhookFactice(issue === "payer" ? "payment.succeeded" : "payment.failed", paiementDe(achat, issue === "payer" ? "paid" : "failed"));
}
