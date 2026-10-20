import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signerWebhookResend, TOLERANCE_WEBHOOK_S, verifierWebhook, verifierWebhookResend } from "@/server/paiement/signature";

/*
 * La signature des webhooks de Resend (Svix : le standard des webhooks de Whop, avec les en-têtes svix-* et la clé
 * décodée du secret « whsec_… »), sans base ni réseau. Le premier vecteur est celui de la documentation de Svix
 * (« Verifying webhooks manually ») : il ne vient pas de la fonction testée.
 */

const SVIX = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  ts: 1614265330,
  corps: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const entetes = (id: string, ts: number, signature: string) => ({ "svix-id": id, "svix-timestamp": String(ts), "svix-signature": signature });

describe("la signature des webhooks de Resend (Svix)", () => {
  it("le vecteur de la documentation de Svix passe, et signerWebhookResend écrit le même", () => {
    expect(verifierWebhookResend([SVIX.secret], entetes(SVIX.id, SVIX.ts, SVIX.signature), SVIX.corps, SVIX.ts * 1000)).toEqual({ id: SVIX.id });
    expect(signerWebhookResend(SVIX.secret, SVIX.id, SVIX.corps, SVIX.ts * 1000)).toEqual(entetes(SVIX.id, SVIX.ts, SVIX.signature));
    /* Des Headers comme un objet ; plusieurs signatures, dont une bonne */
    const h = new Headers(entetes(SVIX.id, SVIX.ts, `v1,AAAA ${SVIX.signature}`));
    expect(verifierWebhookResend([SVIX.secret], h, SVIX.corps, SVIX.ts * 1000)).toEqual({ id: SVIX.id });
  });

  it("la clé est le secret décodé (pas sa chaîne, comme chez Whop) ; un webhook signé à la manière de Whop ne passe pas", () => {
    const commeWhop = `v1,${createHmac("sha256", SVIX.secret).update(`${SVIX.id}.${SVIX.ts}.${SVIX.corps}`).digest("base64")}`;
    expect(verifierWebhookResend([SVIX.secret], entetes(SVIX.id, SVIX.ts, commeWhop), SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "signature" });
    /* Et les en-têtes de Whop (webhook-*) ne sont pas ceux de Resend, ni l’inverse */
    const whop = { "webhook-id": SVIX.id, "webhook-timestamp": String(SVIX.ts), "webhook-signature": SVIX.signature };
    expect(verifierWebhookResend([SVIX.secret], whop, SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "entetes" });
    expect(verifierWebhook(SVIX.secret, entetes(SVIX.id, SVIX.ts, SVIX.signature), SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "entetes" });
  });

  it("plusieurs secrets (un par compte Resend) : l’un d’eux suffit ; aucun, ou un autre, refuse", () => {
    const autre = "whsec_dW4gYXV0cmUgc2VjcmV0IGRlIHRlc3QgcG91ciBSZXNlbmQ=";
    const h = entetes(SVIX.id, SVIX.ts, SVIX.signature);
    expect(verifierWebhookResend([autre, SVIX.secret], h, SVIX.corps, SVIX.ts * 1000)).toEqual({ id: SVIX.id });
    expect(verifierWebhookResend([autre], h, SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "signature" });
    expect(verifierWebhookResend([], h, SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "signature" });
    /* Un corps touché ne passe plus */
    expect(verifierWebhookResend([SVIX.secret], h, SVIX.corps.replace("2432232314", "2432232315"), SVIX.ts * 1000)).toEqual({ refus: "signature" });
  });

  it("trop vieux, ou sans ses en-têtes : refusé", () => {
    const h = entetes(SVIX.id, SVIX.ts, SVIX.signature);
    expect(verifierWebhookResend([SVIX.secret], h, SVIX.corps, (SVIX.ts + TOLERANCE_WEBHOOK_S + 1) * 1000)).toEqual({ refus: "heure" });
    expect(verifierWebhookResend([SVIX.secret], { "svix-id": SVIX.id }, SVIX.corps, SVIX.ts * 1000)).toEqual({ refus: "entetes" });
  });
});
