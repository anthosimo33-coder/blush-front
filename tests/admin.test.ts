import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Utilisateur } from "@/server/auth";
import * as coffre from "@/server/coffre";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { plafondsDesMails } from "@/server/limites";
import type { OffreId } from "@/types";
import { compteDeTest, convRattachee } from "./aide/fixtures";

/*
 * /admin (src/server/stats.ts, src/server/equipe.ts, src/server/attente.ts) : les chiffres de l’argent sur des achats et
 * des bulles fabriqués en base (comptés en écart, avant et après : la base des tests garde ceux des autres fichiers),
 * les gestes de l’équipe (des bulles, un rapport offert, des invitations, chacun noté au journal de l’équipe), la route
 * POST /api/admin (réservée à BLUSH_ADMINS), et les invités de la liste qui entrent en bêta fermée sans être de l’équipe.
 */

const etat = vi.hoisted(() => ({
  /** Le compte de la session (contexteRequete) */
  utilisateur: null as Utilisateur | null,
  /** Les emails de BLUSH_ADMINS */
  admins: new Set<string>(),
  /** Bêta fermée : seuls entrent par la variable les emails de `equipe` (peutEntrer) */
  fermee: false,
  equipe: new Set<string>(),
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return {
    ...m,
    estAdmin: (email: string) => etat.admins.has(email),
    peutEntrer: (email: string) => !etat.fermee || etat.equipe.has(email),
  };
});
vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  contexteRequete: async () => ({ utilisateur: etat.utilisateur, story: null }),
}));

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

import { POST as postAdmin } from "@/app/api/admin/route";
import { etatDeLaListe, inviterLaListe, purgerLaListe, ATTENTE_GARDEE_JOURS } from "@/server/attente";
import { actionsRecentes, debloquerDesConvs, donnerDesBulles } from "@/server/equipe";
import { entre, empreinteDeLaListe } from "@/server/invitations";
import { statsAdmin } from "@/server/stats";

afterEach(() => {
  pannes.clear();
  Object.assign(etat, { utilisateur: null, fermee: false });
  etat.admins.clear();
  etat.equipe.clear();
});

/* Le compteur du jour des mails de la liste (plafondsDesMails().attente) : la base des tests le garde d’un lancement à l’autre */
const MAILS_DE_LA_LISTE = empreinte("limite:attente:mails");
const poserLeCompteur = (count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key: MAILS_DE_LA_LISTE, windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });

const ilYa = (jours: number) => new Date(Date.now() - jours * 86400e3);

describe("les chiffres de l’argent (/admin)", () => {
  it("les ventes d’aujourd’hui et des 7 jours, en euros TTC : payé, remboursé, contesté, par offre", async () => {
    const avant = await statsAdmin(7);
    const u = await compteDeTest("admin-ventes");
    const achat = (offre: OffreId, centimes: number, plus: Partial<typeof schema.achats.$inferInsert> = {}) =>
      db()
        .insert(schema.achats)
        .values({ userId: u.id, offre, centimes, bulles: 10, fournisseur: "factice", ...plus });
    const maintenant = new Date();
    /* Aujourd’hui : deux rapports et un pack payés ; un rapport payé puis remboursé ; un premium payé puis contesté */
    await achat("rapport", 990, { statut: "paye", payeLe: maintenant });
    await achat("rapport", 990, { statut: "paye", payeLe: maintenant });
    await achat("pack80", 990, { statut: "paye", payeLe: maintenant });
    await achat("rapport", 990, { statut: "rembourse", payeLe: maintenant, annuleLe: maintenant });
    await achat("premium", 1490, { statut: "conteste", payeLe: maintenant, annuleLe: maintenant });
    /* Il y a trois jours : un pack payé (dans les 7 jours, pas aujourd’hui) ; il y a dix jours : rien sur 7 jours */
    await achat("pack200", 1990, { statut: "paye", payeLe: ilYa(3), creeLe: ilYa(3) });
    await achat("pack30", 490, { statut: "paye", payeLe: ilYa(10), creeLe: ilYa(10) });
    /* Jamais payés : une commande en attente, une échouée, une annulée sans avoir été payée (rien à reprendre) */
    await achat("rapport", 990);
    await achat("rapport", 990, { statut: "echoue", annuleLe: maintenant });
    await achat("suite", 690, { statut: "rembourse", annuleLe: maintenant });
    const apres = await statsAdmin(7);

    const ecart = (f: (s: typeof avant) => { n: number; centimes: number }) => ({ n: f(apres).n - f(avant).n, centimes: f(apres).centimes - f(avant).centimes });
    expect(ecart((s) => s.ventes.jour.payes)).toEqual({ n: 5, centimes: 990 * 4 + 1490 });
    expect(ecart((s) => s.ventes.jour.rembourses)).toEqual({ n: 1, centimes: 990 });
    expect(ecart((s) => s.ventes.jour.contestes)).toEqual({ n: 1, centimes: 1490 });
    expect(ecart((s) => s.ventes.semaine.payes)).toEqual({ n: 6, centimes: 990 * 4 + 1490 + 1990 });
    expect(ecart((s) => s.ventes.semaine.rembourses)).toEqual({ n: 1, centimes: 990 });
    /* Par offre, dans l’ordre du catalogue */
    const parOffre = (s: typeof avant, offre: OffreId) => s.ventes.semaine.parOffre.find((o) => o.offre === offre) ?? { n: 0, centimes: 0 };
    for (const [offre, n, centimes] of [
      ["rapport", 3, 2970],
      ["premium", 1, 1490],
      ["pack80", 1, 990],
      ["pack200", 1, 1990],
      ["pack30", 0, 0],
      ["suite", 0, 0],
    ] as const)
      expect({ n: parOffre(apres, offre).n - parOffre(avant, offre).n, centimes: parOffre(apres, offre).centimes - parOffre(avant, offre).centimes }, offre).toEqual({
        n,
        centimes,
      });
    const ordre = apres.ventes.semaine.parOffre.map((o) => o.offre);
    expect(ordre).toEqual(
      [...ordre].sort(
        (a, b) =>
          ["rapport", "premium", "suite", "premium_ajout", "pack30", "pack80", "pack200"].indexOf(a) -
          ["rapport", "premium", "suite", "premium_ajout", "pack30", "pack80", "pack200"].indexOf(b),
      ),
    );

    /* L’entonnoir de la période : les commandes d’un rapport créées dans les 7 jours (pas les recharges), et ce qu’elles sont devenues */
    const a = (s: typeof avant) => s.achats;
    expect({
      commandes: a(apres).commandes - a(avant).commandes,
      payees: a(apres).payees - a(avant).payees,
      enAttente: a(apres).enAttente - a(avant).enAttente,
      echouees: a(apres).echouees - a(avant).echouees,
      comptes: a(apres).comptes - a(avant).comptes,
    }).toEqual({ commandes: 7, payees: 4, enAttente: 1, echouees: 1, comptes: 1 });
  });

  it("les bulles : vendues, dépensées, offertes, rendues, d’après leur journal ; et les offres uniques montrées puis prises", async () => {
    const avant = await statsAdmin(7);
    const u = await compteDeTest("admin-bulles");
    const mouvement = (delta: number, raison: (typeof schema.mouvementsBulles.$inferInsert)["raison"], k: number, creeLe = new Date()) =>
      db()
        .insert(schema.mouvementsBulles)
        .values({ userId: u.id, delta, raison, ref: `admin-test:${u.id}:${raison}:${k}`, creeLe });
    await mouvement(90, "achat", 1);
    await mouvement(10, "achat", 2, ilYa(2));
    await mouvement(-1, "reponse", 1);
    await mouvement(-2, "reponse", 2);
    await mouvement(1, "rendu", 1);
    await mouvement(100, "beta", 1);
    await mouvement(50, "equipe", 1);
    /* Une bulle retirée par l’équipe n’est pas « offerte » ; une reprise (remboursement) n’est rien de tout ça */
    await mouvement(-5, "equipe", 2);
    await mouvement(-10, "remboursement", 1);
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    await db()
      .insert(schema.offresUniques)
      .values([
        { userId: u.id, offre: "suite", storyId: conv.id, priseLe: new Date() },
        { userId: u.id, offre: "relance_mail", storyId: conv.id },
        { userId: u.id, offre: "premiere_recharge", montreeLe: ilYa(20) },
      ]);
    const apres = await statsAdmin(7);
    const ecart = (f: (s: typeof avant) => number) => f(apres) - f(avant);
    expect([ecart((s) => s.bulles.jour.vendues), ecart((s) => s.bulles.semaine.vendues)]).toEqual([90, 100]);
    expect(ecart((s) => s.bulles.semaine.depensees)).toBe(3);
    expect(ecart((s) => s.bulles.semaine.rendues)).toBe(1);
    expect(ecart((s) => s.bulles.semaine.offertes)).toBe(150);
    const offre = (s: typeof avant, o: string) => s.offresUniques.find((l) => l.offre === o)!;
    expect(apres.offresUniques.map((l) => l.offre)).toEqual(["suite", "relance_mail", "premium_ajout", "premiere_recharge"]);
    expect([ecart((s) => offre(s, "suite").montrees), ecart((s) => offre(s, "suite").prises)]).toEqual([1, 1]);
    expect([ecart((s) => offre(s, "relance_mail").montrees), ecart((s) => offre(s, "relance_mail").prises)]).toEqual([1, 0]);
    /* Montrée il y a 20 jours : hors des 7 jours, dans les 30 */
    expect(ecart((s) => offre(s, "premiere_recharge").montrees)).toBe(0);
    expect((await statsAdmin(30)).offresUniques.find((l) => l.offre === "premiere_recharge")!.montrees).toBeGreaterThanOrEqual(1);
  });
});

describe("les gestes de l’équipe", () => {
  it("donner des bulles par email : le solde et le journal des bulles, noté au journal de l’équipe (qui, pour qui, combien) ; un email sans compte : rien", async () => {
    const admin = await compteDeTest("admin-qui");
    const u = await compteDeTest("admin-recoit");
    expect(await donnerDesBulles("personne-ici@blush.test", 10, admin.id)).toBeNull();
    const r = await donnerDesBulles(` ${u.email.toUpperCase()} `, 25, admin.id);
    expect(r?.solde).toBe(25);
    const mouvements = await db().select().from(schema.mouvementsBulles).where(eq(schema.mouvementsBulles.userId, u.id));
    expect(mouvements).toEqual([expect.objectContaining({ delta: 25, raison: "equipe", ref: r!.ref })]);
    const [action] = await db().select().from(schema.actionsEquipe).where(eq(schema.actionsEquipe.compteId, u.id));
    expect(action).toMatchObject({ action: "bulles", parId: admin.id, nombre: 25 });
    /* Depuis le terminal (sans compte de l’équipe) : noté comme tel */
    await donnerDesBulles(u.email, -5, null);
    expect((await actionsRecentes(1))[0]).toMatchObject({ action: "bulles", nombre: -5, depuisLeTerminal: true });
  });

  it("débloquer le rapport : la dernière conv, toutes, ou une seule (le terminal) ; rien à débloquer ne note rien", async () => {
    const admin = await compteDeTest("admin-qui-debloque");
    const u = await compteDeTest("admin-debloque");
    const premiere = await convRattachee(u, "01-a-deux-doigts.txt");
    const seconde = await convRattachee(u, "01-a-deux-doigts.txt");
    const troisieme = await convRattachee(u, "01-a-deux-doigts.txt");
    const ouvertes = async () =>
      (
        await db()
          .select({ id: schema.stories.id })
          .from(schema.stories)
          .where(and(eq(schema.stories.userId, u.id), isNotNull(schema.stories.debloqueLe)))
      ).map((s) => s.id);
    expect(await debloquerDesConvs("personne-ici@blush.test", "derniere", admin.id)).toBeNull();
    expect(await debloquerDesConvs(u.email, "derniere", admin.id)).toEqual({ convs: [troisieme.id] });
    expect(await debloquerDesConvs(u.email, { conv: premiere.id }, null)).toEqual({ convs: [premiere.id] });
    expect((await ouvertes()).sort()).toEqual([premiere.id, troisieme.id].sort());
    expect(await debloquerDesConvs(u.email, "toutes", admin.id)).toEqual({ convs: [seconde.id] });
    expect(await debloquerDesConvs(u.email, "toutes", admin.id)).toEqual({ convs: [] });
    /* La conv d’un autre compte ne se débloque pas par cet email */
    const autre = await compteDeTest("admin-autre");
    const sienne = await convRattachee(autre, "01-a-deux-doigts.txt");
    expect(await debloquerDesConvs(u.email, { conv: sienne.id }, null)).toEqual({ convs: [] });
    const notees = await db()
      .select({ nombre: schema.actionsEquipe.nombre, par: schema.actionsEquipe.parId })
      .from(schema.actionsEquipe)
      .where(eq(schema.actionsEquipe.compteId, u.id))
      .orderBy(schema.actionsEquipe.id);
    expect(notees).toEqual([
      { nombre: 1, par: admin.id },
      { nombre: 1, par: null },
      { nombre: 1, par: admin.id },
    ]);
  });
});

describe("POST /api/admin", () => {
  const appel = (corps: unknown, entetes: Record<string, string> = { origin: "http://localhost", host: "localhost" }) =>
    postAdmin(new Request("http://localhost/api/admin", { method: "POST", headers: { ...entetes, "content-type": "application/json" }, body: JSON.stringify(corps) }));

  it("réservée aux emails de BLUSH_ADMINS : sans session 401, un compte ordinaire 404 (la route n’existe pas pour lui), d’ailleurs 403", async () => {
    const u = await compteDeTest("admin-pas-admin");
    expect((await appel({ action: "bulles", email: u.email, n: 5 })).status).toBe(401);
    etat.utilisateur = u;
    const r = await appel({ action: "bulles", email: u.email, n: 5 });
    expect([r.status, await r.json()]).toEqual([404, { erreur: "introuvable" }]);
    etat.admins.add(u.email);
    expect((await appel({ action: "bulles", email: u.email, n: 5 }, { origin: "http://site-pirate.test", host: "localhost" })).status).toBe(403);
    /* Rien n’a bougé */
    expect((await db().select({ bulles: schema.users.bulles }).from(schema.users).where(eq(schema.users.id, u.id)))[0]!.bulles).toBe(0);
  });

  it("pour l’équipe : les trois gestes, des nombres en réponse ; un email ou un nombre mal formé refusés", async () => {
    const admin = await compteDeTest("admin-route");
    etat.utilisateur = admin;
    etat.admins.add(admin.email);
    const u = await compteDeTest("admin-route-recoit");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    const json = async (r: Response) => [r.status, await r.json()];
    expect(await json(await appel({ action: "bulles", email: u.email, n: 30 }))).toEqual([200, { action: "bulles", solde: 30 }]);
    expect(await json(await appel({ action: "bulles", email: "inconnu@blush.test", n: 30 }))).toEqual([200, { action: "bulles", solde: null }]);
    expect(await json(await appel({ action: "debloquer", email: u.email, cible: "derniere" }))).toEqual([200, { action: "debloquer", convs: 1 }]);
    expect((await db().select({ le: schema.stories.debloqueLe }).from(schema.stories).where(eq(schema.stories.id, conv.id)))[0]!.le).toBeInstanceOf(Date);
    expect(await json(await appel({ action: "debloquer", email: "inconnu@blush.test", cible: "toutes" }))).toEqual([200, { action: "debloquer", convs: null }]);
    expect(await json(await appel({ action: "bulles", email: "pas-un-email", n: 30 }))).toEqual([422, { erreur: "email" }]);
    for (const faux of [
      { action: "bulles", email: u.email, n: 0 },
      { action: "bulles", email: u.email, n: 1001 },
      { action: "inviter", n: 51 },
      { action: "effacer", email: u.email },
      {},
    ])
      expect(await json(await appel(faux)), JSON.stringify(faux)).toEqual([422, { erreur: "invalide" }]);
    const inviter = await appel({ action: "inviter", n: 1 });
    expect(inviter.status).toBe(200);
    expect(await inviter.json()).toEqual({
      action: "inviter",
      invites: expect.any(Number),
      restent: expect.any(Number),
      plafond: expect.any(Boolean),
      refusees: expect.any(Number),
      prestataire: expect.any(Boolean),
    });
  });
});

describe("inviter la liste d’attente", () => {
  /* Des inscrits plus anciens que tous les autres de la base des tests : ce sont eux que le lot prend d’abord */
  const inscrits = Array.from({ length: 3 }, (_, k) => `invite-liste-${Date.now()}-${k}@exemple.fr`);
  const hashes = inscrits.map(empreinteDeLaListe);
  beforeAll(async () => {
    await poserLeCompteur(0);
    await db()
      .insert(schema.waitlist)
      .values(
        inscrits.map((email, k) => ({
          emailHash: hashes[k]!,
          email: coffre.ecrire("waitlist.email", email),
          source: "accueil" as const,
          createdAt: new Date(Date.UTC(2001, 0, 1 + k)),
        })),
      );
  });
  afterAll(async () => {
    await db().delete(schema.waitlist).where(inArray(schema.waitlist.emailHash, hashes));
    await poserLeCompteur(0);
  });
  const invites = async () =>
    (
      await db()
        .select({ hash: schema.waitlist.emailHash })
        .from(schema.waitlist)
        .where(and(inArray(schema.waitlist.emailHash, hashes), isNotNull(schema.waitlist.inviteLe)))
    ).map((l) => hashes.indexOf(l.hash));

  it("en bêta fermée, un inscrit n’entre pas ; invité (le mail « Ta place est prête » parti), il entre, sans être de l’équipe", async () => {
    etat.fermee = true;
    expect(await entre(inscrits[0]!)).toBe(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const lot = await inviterLaListe(1);
    const mails = log.mock.calls.flat().map(String);
    log.mockRestore();
    expect(lot).toMatchObject({ invites: 1, plafond: false });
    expect(mails).toContain(`[dev] mail « Ta place BLUSH est prête » pour ${inscrits[0]}`);
    expect(await invites()).toEqual([0]);
    expect(await entre(inscrits[0]!)).toBe(true);
    expect(await entre(inscrits[0]!.toUpperCase())).toBe(true);
    expect(await entre(inscrits[1]!)).toBe(false);
    /* Bêta ouverte : tout le monde entre, invité ou pas */
    etat.fermee = false;
    expect(await entre(inscrits[1]!)).toBe(true);
  });

  it("par lots, dans le plafond des mails de la liste : au plafond, le lot s’arrête, et la personne reste à inviter", async () => {
    const { max } = plafondsDesMails().attente;
    await poserLeCompteur(max - 1);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const lot = await inviterLaListe(5);
    const mails = log.mock.calls.flat().map(String);
    log.mockRestore();
    /* La dernière place du jour pour le plus ancien pas encore invité, puis le plafond */
    expect(lot).toMatchObject({ invites: 1, plafond: true });
    expect(mails.filter((l) => l.startsWith("[dev] mail « Ta place BLUSH est prête »"))).toEqual([`[dev] mail « Ta place BLUSH est prête » pour ${inscrits[1]}`]);
    expect(await invites()).toEqual([0, 1]);
    expect((await etatDeLaListe()).mailsPossibles).toBe(0);
    /* Le lendemain : le suivant */
    await poserLeCompteur(0);
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await inviterLaListe(1)).toMatchObject({ invites: 1 });
    expect((await invites()).sort()).toEqual([0, 1, 2]);
  });

  it("la purge garde un invité un an après son invitation, pas après son inscription", async () => {
    const w = schema.waitlist;
    /* Inscrit il y a plus d’un an (2001), invité aujourd’hui : gardé */
    await purgerLaListe();
    expect(await db().select({ id: w.id }).from(w).where(eq(w.emailHash, hashes[0]!))).toHaveLength(1);
    /* Invité il y a plus d’un an : effacé */
    await db()
      .update(w)
      .set({ inviteLe: ilYa(ATTENTE_GARDEE_JOURS + 1) })
      .where(eq(w.emailHash, hashes[0]!));
    await purgerLaListe();
    expect(await db().select({ id: w.id }).from(w).where(eq(w.emailHash, hashes[0]!))).toHaveLength(0);
  });

  it("le tableau de bord le montre : les invités de la liste, et les derniers gestes de l’équipe", async () => {
    const s = await statsAdmin(7);
    expect(s.beta.attenteInvites).toBeGreaterThanOrEqual(2);
    expect(s.actions.length).toBeGreaterThan(0);
    const [derniere] = await db().select().from(schema.actionsEquipe).orderBy(desc(schema.actionsEquipe.id)).limit(1);
    expect(s.actions[0]).toMatchObject({ action: derniere!.action, nombre: derniere!.nombre });
  });
});

describe("inviter la liste d’attente quand le prestataire des mails refuse", () => {
  /* Plus anciens encore que ceux d’au-dessus (2000) : le lot les prend d’abord */
  const inscrits = Array.from({ length: 3 }, (_, k) => `invite-panne-${Date.now()}-${k}@exemple.fr`);
  const hashes = inscrits.map(empreinteDeLaListe);
  beforeAll(async () => {
    await poserLeCompteur(0);
    await db()
      .insert(schema.waitlist)
      .values(
        inscrits.map((email, k) => ({
          emailHash: hashes[k]!,
          email: coffre.ecrire("waitlist.email", email),
          source: "accueil" as const,
          createdAt: new Date(Date.UTC(2000, 0, 1 + k)),
        })),
      );
  });
  afterAll(async () => {
    await db().delete(schema.waitlist).where(inArray(schema.waitlist.emailHash, hashes));
    await poserLeCompteur(0);
  });
  const invite = async (k: number) =>
    (await db().select({ le: schema.waitlist.inviteLe }).from(schema.waitlist).where(eq(schema.waitlist.emailHash, hashes[k]!)))[0]?.le instanceof Date;
  const compteur = async () => (await db().select({ count: schema.rateLimits.count }).from(schema.rateLimits).where(eq(schema.rateLimits.key, MAILS_DE_LA_LISTE)))[0]?.count ?? 0;

  it("une adresse refusée (422) n’arrête pas le lot : elle sort de la liste (elle ne partirait jamais), sans prendre de place du jour, et les suivants partent", async () => {
    pannes.set(inscrits[0]!, 422);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const lot = await inviterLaListe(3);
    vi.mocked(console.log).mockRestore();
    expect(lot).toMatchObject({ invites: 2, refusees: 1, plafond: false, prestataire: false });
    expect([await invite(0), await invite(1), await invite(2)]).toEqual([false, true, true]);
    expect(await db().select({ id: schema.waitlist.id }).from(schema.waitlist).where(eq(schema.waitlist.emailHash, hashes[0]!))).toEqual([]);
    expect(await compteur()).toBe(2);
    /* Les tests suivants repartent de cette inscrite, toujours à inviter */
    pannes.delete(inscrits[0]!);
    await db()
      .insert(schema.waitlist)
      .values({ emailHash: hashes[0]!, email: coffre.ecrire("waitlist.email", inscrits[0]!), source: "accueil", createdAt: new Date(Date.UTC(2000, 0, 1)) });
  });

  it("le prestataire qui freine (429), en panne ou sans la clé : le lot s’arrête, la personne reste à inviter, et ce n’est pas « le plafond »", async () => {
    for (const statut of [429, 503, 403]) {
      pannes.set(inscrits[0]!, statut);
      const lot = await inviterLaListe(1);
      expect(lot, String(statut)).toMatchObject({ invites: 0, refusees: 0, plafond: false, prestataire: true });
      expect(await invite(0), String(statut)).toBe(false);
    }
    expect(await compteur()).toBe(2);
  });

  it("un mail perdu en route (pas de réponse) a pu partir : la personne reste invitée, sans second mail, et le lot s’arrête", async () => {
    pannes.set(inscrits[0]!, "reseau");
    const lot = await inviterLaListe(1);
    expect(lot).toMatchObject({ invites: 1, prestataire: true });
    expect(await invite(0)).toBe(true);
  });
});
