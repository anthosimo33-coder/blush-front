import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/*
 * La purge de la nuit et sa route (S-35) : une étape qui échoue (la liste d’attente, simulée en panne quand `panne` le
 * dit) n’arrête pas les autres, et l’équipe reçoit une alerte (relevée ici au lieu de partir). La route compare son
 * secret (un secret de test) et résume la veille (simulé) même quand la purge a planté.
 */
const etat = vi.hoisted(() => ({ panne: false, alertes: [] as { sujet: string; lignes: string[]; importante: boolean }[], resumes: 0 }));
vi.mock("@/server/attente", async (original) => {
  const m = await original<typeof import("@/server/attente")>();
  return {
    ...m,
    purgerLaListe: (...a: Parameters<typeof m.purgerLaListe>) => (etat.panne ? Promise.reject(Object.assign(new Error("verrou"), { code: "55P03" })) : m.purgerLaListe(...a)),
  };
});
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[], o?: { importante?: boolean }) => void etat.alertes.push({ sujet, lignes, importante: !!o?.importante }),
}));
vi.mock("@/server/veille", () => ({ resumerLaVeille: async () => void etat.resumes++ }));
const SECRET = vi.hoisted(() => "un-secret-de-test-assez-long");
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), CRON_SECRET: SECRET }) };
});

import { GET as getPurge } from "@/app/api/cron/purge/route";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { cleDuMoisDeLaVoix, FENETRE_DU_MOIS } from "@/server/ia/voix";
import { compteDe, compter } from "@/server/limites";
import { purger } from "@/server/purge";

/*
 * La purge et les fenêtres des limites (S-13) : une clé ne part qu’après la fin de sa fenêtre (rate_limits.expires_at).
 * Avant, la purge effaçait toute clé de plus de deux jours : le compteur du mois de la voix (40 jours) repartait de zéro
 * chaque nuit, et son plafond ne bornait plus rien. Des clés à soi (un mois inventé, un suffixe unique), effacées à la
 * fin : les vraies clés du mois ne bougent pas.
 */
const id = randomUUID();
const MOIS = cleDuMoisDeLaVoix(`test-${id}`);
const ALERTE = `${MOIS}:alerte:0.8`;
const HEURE = `test:purge:heure:${id}`;
const ANCIENNE = `test:purge:ancienne:${id}`;
const RECENTE = `test:purge:recente:${id}`;
const empreintes = [MOIS, ALERTE, HEURE, ANCIENNE, RECENTE].map((c) => empreinte(`limite:${c}`));

afterAll(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, empreintes));
});

const ligneDe = async (cle: string) =>
  (
    await db()
      .select()
      .from(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte(`limite:${cle}`)))
  )[0];
const dansTroisJours = () => new Date(Date.now() + 3 * 86400e3);

describe("la purge et la fin des fenêtres (S-13)", () => {
  it("garde le compteur du mois de la voix et son alerte trois jours plus tard, efface une clé d’une heure", async () => {
    await compter(MOIS, FENETRE_DU_MOIS, 1234);
    await compter(ALERTE, FENETRE_DU_MOIS);
    await compter(HEURE, { fenetreS: 3600 });
    expect((await ligneDe(MOIS))?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 39 * 86400e3);

    await purger(dansTroisJours());

    expect(await compteDe(MOIS, FENETRE_DU_MOIS)).toBe(1234);
    expect(await compteDe(ALERTE, FENETRE_DU_MOIS)).toBe(1);
    expect(await ligneDe(HEURE)).toBeUndefined();
  });

  it("une fenêtre qui repart repousse sa fin", async () => {
    await compter(HEURE, { fenetreS: 3600 });
    /* La fenêtre d’une heure, finie depuis longtemps : le passage suivant la fait repartir, fin comprise */
    await db()
      .update(schema.rateLimits)
      .set({ windowStart: new Date(Date.now() - 2 * 3600e3), expiresAt: new Date(Date.now() - 3600e3) })
      .where(eq(schema.rateLimits.key, empreinte(`limite:${HEURE}`)));
    expect(await compter(HEURE, { fenetreS: 3600 })).toBe(1);
    const fin = (await ligneDe(HEURE))?.expiresAt?.getTime() ?? 0;
    expect(fin).toBeGreaterThan(Date.now() + 3500e3);
    expect(fin).toBeLessThan(Date.now() + 3700e3);
  });

  it("une ligne d’avant la colonne part après deux jours, comme avant, et reçoit sa fin au passage suivant", async () => {
    const maintenant = new Date();
    await db()
      .insert(schema.rateLimits)
      .values([
        { key: empreinte(`limite:${ANCIENNE}`), windowStart: new Date(maintenant.getTime() - 3 * 86400e3), count: 1 },
        { key: empreinte(`limite:${RECENTE}`), windowStart: new Date(maintenant.getTime() - 3600e3), count: 1 },
      ]);

    await purger(maintenant);

    expect(await ligneDe(ANCIENNE)).toBeUndefined();
    expect((await ligneDe(RECENTE))?.expiresAt).toBeNull();
    await compter(RECENTE, FENETRE_DU_MOIS);
    /* La fin est celle de la fenêtre déjà commencée, pas d’une nouvelle */
    expect((await ligneDe(RECENTE))?.expiresAt?.getTime()).toBe(maintenant.getTime() - 3600e3 + FENETRE_DU_MOIS.fenetreS * 1000);
  });
});

describe("la purge des webhooks de paiement déjà traités", () => {
  it("efface les lignes d’evenements_paiement de plus de 90 jours, garde les plus récentes", async () => {
    const maintenant = new Date();
    const il_y_a = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
    const ids = { vieux: `msg_test_vieux_${id}`, limite: `msg_test_limite_${id}`, recent: `msg_test_recent_${id}` };
    await db()
      .insert(schema.evenementsPaiement)
      .values([
        { id: ids.vieux, type: "payment.succeeded", recuLe: il_y_a(91) },
        { id: ids.limite, type: "payment.succeeded", recuLe: il_y_a(89) },
        { id: ids.recent, type: "refund.created", recuLe: il_y_a(1) },
      ]);
    try {
      await purger(maintenant);
      const restent = await db()
        .select({ id: schema.evenementsPaiement.id })
        .from(schema.evenementsPaiement)
        .where(inArray(schema.evenementsPaiement.id, Object.values(ids)));
      expect(restent.map((r) => r.id).sort()).toEqual([ids.limite, ids.recent].sort());
    } finally {
      await db()
        .delete(schema.evenementsPaiement)
        .where(inArray(schema.evenementsPaiement.id, Object.values(ids)));
    }
  });
});

describe("la purge de la nuit, étape par étape (S-35)", () => {
  afterEach(() => {
    etat.panne = false;
    etat.alertes = [];
    etat.resumes = 0;
  });

  it("une étape en panne n’arrête pas les suivantes : une ligne au journal, une alerte importante pour l’équipe", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    await compter(HEURE, { fenetreS: 3600 });
    etat.panne = true;
    await purger(dansTroisJours());
    /* La liste d’attente passe en dernier : les limites, avant elle, sont purgées */
    expect(await ligneDe(HEURE)).toBeUndefined();
    expect(etat.alertes).toEqual([
      { sujet: "purge de la nuit incomplète", lignes: [expect.stringContaining("Étapes en échec : liste d’attente."), expect.any(String)], importante: true },
    ]);
    const lignes = journal.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(lignes).toContainEqual(expect.objectContaining({ evenement: "purge : étape en échec", etape: "liste d’attente", code: "55P03" }));
    expect(JSON.stringify(lignes)).not.toContain("verrou");
  });

  it("sans panne, pas d’alerte", async () => {
    await purger();
    expect(etat.alertes).toEqual([]);
  });

  it("la route : le bon secret seulement, et le résumé de la veille à chaque purge", async () => {
    const appel = (authorization?: string) => getPurge(new Request("http://localhost/api/cron/purge", { headers: authorization ? { authorization } : {} }));
    for (const faux of [undefined, `Bearer ${SECRET.slice(0, -1)}`, `Bearer ${SECRET}x`, SECRET, "Bearer "]) expect((await appel(faux)).status, String(faux)).toBe(401);
    expect(etat.resumes).toBe(0);
    const r = await appel(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ brouillons: expect.any(Number), convs: expect.any(Number), sessions: expect.any(Number) });
    expect(etat.resumes).toBe(1);
  });
});
