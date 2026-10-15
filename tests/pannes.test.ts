import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";
import { empreinte } from "@/server/chiffrement";
import { PANNE } from "@/server/compteurs";
import { db, schema } from "@/server/db";
import { signalerUnePanne } from "@/server/pannes";
import { statsAdmin } from "@/server/stats";

/*
 * Les pannes du serveur (OPS-2, src/server/pannes.ts) : comptées par lieu et par jour (counters, « panne:<lieu> »), la
 * première du jour d’un lieu à l’équipe, sans le message de l’erreur, et la carte Santé d’/admin qui les lit. Les pages
 * passent par onRequestError (src/instrumentation.ts) ; les routes /api par l’enveloppe `route` (tests/unit/http.test.ts).
 * En local (sans RESEND_API_KEY), une alerte qui part s’écrit dans la console (console.log). Chaque test a ses propres
 * lieux (un uuid : un lieu jamais vu, donc sa première panne du jour), et le budget du jour des deux sujets est remis à
 * zéro avant chaque test : les fichiers déjà passés ont pu en compter.
 */
const BUDGETS = ["alertes", "alertes:sujet:page en panne", "alertes:sujet:route /api en panne"].map((c) => empreinte(`limite:${c}`));
const PREFIXE = "/essai-des-pannes/";

let parties: string[] = [];
beforeEach(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, BUDGETS));
  parties = [];
  vi.spyOn(console, "log").mockImplementation((l: unknown) => void parties.push(String(l)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
/* Les compteurs de ces lieux d’essai ne restent pas dans la base des tests */
afterAll(() =>
  db()
    .delete(schema.counters)
    .where(like(schema.counters.key, `${PANNE}${PREFIXE}%`)),
);

const lieuNeuf = () => `${PREFIXE}${randomUUID()}`;
const compteDuJour = async (lieu: string) =>
  (
    await db()
      .select()
      .from(schema.counters)
      .where(eq(schema.counters.key, `${PANNE}${lieu}`))
  )[0]?.count ?? 0;
const alertes = (sujet: string) => parties.filter((l) => l.includes(`BLUSH · ${sujet}\n`));

/** Une erreur comme celles de Drizzle : son message cite ses paramètres (un email), son code est celui de Postgres. */
const erreurSql = () => Object.assign(new Error("Failed query: insert into users\nparams: lea@exemple.test"), { name: "DrizzleQueryError", code: "23505" });

describe("une panne : comptée, et la première du jour à l’équipe", () => {
  it("trois pannes d’une route : un compte de 3 pour le jour, un seul mail, avec la route, le nom et le code, jamais le message", async () => {
    const lieu = lieuNeuf();
    for (let i = 0; i < 3; i++) await signalerUnePanne(lieu, erreurSql(), "route");
    expect(await compteDuJour(lieu)).toBe(3);
    const [mail, ...autres] = alertes("route /api en panne");
    expect(autres).toEqual([]);
    expect(mail).toContain(`Route : ${lieu}`);
    expect(mail).toContain("Erreur : DrizzleQueryError (23505)");
    expect(mail).not.toContain("exemple.test");
    expect(mail).not.toContain("Failed query");
  });

  it("deux pannes en même temps : une seule lit 1, un seul mail", async () => {
    const lieu = lieuNeuf();
    await Promise.all([signalerUnePanne(lieu, erreurSql(), "route"), signalerUnePanne(lieu, erreurSql(), "route")]);
    expect(await compteDuJour(lieu)).toBe(2);
    expect(alertes("route /api en panne")).toHaveLength(1);
  });

  it("chaque lieu a sa première panne du jour ; un genre ne prend pas le budget de l’autre", async () => {
    const [a, b] = [lieuNeuf(), lieuNeuf()];
    await signalerUnePanne(a, new TypeError("x"), "route");
    await signalerUnePanne(b, new TypeError("x"), "route");
    await signalerUnePanne(a, new TypeError("x"), "page");
    expect(alertes("route /api en panne")).toHaveLength(2);
    /* Le même fichier, compté une fois pour tous les genres : sa deuxième panne du jour */
    expect(alertes("page en panne")).toHaveLength(0);
  });

  it("une alerte qui échoue ne fait rien échouer, et ne relance pas d’alerte (pas de boucle)", async () => {
    const lieu = lieuNeuf();
    /* La sortie de l’alerte qui lève : en local la console, en ligne le prestataire des mails */
    vi.mocked(console.log).mockImplementation(() => {
      throw new Error("sortie en panne");
    });
    const journal = vi.mocked(console.error);
    await expect(signalerUnePanne(lieu, erreurSql(), "route")).resolves.toBeUndefined();
    expect(await compteDuJour(lieu)).toBe(1);
    const lignes = journal.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(lignes).toEqual([expect.objectContaining({ evenement: "alerte non envoyée", sujet: "route /api en panne" })]);
  });
});

describe("une page qui plante (onRequestError)", () => {
  const requete = { path: "/rapport?x=lea@exemple.test", method: "GET", headers: {} };
  const contexte = (routePath: string) => ({ routerKind: "App Router" as const, routePath, routeType: "render" as const, revalidateReason: undefined });

  it("comptée sous le fichier de la page (jamais l’adresse demandée), et à l’équipe avec son empreinte", async () => {
    const lieu = lieuNeuf();
    await onRequestError(Object.assign(new Error("Ines a écrit…"), { digest: "1200394217" }), requete, contexte(lieu));
    expect(await compteDuJour(lieu)).toBe(1);
    const [mail] = alertes("page en panne");
    expect(mail).toContain(`Page : ${lieu}`);
    expect(mail).toContain("Empreinte : 1200394217");
    expect(mail).not.toContain("Ines");
    expect(mail).not.toContain("exemple.test");
  });

  it("une page quittée par le navigateur n’est pas une panne : une ligne « info », ni compte, ni mail", async () => {
    const lieu = lieuNeuf();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await onRequestError(new Error("The destination stream closed early."), requete, contexte(lieu));
    expect(await compteDuJour(lieu)).toBe(0);
    expect(parties).toEqual([]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({ evenement: "requête abandonnée", niveau: "info", route: lieu, code: "abandon" });
  });
});

describe("la carte Santé d’/admin", () => {
  it("les pannes du jour et de la période, et leurs lieux", async () => {
    const avant = await statsAdmin(7);
    const lieu = lieuNeuf();
    for (let i = 0; i < 4; i++) await signalerUnePanne(lieu, new TypeError("x"), "route");
    const apres = await statsAdmin(7);
    expect(apres.pilotage.sante.pannes - avant.pilotage.sante.pannes).toBe(4);
    expect(apres.pilotage.sante.pannesDuJour - avant.pilotage.sante.pannesDuJour).toBe(4);
    expect(apres.sante.pannes).toContainEqual({ lieu, n: 4 });
    /* Sur 24 h : celles d’aujourd’hui */
    expect((await statsAdmin(1)).pilotage.sante.pannes).toBe(apres.pilotage.sante.pannesDuJour);
  });
});
