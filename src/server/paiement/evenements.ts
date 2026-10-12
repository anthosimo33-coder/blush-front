import "server-only";
import { z } from "zod";

/*
 * Ce que disent les webhooks de Whop, lu en actions : livrer un achat, le reprendre (remboursé, contesté), le marquer
 * échoué, ou rien. Fonctions pures, sans base ni réseau (tests/unit/paiement.test.ts) : la route du webhook
 * (src/server/paiement/webhook.ts) les applique. Les schémas sont tolérants (passthrough, champs facultatifs) : l’API
 * de Whop change souvent (whop.md), et un champ ajouté ne doit jamais faire refuser un paiement. Ce qu’on lit d’un
 * paiement (« Payment ») est le même dans un webhook et dans GET /payments/{id} (la vérification du retour).
 * L’enveloppe : { id, type, timestamp, account_id, data }.
 */

/** Un montant de Whop : un nombre (9.9), une chaîne (« 9.90 »), ou { amount, currency } selon la version de l’API. */
const Montant = z.union([z.number(), z.string(), z.looseObject({ amount: z.union([z.number(), z.string()]), currency: z.string().optional() })]);

/** Un montant de Whop en centimes (990), ou null s’il ne se lit pas. */
function enCentimes(m: z.infer<typeof Montant> | null | undefined): number | null {
  if (m === null || m === undefined) return null;
  const v = typeof m === "object" ? m.amount : m;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Un identifiant de Whop (pay_…, mber_…) : une chaîne courte, sans espaces. */
const Ident = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

/** Le paiement, tel que Whop le décrit (seulement ce qu’on lit). */
const PaiementBrut = z.looseObject({
  id: Ident,
  status: z.string().nullish(),
  substatus: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  checkout_configuration_id: z.string().nullish(),
  total: Montant.nullish(),
  subtotal: Montant.nullish(),
  currency: z.string().nullish(),
  member_id: z.string().nullish(),
  member: z.looseObject({ id: z.string() }).nullish(),
  payment_method_id: z.string().nullish(),
  payment_method: z.looseObject({ id: z.string() }).nullish(),
  auto_refunded: z.boolean().nullish(),
  account_id: z.string().nullish(),
  company_id: z.string().nullish(),
});

/** Un paiement de Whop, lu : ce qu’il faut pour livrer l’achat qu’il paie (et le payer de nouveau en un geste, l’offre ③). */
export type PaiementWhop = {
  id: string;
  /** « paid », « pending », « failed »… tel quel (en minuscules). */
  statut: string;
  /** L’achat qu’il paie : metadata.achat, posé par nous à la commande (un uuid), ou null. */
  achat: string | null;
  /** Ce qu’il a coûté, en centimes : le total (TTC), et le sous-total (sans la taxe), quand Whop les donne. */
  total: number | null;
  sousTotal: number | null;
  /** Sa devise, en minuscules (« eur »). */
  devise: string | null;
  checkoutId: string | null;
  membreId: string | null;
  moyenId: string | null;
  /** Remboursé d’office par Whop (une alerte de litige) : rien à livrer. */
  autoRembourse: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lit un paiement de Whop (un webhook payment.*, ou GET /payments/{id}) ; null s’il ne se lit pas. */
export function lirePaiementWhop(data: unknown): PaiementWhop | null {
  const p = PaiementBrut.safeParse(data);
  if (!p.success) return null;
  const d = p.data;
  const achat = d.metadata?.achat;
  const deviseDuTotal = d.total && typeof d.total === "object" ? d.total.currency : undefined;
  return {
    id: d.id,
    statut: (d.status ?? "").toLowerCase(),
    achat: typeof achat === "string" && UUID.test(achat) ? achat.toLowerCase() : null,
    total: enCentimes(d.total),
    sousTotal: enCentimes(d.subtotal),
    devise: (d.currency ?? deviseDuTotal)?.toLowerCase() ?? null,
    checkoutId: d.checkout_configuration_id ?? null,
    membreId: d.member_id ?? d.member?.id ?? null,
    moyenId: d.payment_method_id ?? d.payment_method?.id ?? null,
    autoRembourse: d.auto_refunded === true,
  };
}

/**
 * Le montant d’un paiement colle-t-il à l’achat ? La devise (l’euro), et le total TTC, ou le sous-total si Whop a
 * ajouté la taxe par-dessus (des prix configurés hors taxe chez lui) : jamais moins que le prix du catalogue figé dans
 * l’achat. Un sous-total au prix ne suffit donc pas si le total payé est plus bas (une remise, un code promo appliqué
 * chez Whop : le sous-total est alors le prix d’avant la remise). Un montant qui ne colle pas n’est pas livré, et
 * l’équipe est prévenue.
 */
export const montantJuste = (p: Pick<PaiementWhop, "total" | "sousTotal" | "devise">, achat: { centimes: number; devise: string }) =>
  p.devise === achat.devise && (p.total === achat.centimes || (p.sousTotal === achat.centimes && p.total !== null && p.total >= achat.centimes));

/** L’enveloppe d’un webhook de Whop. */
const Enveloppe = z.looseObject({
  type: z.string(),
  account_id: z.string().nullish(),
  company_id: z.string().nullish(),
  data: z.unknown(),
});

/** Un remboursement ou un litige : de quel paiement, où il en est, et ce qu’il rend (un remboursement). */
const RepriseBrute = z.looseObject({
  id: z.string().nullish(),
  status: z.string().nullish(),
  amount: Montant.nullish(),
  payment_id: z.string().nullish(),
  payment: z.looseObject({ id: z.string(), refunded_amount: Montant.nullish() }).nullish(),
});

/** Ce qu’un webhook demande de faire. */
export type ActionWebhook =
  /* Un paiement réussi : livrer l’achat qu’il paie, s’il colle */
  | { faire: "livrer"; paiement: PaiementWhop }
  /*
   * Remboursé ou contesté : reprendre l’achat de ce paiement (l’achat, s’il est su ; sinon par le paiement). `montant` :
   * ce qu’un remboursement a rendu en tout sur ce paiement, en centimes, quand Whop le dit ; moins que le prix, rien
   * n’est repris (un geste commercial, webhook.ts)
   */
  | { faire: "reprendre"; statut: "rembourse" | "conteste"; paiementId: string; achat: string | null; montant?: number }
  /* Un paiement refusé : l’achat en attente passe « echoue » */
  | { faire: "echouer"; paiement: PaiementWhop }
  /* Rien à faire : un événement qu’on n’écoute pas, un paiement en attente, un remboursement pas encore fait… */
  | { faire: "rien"; pourquoi: string };

/** Un webhook lu : son type, le compte Whop qui l’envoie (s’il le dit), et ce qu’il demande. Null : il ne se lit pas. */
export type WebhookLu = { type: string; compte: string | null; action: ActionWebhook };

/** Le paiement d’un remboursement ou d’un litige, ou null. */
const paiementDe = (r: z.infer<typeof RepriseBrute>) => {
  const id = r.payment_id ?? r.payment?.id ?? null;
  return id && Ident.safeParse(id).success ? id : null;
};

/**
 * Lit un webhook (son corps, en JSON déjà parsé) : ce qu’il demande. payment.succeeded livre (sauf remboursé d’office :
 * repris), payment.failed fait échouer, refund.created et refund.updated reprennent quand le remboursement est fait
 * (« succeeded » ; avec ce qu’il a rendu, s’il le dit : un remboursement partiel ne reprend rien), dispute.created reprend (contesté) tout de suite, dispute.updated quand le litige est perdu. Le reste
 * ne fait rien (dispute_alert.created, payment.pending, un litige gagné…).
 */
export function lireWebhook(corps: unknown): WebhookLu | null {
  const e = Enveloppe.safeParse(corps);
  if (!e.success) return null;
  const { type, data } = e.data;
  const compte = e.data.account_id ?? e.data.company_id ?? null;
  const lu = (action: ActionWebhook): WebhookLu => ({ type, compte, action });
  switch (type) {
    case "payment.succeeded":
    case "payment.failed": {
      const paiement = lirePaiementWhop(data);
      if (!paiement) return lu({ faire: "rien", pourquoi: "paiement illisible" });
      if (type === "payment.failed") return lu({ faire: "echouer", paiement });
      if (paiement.autoRembourse) return lu({ faire: "reprendre", statut: "rembourse", paiementId: paiement.id, achat: paiement.achat });
      return lu({ faire: "livrer", paiement });
    }
    case "refund.created":
    case "refund.updated":
    case "dispute.created":
    case "dispute.updated": {
      const r = RepriseBrute.safeParse(data);
      const paiementId = r.success ? paiementDe(r.data) : null;
      if (!r.success || !paiementId) return lu({ faire: "rien", pourquoi: "paiement introuvable dans l’événement" });
      const statut = (r.data.status ?? "").toLowerCase();
      if (type.startsWith("refund.")) {
        if (statut !== "succeeded") return lu({ faire: "rien", pourquoi: `remboursement ${statut || "sans statut"}` });
        /* Ce que le paiement a rendu en tout (plusieurs remboursements partiels), sinon ce que rend celui-ci */
        const montant = enCentimes(r.data.payment?.refunded_amount) ?? enCentimes(r.data.amount);
        return lu({ faire: "reprendre", statut: "rembourse", paiementId, achat: null, ...(montant !== null ? { montant } : {}) });
      }
      /* Un litige ouvert re-verrouille tout de suite ; mis à jour, seulement perdu (gagné : TODO(produit), voir BACKEND.md) */
      if (type === "dispute.created" || statut === "lost") return lu({ faire: "reprendre", statut: "conteste", paiementId, achat: null });
      return lu({ faire: "rien", pourquoi: `litige ${statut || "sans statut"}` });
    }
    default:
      return lu({ faire: "rien", pourquoi: "événement non écouté" });
  }
}
