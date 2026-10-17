import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Utilisateur } from "@/server/auth";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { empreinte } from "@/server/chiffrement";
import { plafondsDesMails } from "@/server/limites";
import { mailRelance } from "@/server/mail-relance";
import { DELAI_RELANCE_MS, desinscrire, envoyerLesRelances, FRAICHEUR_RELANCE_MS, lienDesinscription } from "@/server/relances";
import { compteDeTest, convRattachee, debloquerLaConv, histoireLue } from "./aide/fixtures";

/*
 * La relance par mail (l’offre unique ②, src/server/relances.ts) : deux heures après une feuille de paiement fermée
 * sans payer (la ① montrée) ou une commande restée en attente, une fois par compte, jamais pour un rapport payé, jamais
 * après la désinscription, dans le plafond des relances du jour. Sans clé de Resend, un mail qui part s’écrit dans les
 * logs (« [dev] mail « sujet » pour email ») : c’est là qu’on le compte. Les moments sont fabriqués en base (l’heure de
 * la ① montrée, de la commande), sans attendre.
 */

const SECRET = "secret-fictif-des-relances-du-test";
const EQUIPE = { email: "" };
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), CRON_SECRET: SECRET }), accesLibre: (email: string) => email === EQUIPE.email || m.accesLibre(email) };
});

/* Le relais de la chaîne, que la même route lance pour les chaînes en plan : jamais vers le vrai site depuis les tests */
vi.mock("@/server/relais", () => ({ RELAIS_MAX: 5, passerLaMain: async () => false }));

/* Le prestataire des mails, en panne pour certaines adresses : un statut de Resend, ou pas de réponse (le réseau) */
const pannes = vi.hoisted(() => new Map<string, number | "reseau">());
vi.mock("@/server/email", async (original) => {
  const m = await original<typeof import("@/server/email")>();
  return {
    ...m,
    envoyerMail: async (...args: Parameters<typeof m.envoyerMail>) => {
      const panne = typeof args[0] === "string" ? pannes.get(args[0]) : undefined;
      if (panne === "reseau") throw new TypeError("fetch failed");
      if (panne) throw new m.ErreurResend(panne);
      return m.envoyerMail(...args);
    },
  };
});

import { GET as getRelances } from "@/app/api/cron/relances/route";

/* Le compteur des relances du jour (plafondsDesMails().relances) : la base des tests le garde d’un lancement à l’autre */
const RELANCES_DU_JOUR = empreinte("limite:relances:mails");
const poserLeCompteur = (count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key: RELANCES_DU_JOUR, windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });

/* Une conv lue (son verdict), dont les convs des comptes du test prennent le verdict : la lire une fois suffit */
let verdictLu: Buffer;
beforeAll(async () => {
  const lecteur = await compteDeTest("relance-lecteur");
  const lue = await histoireLue(lecteur, "01-a-deux-doigts.txt");
  verdictLu = (await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, lue.id)))[0]!.data;
  await poserLeCompteur(0);
}, 60_000);
afterEach(async () => {
  pannes.clear();
  await poserLeCompteur(0);
});

/** Un compte et une conv lue (son verdict), sans rapport débloqué. `alerte` : le verdict lève une alerte (le mode sobre). */
async function compteAvecConv(prefixe: string, { alerte = false } = {}): Promise<{ u: Utilisateur; conv: string }> {
  const u = await compteDeTest(prefixe);
  const imp = await convRattachee(u, "01-a-deux-doigts.txt");
  let data = verdictLu;
  if (alerte) {
    const v = coffre.lire("verdicts.data", verdictLu);
    data = coffre.ecrire("verdicts.data", { ...v, sortie: { ...v.sortie, alerte: "danger", mode_sobre: true } });
  }
  await db().insert(schema.verdicts).values({ storyId: imp.id, data });
  return { u, conv: imp.id };
}

const ilYa = (ms: number) => new Date(Date.now() - ms);
const HEURES = 3600e3;

/** La feuille de paiement fermée sans payer, il y a `ms` : l’offre ① montrée pour cette conv (5 minutes), pas prise. */
const feuilleFermee = (u: Utilisateur, conv: string, ms = 3 * HEURES) =>
  db()
    .insert(schema.offresUniques)
    .values({ userId: u.id, offre: "suite", storyId: conv, montreeLe: ilYa(ms), expireLe: ilYa(ms - 5 * 60e3) });

/** Une commande du rapport de cette conv restée en attente, passée il y a `ms`. */
const commandeEnAttente = (u: Utilisateur, conv: string, ms = 3 * HEURES) =>
  db()
    .insert(schema.achats)
    .values({ userId: u.id, storyId: conv, offre: "rapport", centimes: 990, bulles: 10, fournisseur: "factice", creeLe: ilYa(ms) });

/** Les relances parties vers cet email pendant `etape` (les logs du mode sans clé de Resend). */
async function relancesPour(email: string, etape: () => Promise<unknown>): Promise<number> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await etape();
    return log.mock.calls.flat().filter((l) => String(l) === `[dev] mail « Ton rapport t’attend » pour ${email}`).length;
  } finally {
    log.mockRestore();
  }
}

/** La relance notée pour ce compte (offres_uniques, « relance_mail »), ou null. */
const relanceNotee = async (u: Utilisateur) =>
  (
    await db()
      .select({ storyId: schema.offresUniques.storyId })
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "relance_mail")))
  )[0] ?? null;

describe("la relance par mail (②)", () => {
  it("une conv qui attend son paiement (le paywall d’abord, sans verdict) : la relance part ; sans verdict ni paiement attendu, non", async () => {
    const u = await compteDeTest("relance-paywall");
    const conv = (await convRattachee(u, "01-a-deux-doigts.txt")).id;
    await feuilleFermee(u, conv);
    /* Ni verdict, ni « Qui es-tu ? » envoyé : rien à relancer */
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(0);
    await db()
      .delete(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "relance_mail")));
    await db().insert(schema.tasks).values({ storyId: conv, kind: "verdict", status: "paiement" });
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(1);
    expect(await relanceNotee(u)).toEqual({ storyId: conv });
  });

  it("deux heures après la ① montrée sans paiement : « Ton rapport t’attend », une seule fois par compte, pour la bonne conv", async () => {
    const { u, conv } = await compteAvecConv("relance-feuille");
    await feuilleFermee(u, conv);
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(1);
    expect(await relanceNotee(u)).toEqual({ storyId: conv });
    /* Rejouée, rien ne repart ; une autre conv du même compte, plus tard, non plus */
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(0);
    const autre = await convRattachee(u, "01-a-deux-doigts.txt");
    await db().insert(schema.verdicts).values({ storyId: autre.id, data: verdictLu });
    await commandeEnAttente(u, autre.id);
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(0);
  });

  it("une commande du rapport restée en attente deux heures : la relance part aussi", async () => {
    const { u, conv } = await compteAvecConv("relance-commande");
    await commandeEnAttente(u, conv);
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(1);
    expect(await relanceNotee(u)).toEqual({ storyId: conv });
  });

  it("ni avant deux heures, ni pour un moment trop ancien (plus de 48 h) : rien ne part, rien n’est noté", async () => {
    const tot = await compteAvecConv("relance-tot");
    await feuilleFermee(tot.u, tot.conv, DELAI_RELANCE_MS - 10 * 60e3);
    const vieux = await compteAvecConv("relance-vieux");
    await commandeEnAttente(vieux.u, vieux.conv, FRAICHEUR_RELANCE_MS + HEURES);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await envoyerLesRelances();
    const pour = (e: string) => log.mock.calls.flat().filter((l) => String(l).includes(`pour ${e}`)).length;
    expect([pour(tot.u.email), pour(vieux.u.email)]).toEqual([0, 0]);
    log.mockRestore();
    expect([await relanceNotee(tot.u), await relanceNotee(vieux.u)]).toEqual([null, null]);
  });

  it("jamais pour un rapport payé (ou offert) : ni la conv débloquée, ni un achat payé pour elle", async () => {
    const debloquee = await compteAvecConv("relance-debloquee");
    await feuilleFermee(debloquee.u, debloquee.conv);
    await debloquerLaConv(debloquee.conv);
    const payee = await compteAvecConv("relance-payee");
    await commandeEnAttente(payee.u, payee.conv);
    /* Payée par une autre commande (la page de Whop rouverte), le webhook pas encore passé sur la conv */
    await db()
      .insert(schema.achats)
      .values({ userId: payee.u.id, storyId: payee.conv, offre: "premium", centimes: 1490, bulles: 90, fournisseur: "factice", statut: "paye", payeLe: new Date() });
    expect(await relancesPour(debloquee.u.email, envoyerLesRelances)).toBe(0);
    expect(await relancesPour(payee.u.email, envoyerLesRelances)).toBe(0);
    expect([await relanceNotee(debloquee.u), await relanceNotee(payee.u)]).toEqual([null, null]);
  });

  it("jamais pour une conv en alerte (le mode sobre), ni à l’équipe", async () => {
    const alerte = await compteAvecConv("relance-alerte", { alerte: true });
    await feuilleFermee(alerte.u, alerte.conv);
    const equipe = await compteAvecConv("relance-equipe");
    EQUIPE.email = equipe.u.email;
    await commandeEnAttente(equipe.u, equipe.conv);
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const passage = await envoyerLesRelances();
      expect(log.mock.calls.flat().filter((l) => String(l).includes(alerte.u.email) || String(l).includes(equipe.u.email))).toEqual([]);
      log.mockRestore();
      expect(passage.ecartees).toBeGreaterThanOrEqual(2);
      expect([await relanceNotee(alerte.u), await relanceNotee(equipe.u)]).toEqual([null, null]);
    } finally {
      EQUIPE.email = "";
    }
  });

  it("jamais après la désinscription : le lien signé du mail coupe les relances du compte, un autre lien ne fait rien", async () => {
    const { u, conv } = await compteAvecConv("relance-desinscrit");
    const lien = new URL(lienDesinscription(u.id));
    expect(lien.pathname).toBe("/desinscription");
    const [id, cle] = [lien.searchParams.get("id")!, lien.searchParams.get("cle")!];
    expect(id).toBe(u.id);
    /* La clé d’un autre compte, ou une clé faite à la main : refusées, rien ne change */
    const autre = new URL(lienDesinscription((await compteDeTest("relance-autre")).id)).searchParams.get("cle")!;
    for (const fausse of [autre, "pas-la-bonne-cle", ""]) expect(await desinscrire(id, fausse)).toBe(false);
    const coupe = async () => (await db().select({ le: schema.users.relancesCoupeesLe }).from(schema.users).where(eq(schema.users.id, u.id)))[0]!.le;
    expect(await coupe()).toBeNull();
    expect(await desinscrire(id, cle)).toBe(true);
    const le = await coupe();
    expect(le).toBeInstanceOf(Date);
    /* Le lien retouché : toujours vrai, l’heure reste la première */
    expect(await desinscrire(id, cle)).toBe(true);
    expect(await coupe()).toEqual(le);
    await feuilleFermee(u, conv);
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(0);
    expect(await relanceNotee(u)).toBeNull();
  });

  it("dans le plafond des relances du jour : au plafond, la relance attend sans être notée, et repart au passage suivant", async () => {
    const { max } = plafondsDesMails().relances;
    const a = await compteAvecConv("relance-plafond-a");
    const b = await compteAvecConv("relance-plafond-b");
    await feuilleFermee(a.u, a.conv);
    await feuilleFermee(b.u, b.conv);
    await poserLeCompteur(max - 1);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const passage = await envoyerLesRelances();
    const pour = (e: string) => log.mock.calls.flat().filter((l) => String(l) === `[dev] mail « Ton rapport t’attend » pour ${e}`).length;
    /* Une seule part (la dernière place du jour), l’autre attend : retenue, et pas notée */
    expect(pour(a.u.email) + pour(b.u.email)).toBe(1);
    expect(passage.retenues).toBeGreaterThanOrEqual(1);
    const notees = [await relanceNotee(a.u), await relanceNotee(b.u)].filter(Boolean);
    expect(notees).toHaveLength(1);
    /* Le compteur reste au plafond (la place refusée est rendue) */
    const [compteur] = await db().select({ count: schema.rateLimits.count }).from(schema.rateLimits).where(eq(schema.rateLimits.key, RELANCES_DU_JOUR));
    expect(compteur?.count).toBe(max);
    /* Le lendemain (le compteur repart à zéro) : l’autre part */
    await poserLeCompteur(0);
    await envoyerLesRelances();
    expect(pour(a.u.email) + pour(b.u.email)).toBe(2);
    log.mockRestore();
    expect([await relanceNotee(a.u), await relanceNotee(b.u)].filter(Boolean)).toHaveLength(2);
  });

  it("le prestataire qui freine (429), en panne (5xx) ou sans la clé : la relance n’est pas partie, elle repart au passage suivant", async () => {
    for (const statut of [429, 503, 401]) {
      const { u, conv } = await compteAvecConv(`relance-freine-${statut}`);
      await feuilleFermee(u, conv);
      pannes.set(u.email, statut);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const passage = await envoyerLesRelances();
      log.mockRestore();
      expect(passage.retenues, String(statut)).toBeGreaterThanOrEqual(1);
      expect(await relanceNotee(u), String(statut)).toBeNull();
      pannes.delete(u.email);
      expect(await relancesPour(u.email, envoyerLesRelances), String(statut)).toBe(1);
    }
  });

  it("une adresse refusée (422), ou un mail perdu en route (il a pu partir) : la relance compte comme faite, rien ne repart", async () => {
    for (const panne of [422, "reseau"] as const) {
      const { u, conv } = await compteAvecConv(`relance-refusee-${panne}`);
      await feuilleFermee(u, conv);
      pannes.set(u.email, panne);
      vi.spyOn(console, "log").mockImplementation(() => {});
      const passage = await envoyerLesRelances();
      vi.mocked(console.log).mockRestore();
      expect(passage.echecs, String(panne)).toBeGreaterThanOrEqual(1);
      expect(await relanceNotee(u), String(panne)).toEqual({ storyId: conv });
      pannes.delete(u.email);
      expect(await relancesPour(u.email, envoyerLesRelances), String(panne)).toBe(0);
    }
  });

  it("les relances écartées (des alertes) ne prennent la place de personne : au-delà de 50, la relance due part quand même", async () => {
    const { u, conv } = await compteAvecConv("relance-place");
    await feuilleFermee(u, conv);
    /* 50 comptes aux convs en alerte, plus anciens, et rangés avant tous les autres (leurs ids commencent par des zéros) */
    const [modele] = await db().select({ meta: schema.stories.meta, n: schema.stories.messageCount }).from(schema.stories).where(eq(schema.stories.id, conv));
    const v = coffre.lire("verdicts.data", verdictLu);
    const alerte = coffre.ecrire("verdicts.data", { ...v, sortie: { ...v.sortie, alerte: "danger", mode_sobre: true } });
    const ids = Array.from({ length: 50 }, (_, k) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`);
    await db().delete(schema.users).where(inArray(schema.users.id, ids));
    try {
      await db()
        .insert(schema.users)
        .values(ids.map((id, k) => ({ id, email: `relance-ecartee-${Date.now()}-${k}@blush.test` })));
      const convs = await db()
        .insert(schema.stories)
        .values(ids.map((userId) => ({ userId, meta: modele!.meta, messageCount: modele!.n })))
        .returning({ id: schema.stories.id, userId: schema.stories.userId });
      await db()
        .insert(schema.verdicts)
        .values(convs.map((c) => ({ storyId: c.id, data: alerte })));
      await db()
        .insert(schema.offresUniques)
        .values(convs.map((c) => ({ userId: c.userId!, offre: "suite" as const, storyId: c.id, montreeLe: ilYa(10 * HEURES), expireLe: ilYa(10 * HEURES - 5 * 60e3) })));
      expect(await relancesPour(u.email, envoyerLesRelances)).toBe(1);
    } finally {
      await db().delete(schema.users).where(inArray(schema.users.id, ids));
    }
  });

  it("le mail : le lien de la conv sur la feuille de paiement, le lien de désinscription, rien de la conv", () => {
    const m = mailRelance({
      base: "https://www.askblush.com",
      lien: "https://www.askblush.com/ouvrir/abc?paiement=1",
      desinscription: "https://www.askblush.com/desinscription?id=u1&cle=k1",
    });
    expect(m.sujet).toBe("Ton rapport t’attend");
    expect(m.html).toContain('href="https://www.askblush.com/ouvrir/abc?paiement=1"');
    expect(m.html).toContain('href="https://www.askblush.com/desinscription?id=u1&amp;cle=k1"');
    expect(m.texte).toContain("https://www.askblush.com/ouvrir/abc?paiement=1");
    expect(m.texte).toContain("https://www.askblush.com/desinscription?id=u1&cle=k1");
    expect(m.texte).toContain("Ce mail ne contient rien de ta conv");
    /* Aucun prénom des convs de test, rien d’oublié */
    for (const morceau of ["Maëlys", "Hugo", "undefined", "null"]) expect(`${m.sujet}${m.texte}${m.html}`).not.toContain(morceau);
  });

  it("la route : le secret CRON_SECRET seulement, et des nombres seulement (les logs de la veille sont publics)", async () => {
    const appel = (authorization?: string) => getRelances(new Request("http://localhost/api/cron/relances", { headers: authorization ? { authorization } : {} }));
    for (const faux of [undefined, `Bearer ${SECRET.slice(0, -1)}`, SECRET, "Bearer "]) {
      const r = await appel(faux);
      expect([r.status, await r.json()], String(faux)).toEqual([401, { erreur: "interdit" }]);
    }
    const { u, conv } = await compteAvecConv("relance-route");
    await feuilleFermee(u, conv);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await appel(`Bearer ${SECRET}`);
    log.mockRestore();
    expect(r.status).toBe(200);
    const corps = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(corps).sort()).toEqual(["chaines", "dues", "ecartees", "echecs", "envoyees", "prises", "retenues", "sequences"]);
    expect(Object.values(corps).every((v) => typeof v === "number")).toBe(true);
    expect(corps.envoyees).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(corps)).not.toContain(u.email);
    expect(await relanceNotee(u)).toEqual({ storyId: conv });
  });
});

describe("la relance et la règle des 24 h des offres uniques", () => {
  it("seule la ① ne la retient pas : une ③ ou une ④ montrée dans les 24 h la fait attendre, puis elle part", async () => {
    const { u, conv } = await compteAvecConv("relance-apres-3");
    await commandeEnAttente(u, conv);
    await db()
      .insert(schema.offresUniques)
      .values({ userId: u.id, offre: "premium_ajout", montreeLe: ilYa(HEURES) });
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(0);
    expect(await relanceNotee(u)).toBeNull();
    /* 24 h plus tard (la commande, elle, reste fraîche) */
    await db()
      .update(schema.offresUniques)
      .set({ montreeLe: ilYa(25 * HEURES) })
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "premium_ajout")));
    expect(await relancesPour(u.email, envoyerLesRelances)).toBe(1);
  });

  it("après la relance, ni ③, ni ④, ni ① le jour même : jamais deux offres uniques dans les 24 h", async () => {
    const { montrer } = await import("@/server/offres-uniques");
    const { u, conv } = await compteAvecConv("relance-24h");
    await db()
      .insert(schema.offresUniques)
      .values({ userId: u.id, offre: "relance_mail", storyId: conv, montreeLe: sql`now()` });
    expect(await montrer(u, "premium_ajout")).toBeNull();
    expect(await montrer(u, "premiere_recharge")).toBeNull();
    expect(await montrer(u, "suite", { storyId: conv })).toBeNull();
    await db()
      .update(schema.offresUniques)
      .set({ montreeLe: ilYa(25 * HEURES) })
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "relance_mail")));
    expect(await montrer(u, "premium_ajout")).toMatchObject({ offre: "premium_ajout" });
  });
});
