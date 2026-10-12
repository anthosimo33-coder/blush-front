import "server-only";
import { z } from "zod";
import { lirePaiementWhop, type PaiementWhop } from "./evenements";

/*
 * Le client de l’API REST de Whop, par fetch, sans leur bibliothèque (@whop/sdk : trop récente, et trois appels
 * suffisent). La clé du compte en Bearer, la version de l’API épinglée (Api-Version-Date : sans elle, Whop répond sous
 * les formes de 2025), et une clé d’idempotence sur chaque création (l’id de l’achat : un nouvel essai ne crée pas un
 * second paiement, Whop la garde 24 h). Ce que Whop voit de nous : l’id de l’achat, son prix, l’adresse du retour ;
 * jamais un prénom ni la conv. Le bac à sable (WHOP_BAC_A_SABLE) a sa propre adresse, et ses propres clés.
 */

/** La version de l’API de Whop sous laquelle ce client est écrit (celle de leur bibliothèque 2.4.0, le 12 octobre 2026). */
export const VERSION_API_WHOP = "2026-10-09-2";

/** L’API, en ligne ou dans le bac à sable. */
const API = { vraie: "https://api.whop.com/api/v1", bacASable: "https://sandbox-api.whop.com/api/v1" };
/** La page de paiement d’une configuration, si Whop ne la donne pas (purchase_url). */
const PAGE = { vraie: "https://whop.com/checkout", bacASable: "https://sandbox.whop.com/checkout" };

/** Combien de temps attendre Whop (le webhook doit répondre en moins de 5 s ; la commande, elle, a l’utilisateur qui attend). */
const DELAI_WHOP_MS = 8_000;

/** Ce qu’il faut pour appeler Whop : la clé, le compte (biz_…), le produit (prod_…) et l’API (le bac à sable ou la vraie). */
export type ConfigWhop = { cle: string; compte: string; produit: string; bacASable: boolean };

/**
 * Whop a refusé l’appel (ou n’a pas répondu) : son statut HTTP, rien d’autre (ni la clé, ni le corps). Le journal le lit
 * dans `code` (« whop_401 », « whop_delai » : champsDErreur, src/lib/tracer.ts).
 */
export class ErreurWhop extends Error {
  readonly code: string;
  constructor(readonly statut: number | "delai" | "illisible") {
    super(`Whop a répondu ${statut}`);
    this.name = "ErreurWhop";
    this.code = `whop_${statut}`;
  }
}

/** Un appel à l’API : son corps JSON lu, ou ErreurWhop. `introuvable` : un 404 rend null au lieu d’échouer. */
async function appel(config: ConfigWhop, methode: "GET" | "POST", chemin: string, { corps, idempotence }: { corps?: unknown; idempotence?: string } = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`${config.bacASable ? API.bacASable : API.vraie}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${config.cle}`,
        "api-version-date": VERSION_API_WHOP,
        accept: "application/json",
        ...(corps !== undefined && { "content-type": "application/json" }),
        ...(idempotence && { "idempotency-key": idempotence }),
      },
      ...(corps !== undefined && { body: JSON.stringify(corps) }),
      signal: AbortSignal.timeout(DELAI_WHOP_MS),
      cache: "no-store",
    });
  } catch {
    throw new ErreurWhop("delai");
  }
  if (methode === "GET" && r.status === 404) return null;
  if (!r.ok) throw new ErreurWhop(r.status);
  try {
    return await r.json();
  } catch {
    throw new ErreurWhop("illisible");
  }
}

/**
 * Le prix d’un achat, créé à la volée chez Whop (un « plan » en ligne : Whop réutilise celui qui a déjà ces attributs) :
 * en euros (Whop compte en unités : 9.9), payé une fois, sous notre produit, caché du catalogue de Whop.
 */
const planEnLigne = (config: ConfigWhop, centimes: number) => ({
  initial_price: centimes / 100,
  currency: "eur",
  plan_type: "one_time",
  product_id: config.produit,
  visibility: "hidden",
});

/** Ce que Whop répond à la création d’une configuration de paiement. */
const Configuration = z.looseObject({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), purchase_url: z.string().url().nullish() });

/**
 * Crée la configuration de paiement d’un achat (POST /checkout_configurations) : son prix en ligne, l’achat dans ses
 * métadonnées (recopiées sur le paiement et ses webhooks : c’est ainsi que le webhook retrouve l’achat), et l’adresse
 * du retour. Rend son id (ch_…) et l’adresse de sa page de paiement.
 */
export async function creerConfiguration(
  config: ConfigWhop,
  { achat, centimes, retour }: { achat: string; centimes: number; retour: string },
): Promise<{ id: string; url: string }> {
  const brut = await appel(config, "POST", "/checkout_configurations", {
    corps: { plan: planEnLigne(config, centimes), metadata: { achat }, redirect_url: retour },
    idempotence: `configuration:${achat}`,
  });
  const c = Configuration.safeParse(brut);
  if (!c.success) throw new ErreurWhop("illisible");
  return { id: c.data.id, url: c.data.purchase_url ?? `${config.bacASable ? PAGE.bacASable : PAGE.vraie}/${c.data.id}/` };
}

/** Un paiement chez Whop (GET /payments/{id}), lu : null s’il n’existe pas (ou ne se lit pas). */
export async function lirePaiement(config: ConfigWhop, id: string): Promise<PaiementWhop | null> {
  if (!/^pay_[A-Za-z0-9_-]+$/.test(id)) return null;
  const brut = await appel(config, "GET", `/payments/${encodeURIComponent(id)}`);
  return brut === null ? null : lirePaiementWhop(brut);
}

/** Ce que Whop répond à un paiement en un geste : son id, son statut, et la page où l’acheteur doit confirmer (une 3-D Secure). */
const PaiementCree = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  next_action: z.looseObject({ url: z.string().url().nullish(), redirect_to_url: z.looseObject({ url: z.string().url() }).nullish() }).nullish(),
});

/**
 * Le paiement en un geste (l’offre ③, POST /payments) : le moyen de paiement gardé du membre (payt_…, mber_…), payé
 * maintenant, à sa demande (off_session: false : une 3-D Secure peut être demandée). Rend son id, et l’adresse où le
 * confirmer si la banque le demande (« requires_action »), sinon null : le webhook payment.succeeded livrera.
 */
export async function payerEnUnGeste(
  config: ConfigWhop,
  { achat, centimes, membre, moyen, retour }: { achat: string; centimes: number; membre: string; moyen: string; retour: string },
): Promise<{ id: string; confirmer: string | null }> {
  const brut = await appel(config, "POST", "/payments", {
    corps: {
      account_id: config.compte,
      plan: planEnLigne(config, centimes),
      member_id: membre,
      payment_method_id: moyen,
      off_session: false,
      return_url: retour,
      metadata: { achat },
    },
    idempotence: `paiement:${achat}`,
  });
  const p = PaiementCree.safeParse(brut);
  if (!p.success) throw new ErreurWhop("illisible");
  const action = p.data.next_action;
  return { id: p.data.id, confirmer: p.data.status === "requires_action" ? (action?.redirect_to_url?.url ?? action?.url ?? null) : null };
}
