import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La délivrabilité des mails (src/server/delivrabilite.ts), avec la base : le webhook de Resend par sa route
 * (POST /api/mails/resend : sa signature, un événement noté une fois, sans adresse), le bloc d’/admin (par sorte, par
 * domaine), l’alerte d’un seuil franchi (une par jour) et la purge. Les secrets du webhook et l’expéditeur des relances
 * sont posés par test ; after() de Next et les alertes sont relevés au lieu de partir. Seul ce fichier écrit dans
 * evenements_mails : chaque test la vide d’abord, et passe seul comme dans n’importe quel ordre.
 */
const etat = vi.hoisted(() => ({
  secrets: [] as string[],
  marketing: undefined as string | undefined,
  apres: [] as (() => unknown)[],
  alertes: [] as { sujet: string; lignes: string[]; importante: boolean }[],
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, env: () => ({ ...o.env(), RESEND_WEBHOOK_SECRET: etat.secrets, BLUSH_EMAIL_FROM_MARKETING: etat.marketing }) };
});
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[], { importante = false }: { importante?: boolean } = {}) => void etat.alertes.push({ sujet, lignes, importante }),
}));

import { POST as webhook } from "@/app/api/mails/resend/route";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { delivrabilite, verifierLesSeuils } from "@/server/delivrabilite";
import { signerWebhookResend } from "@/server/paiement/signature";
import { purger } from "@/server/purge";
import { compteDeTest } from "./aide/fixtures";

const SECRET = "whsec_c2VjcmV0IGR1IHdlYmhvb2sgZGUgUmVzZW5kIGRlcyB0ZXN0cw==";

beforeEach(async () => {
  Object.assign(etat, { secrets: [SECRET], marketing: undefined, apres: [], alertes: [] });
  await db().delete(schema.evenementsMails);
  await db()
    .delete(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte("limite:delivrabilite:alerte")));
});

/** Passe après la réponse ce que la route a confié à after() (la relecture des seuils). */
async function apresLaReponse(): Promise<void> {
  while (etat.apres.length) await etat.apres.shift()!();
}

/** Un événement de Resend, comme sa documentation le montre (`type` : « email.bounced »…), pour ces destinataires et ces tags. */
const evenement = (type: string, { to = ["quelquun@blush.test"], tags = { sorte: "code" } as unknown, le = new Date().toISOString() } = {}) =>
  JSON.stringify({
    type,
    created_at: le,
    data: { email_id: randomUUID(), from: "BLUSH <bonjour@askblush.com>", to, subject: "Un sujet", tags, bounce: { type: "Permanent", subType: "General", message: "…" } },
  });

/** Poste ce corps à la route, comme Resend (sans origine), signé de `secret` ; `id` : le svix-id (le même à chaque nouvel essai). */
const poster = (corps: string, { id = `msg_${randomUUID()}`, secret = SECRET, entetes }: { id?: string; secret?: string; entetes?: Record<string, string> } = {}) =>
  webhook(
    new Request("http://localhost/api/mails/resend", {
      method: "POST",
      headers: { "content-type": "application/json", ...(entetes ?? signerWebhookResend(secret, id, corps)) },
      body: corps,
    }),
  );

const lignes = () => db().select().from(schema.evenementsMails);

describe("le webhook de Resend (POST /api/mails/resend)", () => {
  it("signé : l’événement est noté une fois (le même svix-id rejoué ne compte pas deux fois), avec sa sorte et le compte, jamais l’adresse", async () => {
    const u = await compteDeTest("delivrabilite");
    const corps = evenement("email.delivered", { to: [u.email.toUpperCase()], tags: { sorte: "sequence-s1_haut" } });
    for (let k = 0; k < 2; k++) {
      const r = await poster(corps, { id: "msg_rejoue" });
      expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    }
    const l = await lignes();
    expect(l).toEqual([{ id: "msg_rejoue", le: expect.any(Date), type: "delivered", sorte: "sequence-s1_haut", compteId: u.id }]);
    expect(JSON.stringify(l)).not.toContain(u.email.split("@")[0]);
    /* Le compte effacé, l’événement reste, sans plus rien qui le relie à lui */
    await db().delete(schema.users).where(eq(schema.users.id, u.id));
    expect((await lignes())[0]!.compteId).toBeNull();
  });

  it("une adresse sans compte, des tags en liste, une sorte mal formée ou absente : noté quand même, la sorte « inconnue » au besoin", async () => {
    await poster(evenement("email.sent", { tags: [{ name: "sorte", value: "relance" }] }), { id: "msg_liste" });
    await poster(evenement("email.sent", { tags: { sorte: "pas une sorte !" } }), { id: "msg_mal" });
    await poster(evenement("email.sent", { tags: {} }), { id: "msg_sans" });
    const parId = Object.fromEntries((await lignes()).map((l) => [l.id, [l.sorte, l.compteId]]));
    expect(parId).toEqual({ msg_liste: ["relance", null], msg_mal: ["inconnue", null], msg_sans: ["inconnue", null] });
  });

  it("un événement qu’on ne garde pas (ouverture, clic, domaine) ou illisible : 200, rien de noté", async () => {
    for (const corps of [evenement("email.opened"), evenement("email.clicked"), JSON.stringify({ type: "domain.updated", data: {} }), "pas du json", "{}"]) {
      const r = await poster(corps);
      expect(r.status, corps).toBe(200);
    }
    expect(await lignes()).toEqual([]);
  });

  it("sans signature, une fausse, un autre secret, ou sans secret posé : 401 « interdit », rien de noté ; signé mais faux, l’équipe le sait", async () => {
    const corps = evenement("email.complained");
    const refus = async (r: Response) => expect([r.status, await r.json()]).toEqual([401, { erreur: "interdit" }]);
    await refus(await poster(corps, { entetes: {} }));
    await apresLaReponse();
    /* Sans ses en-têtes, un robot qui passe : le journal suffit */
    expect(etat.alertes).toEqual([]);
    await refus(await poster(corps, { secret: "whsec_dW4gYXV0cmUgc2VjcmV0" }));
    await apresLaReponse();
    expect(etat.alertes.map((a) => a.sujet)).toEqual(["mails : webhook de Resend refusé"]);
    /* Signé pour un autre corps */
    await refus(await poster(corps, { entetes: signerWebhookResend(SECRET, "msg_1", evenement("email.delivered")) }));
    etat.secrets = [];
    await refus(await poster(corps));
    expect(await lignes()).toEqual([]);
  });

  it("plusieurs secrets (un par compte Resend) : chacun signe", async () => {
    const autre = "whsec_dW4gc2Vjb25kIGNvbXB0ZSBSZXNlbmQgcG91ciBsZXMgY29kZXM=";
    etat.secrets = [SECRET, autre];
    expect((await poster(evenement("email.sent"), { secret: autre })).status).toBe(200);
    expect((await poster(evenement("email.sent"))).status).toBe(200);
    expect(await lignes()).toHaveLength(2);
  });

  it("un corps trop lourd : refusé avant d’être lu", async () => {
    const r = await poster(evenement("email.sent", { tags: { sorte: "code", rembourrage: "x".repeat(70 * 1024) } }));
    expect(r.status).toBe(422);
    expect(await lignes()).toEqual([]);
  });
});

describe("le bloc « Délivrabilité » d’/admin", () => {
  it("par sorte, par domaine et en tout, sur 7 jours ; les relances à part ; le dernier événement reçu", async () => {
    etat.marketing = "BLUSH <bonjour@news.askblush.com>";
    const vide = await delivrabilite();
    expect(vide).toMatchObject({ sortes: [], branche: true, dernier: null, domaines: { principal: "askblush.com", relances: "news.askblush.com" } });
    const il_y_a = (jours: number) => new Date(Date.now() - jours * 86400e3).toISOString();
    for (const [type, sorte] of [
      ["email.sent", "code"],
      ["email.sent", "code"],
      ["email.delivered", "code"],
      ["email.bounced", "code"],
      ["email.sent", "sequence-s2_heure"],
      ["email.delivered", "sequence-s2_heure"],
      ["email.complained", "sequence-s2_heure"],
      ["email.delivery_delayed", "relance"],
      ["email.suppressed", "relance"],
    ])
      await poster(evenement(type!, { tags: { sorte } }));
    /* Hors de la fenêtre : il ne compte pas, mais il reste le dernier reçu… s’il était le seul */
    await poster(evenement("email.bounced", { tags: { sorte: "attente" }, le: il_y_a(8) }));
    const d = await delivrabilite();
    expect(d.sortes).toEqual([
      { sorte: "code", partis: 2, delivres: 1, rebonds: 1, plaintes: 0, retards: 0, bloques: 0 },
      { sorte: "sequence-s2_heure", partis: 1, delivres: 1, rebonds: 0, plaintes: 1, retards: 0, bloques: 0 },
      { sorte: "relance", partis: 0, delivres: 0, rebonds: 0, plaintes: 0, retards: 1, bloques: 1 },
    ]);
    expect(d.principal).toEqual({ partis: 2, delivres: 1, rebonds: 1, plaintes: 0, retards: 0, bloques: 0 });
    expect(d.relances).toEqual({ partis: 1, delivres: 1, rebonds: 0, plaintes: 1, retards: 1, bloques: 1 });
    expect(d.total).toEqual({ partis: 3, delivres: 2, rebonds: 1, plaintes: 1, retards: 1, bloques: 1 });
    expect(Date.now() - Date.parse(d.dernier!)).toBeLessThan(60_000);
    /* Sans le sous-domaine, les relances partent du domaine principal : le bloc le dit ; sans secret, il n’est pas branché */
    etat.marketing = undefined;
    etat.secrets = [];
    expect(await delivrabilite()).toMatchObject({ branche: false, domaines: { principal: "askblush.com", relances: "askblush.com" } });
  });
});

describe("l’alerte d’un seuil franchi", () => {
  /** Note directement `n` événements de ce type pour cette sorte (sans passer par la route, qui relit les seuils à chaque rebond). */
  const noter = (n: number, type: (typeof schema.evenementsMails.$inferInsert)["type"], sorte = "code") =>
    db()
      .insert(schema.evenementsMails)
      .values(Array.from({ length: n }, () => ({ id: `msg_${randomUUID()}`, type, sorte })));

  it("une plainte suffit (au-delà des 0,08 % de Resend) : l’équipe est prévenue, sur Telegram aussi, une fois par jour au plus", async () => {
    await noter(40, "sent");
    await noter(40, "delivered");
    await noter(1, "complained", "relance");
    expect(await verifierLesSeuils()).toHaveLength(1);
    expect(etat.alertes).toEqual([{ sujet: "délivrabilité des mails", lignes: expect.any(Array), importante: true }]);
    const texte = etat.alertes[0]!.lignes.join("\n");
    expect(texte).toContain("1 sur 40 mails remis");
    expect(texte).toContain("relance (0 rebond, 1 plainte)");
    expect(texte).not.toContain("@");
    /* Le même jour, une seconde fois : pas de seconde alerte */
    expect(await verifierLesSeuils()).toHaveLength(1);
    expect(etat.alertes).toHaveLength(1);
  });

  it("les rebonds : jugés à partir de 50 mails partis, au seuil des 4 % ; dessous, rien", async () => {
    await noter(10, "sent");
    await noter(3, "bounced");
    /* 30 % de rebonds, mais sur 10 mails : pas jugé */
    expect(await verifierLesSeuils()).toEqual([]);
    await noter(90, "sent");
    /* 3 sur 100 : sous les 4 % */
    expect(await verifierLesSeuils()).toEqual([]);
    expect(etat.alertes).toEqual([]);
    await noter(1, "bounced", "sequence-s1_haut");
    expect(await verifierLesSeuils()).toEqual([expect.stringContaining("4 sur 100 mails partis")]);
    expect(etat.alertes).toHaveLength(1);
  });

  it("par la route : un rebond reçu relit les seuils après la réponse", async () => {
    await noter(1, "delivered");
    await noter(1, "complained");
    await poster(evenement("email.bounced"));
    expect(etat.alertes).toEqual([]);
    await apresLaReponse();
    expect(etat.alertes.map((a) => a.sujet)).toEqual(["délivrabilité des mails"]);
  });
});

it("la purge de la nuit efface les événements de plus de 30 jours, et garde les autres", async () => {
  const il_y_a = (jours: number) => new Date(Date.now() - jours * 86400e3);
  await db()
    .insert(schema.evenementsMails)
    .values([
      { id: "msg_vieux", type: "sent", sorte: "code", le: il_y_a(31) },
      { id: "msg_recent", type: "sent", sorte: "code", le: il_y_a(29) },
    ]);
  await purger();
  expect((await lignes()).map((l) => l.id)).toEqual(["msg_recent"]);
});
