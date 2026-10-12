import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lirePaiementWhop, lireWebhook, montantJuste } from "@/server/paiement/evenements";
import { signerWebhook, TOLERANCE_WEBHOOK_S, verifierWebhook } from "@/server/paiement/signature";
import { creerConfiguration, ErreurWhop, lirePaiement, payerEnUnGeste, VERSION_API_WHOP, type ConfigWhop } from "@/server/paiement/whop";

/*
 * Le paiement par Whop, sans base ni réseau : la signature des webhooks (Standard Webhooks, écrite à la main), ce que
 * chaque événement demande, le montant d’un paiement, et le client de l’API sur un faux `fetch`. Les vecteurs de
 * signature sont construits ici, par node:crypto directement, d’après le standard : pas par la fonction testée.
 */

const SECRET = "ws_un_secret_de_test_qui_ressemble_a_celui_de_whop";
/** Le 12 octobre 2026 à midi, en millisecondes : l’heure des webhooks de ce fichier. */
const MIDI = Date.UTC(2026, 9, 12, 12);
const CORPS = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_1" } });

/** La signature attendue par le standard : HMAC-SHA256, clé = les octets UTF-8 du secret entier, de « id.timestamp.corps », en base64. */
const vecteur = (id: string, ts: number, corps: string, secret = SECRET) => `v1,${createHmac("sha256", secret).update(`${id}.${ts}.${corps}`).digest("base64")}`;
const entetes = (id: string, ts: number, signature: string) => ({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signature });

describe("la signature des webhooks (Standard Webhooks)", () => {
  const ts = MIDI / 1000;

  it("une bonne signature passe, et rend l’identifiant de l’envoi ; signerWebhook écrit la même que le standard", () => {
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, vecteur("msg_1", ts, CORPS)), CORPS, MIDI)).toEqual({ id: "msg_1" });
    expect(signerWebhook(SECRET, "msg_1", CORPS, MIDI)).toEqual(entetes("msg_1", ts, vecteur("msg_1", ts, CORPS)));
    /* Des Headers comme un objet ; plusieurs signatures (le secret qui change), dont une bonne : elle passe */
    const h = new Headers(entetes("msg_1", ts, `v1,AAAA v2,autre ${vecteur("msg_1", ts, CORPS)}`));
    expect(verifierWebhook(SECRET, h, CORPS, MIDI)).toEqual({ id: "msg_1" });
  });

  it("la clé est la chaîne entière du secret, pas son base64 décodé", () => {
    const sansPrefixe = createHmac("sha256", Buffer.from(SECRET.slice(3), "base64"))
      .update(`msg_1.${ts}.${CORPS}`)
      .digest("base64");
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, `v1,${sansPrefixe}`), CORPS, MIDI)).toEqual({ refus: "signature" });
  });

  it("une mauvaise signature est refusée : un autre secret, un corps touché, un autre envoi, une autre version", () => {
    const refus = { refus: "signature" };
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, vecteur("msg_1", ts, CORPS, "ws_un_autre_secret")), CORPS, MIDI)).toEqual(refus);
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, vecteur("msg_1", ts, CORPS)), CORPS.replace("pay_1", "pay_2"), MIDI)).toEqual(refus);
    /* Le corps relu puis réécrit (une espace de plus) n’est plus le même */
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, vecteur("msg_1", ts, CORPS)), `${CORPS} `, MIDI)).toEqual(refus);
    expect(verifierWebhook(SECRET, entetes("msg_2", ts, vecteur("msg_1", ts, CORPS)), CORPS, MIDI)).toEqual(refus);
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, vecteur("msg_1", ts, CORPS).replace("v1,", "v2,")), CORPS, MIDI)).toEqual(refus);
    expect(verifierWebhook(SECRET, entetes("msg_1", ts, "v1,"), CORPS, MIDI)).toEqual(refus);
  });

  it("trop vieille (ou d’un futur trop lointain) : refusée, à 5 minutes près", () => {
    const signe = (t: number) => entetes("msg_1", t, vecteur("msg_1", t, CORPS));
    expect(verifierWebhook(SECRET, signe(ts - TOLERANCE_WEBHOOK_S), CORPS, MIDI)).toEqual({ id: "msg_1" });
    expect(verifierWebhook(SECRET, signe(ts - TOLERANCE_WEBHOOK_S - 1), CORPS, MIDI)).toEqual({ refus: "heure" });
    expect(verifierWebhook(SECRET, signe(ts + TOLERANCE_WEBHOOK_S + 1), CORPS, MIDI)).toEqual({ refus: "heure" });
  });

  it("rejouée : une bonne signature rejouée plus de 5 minutes après ne passe plus ; changer son heure la casse", () => {
    const capture = entetes("msg_1", ts, vecteur("msg_1", ts, CORPS));
    expect(verifierWebhook(SECRET, capture, CORPS, MIDI + 60_000)).toEqual({ id: "msg_1" });
    expect(verifierWebhook(SECRET, capture, CORPS, MIDI + 6 * 60_000)).toEqual({ refus: "heure" });
    /* Rajeunie à la main : la signature porte sur l’heure, elle ne colle plus */
    expect(verifierWebhook(SECRET, { ...capture, "webhook-timestamp": String(ts + 360) }, CORPS, MIDI + 6 * 60_000)).toEqual({ refus: "signature" });
    /* Rejouée dans les 5 minutes, elle passe : c’est son identifiant qui la fait ignorer (evenements_paiement, tests/paiement.test.ts) */
  });

  it("un en-tête qui manque ou mal formé : refusé avant tout calcul", () => {
    const bon = entetes("msg_1", ts, vecteur("msg_1", ts, CORPS));
    for (const casse of [{ "webhook-id": "" }, { "webhook-timestamp": "" }, { "webhook-timestamp": "12h" }, { "webhook-signature": "" }])
      expect(verifierWebhook(SECRET, { ...bon, ...casse }, CORPS, MIDI), JSON.stringify(casse)).toEqual({ refus: "entetes" });
    expect(verifierWebhook(SECRET, new Headers(), CORPS, MIDI)).toEqual({ refus: "entetes" });
  });
});

/** Un paiement tel que Whop le décrit, avec ce qui change. */
const paiement = (champs: Record<string, unknown> = {}) => ({
  id: "pay_abc",
  status: "paid",
  metadata: { achat: "0b7e3f4c-0000-4000-8000-000000000001" },
  checkout_configuration_id: "ch_1",
  total: { amount: "9.90", currency: "eur", decimals: 2 },
  subtotal: { amount: "8.25", currency: "eur", decimals: 2 },
  currency: "eur",
  member_id: "mber_1",
  payment_method_id: "payt_1",
  auto_refunded: false,
  ...champs,
});
const webhook = (type: string, data: unknown, compte = "biz_1") => ({ id: "evt_1", type, timestamp: "2026-10-12T12:00:00Z", account_id: compte, data });

describe("ce que dit un paiement de Whop", () => {
  it("lu : l’achat de ses métadonnées, les montants en centimes, la devise, le membre et le moyen gardé", () => {
    expect(lirePaiementWhop(paiement())).toEqual({
      id: "pay_abc",
      statut: "paid",
      achat: "0b7e3f4c-0000-4000-8000-000000000001",
      total: 990,
      sousTotal: 825,
      devise: "eur",
      checkoutId: "ch_1",
      membreId: "mber_1",
      moyenId: "payt_1",
      autoRembourse: false,
    });
  });

  it("d’une autre forme de l’API : des nombres, la devise sur le total, le membre en objet ; un achat qui n’est pas un uuid est ignoré", () => {
    const p = lirePaiementWhop({
      id: "pay_x",
      status: "PAID",
      total: 14.9,
      currency: undefined,
      member: { id: "mber_2" },
      payment_method: { id: "payt_2" },
      metadata: { achat: "pas-un-uuid" },
    });
    expect(p).toMatchObject({ statut: "paid", total: 1490, sousTotal: null, devise: null, membreId: "mber_2", moyenId: "payt_2", achat: null });
    expect(lirePaiementWhop({ ...paiement(), total: { amount: "4.90", currency: "EUR" }, currency: null })).toMatchObject({ total: 490, devise: "eur" });
    expect(lirePaiementWhop({ id: "pas un id" })).toBeNull();
    expect(lirePaiementWhop(null)).toBeNull();
  });

  it("le montant colle : la devise de l’achat, et son prix en TTC (ou en hors taxe, si Whop a ajouté la taxe) ; sinon, non", () => {
    const achat = { centimes: 990, devise: "eur" };
    expect(montantJuste({ total: 990, sousTotal: 825, devise: "eur" }, achat)).toBe(true);
    expect(montantJuste({ total: 1188, sousTotal: 990, devise: "eur" }, achat)).toBe(true);
    /* Montant faux : moins cher (un plan touché chez Whop), une autre devise, ou rien de lisible */
    expect(montantJuste({ total: 690, sousTotal: 575, devise: "eur" }, achat)).toBe(false);
    expect(montantJuste({ total: 990, sousTotal: null, devise: "usd" }, achat)).toBe(false);
    expect(montantJuste({ total: null, sousTotal: null, devise: "eur" }, achat)).toBe(false);
  });
});

describe("ce que demande chaque webhook", () => {
  const p = lirePaiementWhop(paiement())!;

  it("payment.succeeded livre ; remboursé d’office (auto_refunded), il reprend ; payment.failed fait échouer", () => {
    expect(lireWebhook(webhook("payment.succeeded", paiement()))).toEqual({ type: "payment.succeeded", compte: "biz_1", action: { faire: "livrer", paiement: p } });
    expect(lireWebhook(webhook("payment.succeeded", paiement({ auto_refunded: true })))?.action).toEqual({
      faire: "reprendre",
      statut: "rembourse",
      paiementId: "pay_abc",
      achat: "0b7e3f4c-0000-4000-8000-000000000001",
    });
    expect(lireWebhook(webhook("payment.failed", paiement({ status: "failed" })))?.action).toEqual({ faire: "echouer", paiement: { ...p, statut: "failed" } });
  });

  it("un remboursement reprend quand il est fait ; un litige ouvert reprend tout de suite, mis à jour seulement perdu", () => {
    const reprise = (statut: "rembourse" | "conteste") => ({ faire: "reprendre", statut, paiementId: "pay_abc", achat: null });
    expect(lireWebhook(webhook("refund.created", { id: "rfnd_1", status: "succeeded", payment_id: "pay_abc" }))?.action).toEqual(reprise("rembourse"));
    expect(lireWebhook(webhook("refund.updated", { id: "rfnd_1", status: "succeeded", payment: { id: "pay_abc" } }))?.action).toEqual(reprise("rembourse"));
    expect(lireWebhook(webhook("refund.created", { id: "rfnd_1", status: "pending", payment_id: "pay_abc" }))?.action).toMatchObject({ faire: "rien" });
    expect(lireWebhook(webhook("dispute.created", { id: "dspt_1", status: "needs_response", payment_id: "pay_abc" }))?.action).toEqual(reprise("conteste"));
    expect(lireWebhook(webhook("dispute.updated", { id: "dspt_1", status: "lost", payment_id: "pay_abc" }))?.action).toEqual(reprise("conteste"));
    expect(lireWebhook(webhook("dispute.updated", { id: "dspt_1", status: "won", payment_id: "pay_abc" }))?.action).toMatchObject({ faire: "rien" });
    /* Sans le paiement : rien à reprendre */
    expect(lireWebhook(webhook("refund.created", { id: "rfnd_1", status: "succeeded" }))?.action).toMatchObject({ faire: "rien" });
  });

  it("le reste ne fait rien (une alerte de litige, un paiement en attente, un événement inconnu) ; une enveloppe illisible : null", () => {
    for (const type of ["dispute_alert.created", "payment.pending", "membership.activated"])
      expect(lireWebhook(webhook(type, paiement()))?.action, type).toMatchObject({ faire: "rien" });
    expect(lireWebhook(webhook("payment.succeeded", { pas: "un paiement" }))?.action).toMatchObject({ faire: "rien" });
    expect(lireWebhook({ data: {} })).toBeNull();
    expect(lireWebhook("texte")).toBeNull();
    /* Le compte qui l’envoie : account_id, sinon company_id, sinon rien */
    expect(lireWebhook({ type: "x", company_id: "biz_2", data: {} })?.compte).toBe("biz_2");
    expect(lireWebhook({ type: "x", data: {} })?.compte).toBeNull();
  });
});

describe("le client de l’API de Whop, sur un faux fetch", () => {
  const config: ConfigWhop = { cle: "cle_fictive", compte: "biz_1", produit: "prod_1", bacASable: false };
  /** Les appels reçus par le faux fetch : l’adresse, la méthode, les en-têtes, le corps. */
  const appels: { url: string; methode: string; entetes: Record<string, string>; corps: unknown }[] = [];
  const repondre = (status: number, corps: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        appels.push({ url, methode: init.method ?? "GET", entetes: init.headers as Record<string, string>, corps: init.body ? JSON.parse(init.body as string) : undefined });
        return new Response(JSON.stringify(corps), { status });
      }),
    );
  afterEach(() => {
    vi.unstubAllGlobals();
    appels.length = 0;
  });

  it("une configuration de paiement : le prix en ligne (en euros, une fois, caché), l’achat en métadonnées, la clé d’idempotence, la version épinglée", async () => {
    repondre(200, { id: "ch_1", purchase_url: "https://whop.com/checkout/ch_1/" });
    const achat = "0b7e3f4c-0000-4000-8000-000000000001";
    expect(await creerConfiguration(config, { achat, centimes: 990, retour: "https://www.askblush.com/paiement/retour?achat=x" })).toEqual({
      id: "ch_1",
      url: "https://whop.com/checkout/ch_1/",
    });
    expect(appels).toEqual([
      {
        url: "https://api.whop.com/api/v1/checkout_configurations",
        methode: "POST",
        entetes: expect.objectContaining({ authorization: "Bearer cle_fictive", "api-version-date": VERSION_API_WHOP, "idempotency-key": `configuration:${achat}` }),
        corps: {
          plan: { initial_price: 9.9, currency: "eur", plan_type: "one_time", product_id: "prod_1", visibility: "hidden" },
          metadata: { achat },
          redirect_url: "https://www.askblush.com/paiement/retour?achat=x",
        },
      },
    ]);
  });

  it("le bac à sable a son adresse ; sans purchase_url, la page se déduit de l’id", async () => {
    repondre(200, { id: "ch_2" });
    expect(await creerConfiguration({ ...config, bacASable: true }, { achat: "a", centimes: 500, retour: "r" })).toEqual({
      id: "ch_2",
      url: "https://sandbox.whop.com/checkout/ch_2/",
    });
    expect(appels[0]!.url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
  });

  it("un refus de Whop : ErreurWhop avec son seul statut (« whop_401 ») ; une réponse illisible aussi", async () => {
    repondre(401, { error: "la clé, ses détails" });
    const e = await creerConfiguration(config, { achat: "a", centimes: 990, retour: "r" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurWhop);
    expect(e).toMatchObject({ code: "whop_401", statut: 401 });
    expect(String((e as Error).message)).not.toContain("clé");
    repondre(200, { pas: "un id" });
    await expect(creerConfiguration(config, { achat: "a", centimes: 990, retour: "r" })).rejects.toMatchObject({ code: "whop_illisible" });
  });

  it("lire un paiement : lu ; introuvable (404), ou un id qui n’est pas un paiement : null, sans appel pour ce dernier", async () => {
    repondre(200, paiement());
    expect(await lirePaiement(config, "pay_abc")).toMatchObject({ id: "pay_abc", total: 990 });
    expect(appels[0]).toMatchObject({ url: "https://api.whop.com/api/v1/payments/pay_abc", methode: "GET" });
    repondre(404, { error: "not_found" });
    expect(await lirePaiement(config, "pay_abc")).toBeNull();
    const avant = appels.length;
    expect(await lirePaiement(config, "../comptes")).toBeNull();
    expect(appels).toHaveLength(avant);
  });

  it("le paiement en un geste : le moyen gardé du membre, à sa demande (off_session faux) ; la page de la 3-D Secure si la banque la demande", async () => {
    repondre(200, { id: "pay_2", status: "paid" });
    const demande = { achat: "a1", centimes: 500, membre: "mber_1", moyen: "payt_1", retour: "https://www.askblush.com/paiement/retour?achat=a1" };
    expect(await payerEnUnGeste(config, demande)).toEqual({ id: "pay_2", confirmer: null });
    expect(appels[0]).toMatchObject({
      url: "https://api.whop.com/api/v1/payments",
      entetes: expect.objectContaining({ "idempotency-key": "paiement:a1" }),
      corps: {
        account_id: "biz_1",
        member_id: "mber_1",
        payment_method_id: "payt_1",
        off_session: false,
        return_url: demande.retour,
        metadata: { achat: "a1" },
        plan: expect.objectContaining({ initial_price: 5 }),
      },
    });
    repondre(200, { id: "pay_3", status: "requires_action", next_action: { type: "redirect", redirect_to_url: { url: "https://banque.example/3ds" } } });
    expect(await payerEnUnGeste(config, demande)).toEqual({ id: "pay_3", confirmer: "https://banque.example/3ds" });
  });

  it("Whop qui ne répond pas : ErreurWhop « whop_delai »", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("délai", "TimeoutError");
      }),
    );
    await expect(lirePaiement(config, "pay_abc")).rejects.toMatchObject({ code: "whop_delai" });
  });
});
