import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as postJalon } from "@/app/api/jalon/route";
import { POST as postPresence } from "@/app/api/presence/route";
import { NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { db, schema } from "@/server/db";
import { direct } from "@/server/direct";
import { purger } from "@/server/purge";
import { compterUnClicDeMail } from "@/server/compteurs";
import { CLES_DES_MAILS } from "@/server/sequences";
import { statsAdmin } from "@/server/stats";
import { aujourdhuiParis } from "@/server/temps";
import { noterAchatAuFil, noterAuFil, noterJalon, noterLaSourceDuCompte, noterSigne, sourceDeLaVisite } from "@/server/visites";
import type { OffreId } from "@/types";
import { compteDeTest, convRattachee } from "./aide/fixtures";

/*
 * Le pilotage d’/admin : les signes des onglets, les visites du jour (une par empreinte de connexion), le fil du direct,
 * la source d’un compte, et ce que le tableau de bord en tire. La base des tests garde tout d’un lancement à l’autre :
 * chaque test a ses propres adresses IP, et compare avant et après.
 */

const TIKTOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_36.5.0 BytedanceWebview/d8a21c6";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
/* Une adresse IP à ce test, jamais vue par un lancement d’avant */
const ipNeuve = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const LYON = { "x-vercel-ip-city": "Lyon", "x-vercel-ip-country": "FR", "x-vercel-ip-latitude": "45.75", "x-vercel-ip-longitude": "4.85" };

const requete = (ip: string, agent: string, entetes: Record<string, string> = {}, init: RequestInit = {}) =>
  new Request("http://localhost/api/presence", {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip, "user-agent": agent, ...entetes, ...(init.headers as Record<string, string>) },
  });

const visitesDuJour = async () => (await db().select().from(schema.visites).where(eq(schema.visites.jour, aujourdhuiParis().iso))).length;

describe("le signe des onglets (POST /api/presence)", () => {
  it("compte la visite du jour une fois par connexion, garde la source du premier signe, et nourrit le direct", async () => {
    const ip = ipNeuve();
    const onglet = randomUUID();
    const avant = await direct();
    const visites = await visitesDuJour();
    const reponse = await postPresence(
      requete(ip, TIKTOK, LYON, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ onglet, etape: "accueil", premier: true }) }),
    );
    expect(await reponse.json()).toEqual({ ok: true });
    expect(await visitesDuJour()).toBe(visites + 1);
    /* Le même onglet passe à l’import, avec un lien d’Instagram : il vient toujours de TikTok */
    await noterSigne(requete(ip, TIKTOK, LYON), { onglet, etape: "import", premier: false, utm: "instagram" });
    /* Un deuxième onglet de la même connexion : pas une nouvelle visite, ni une nouvelle arrivée */
    await noterSigne(requete(ip, TIKTOK, LYON), { onglet: randomUUID(), etape: "accueil", premier: true });
    expect(await visitesDuJour()).toBe(visites + 1);

    const apres = await direct();
    expect(apres.enLigne - avant.enLigne).toBe(2);
    const etape = (d: typeof avant, e: string) => d.etapes.find((l) => l.etape === e)!.n;
    expect(etape(apres, "import") - etape(avant, "import")).toBe(1);
    const tiktok = (d: typeof avant) => d.sources.find((l) => l.source === "tiktok")?.n ?? 0;
    expect(tiktok(apres) - tiktok(avant)).toBe(2);
    const lyon = (d: typeof avant) => d.villes.find((v) => v.ville === "Lyon")?.n ?? 0;
    expect(lyon(apres) - lyon(avant)).toBe(2);
    expect(apres.villes.find((v) => v.ville === "Lyon")).toMatchObject({ pays: "FR", lat: 45.75, lon: 4.85 });
    expect(apres.fil[0]).toMatchObject({ genre: "arrivee", ville: "Lyon", source: "tiktok" });
    expect(apres.fil.filter((g) => g.genre === "arrivee" && Date.parse(g.le) > Date.parse(avant.le))).toHaveLength(1);
    expect(apres.minutes).toHaveLength(30);
    expect(apres.minutes.at(-1)!.n).toBeGreaterThanOrEqual(2);
    expect(apres.record!.n).toBeGreaterThanOrEqual(2);
    expect(apres.jour.visiteurs).toBeGreaterThanOrEqual(1);
  });

  it("refuse un signe mal formé, et ne compte rien", async () => {
    const visites = await visitesDuJour();
    const mal = await postPresence(
      requete(
        ipNeuve(),
        SAFARI,
        {},
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ onglet: "pas-un-uuid", etape: "accueil", premier: true }) },
      ),
    );
    expect(mal.status).toBe(422);
    expect(await visitesDuJour()).toBe(visites);
  });
});

describe("les jalons du tunnel (POST /api/jalon)", () => {
  const jalon = (ip: string, corps: unknown, entetes: Record<string, string> = {}) =>
    postJalon(requete(ip, SAFARI, entetes, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }));

  it("compte une fois par jour et par connexion, et le pilotage les lit, chaque jalon à part", async () => {
    const avant = (await statsAdmin(1)).pilotage.jalons;
    const ip = ipNeuve();
    expect(await (await jalon(ip, { jalon: "fichier" })).json()).toEqual({ ok: true });
    /* La même connexion repasse (une page rechargée) : rien de plus */
    await jalon(ip, { jalon: "fichier" });
    await jalon(ip, { jalon: "importee" });
    /* Une autre connexion : une personne de plus */
    await jalon(ipNeuve(), { jalon: "fichier" });
    const p = (await statsAdmin(1)).pilotage;
    expect(p.jalons.fichier - avant.fichier).toBe(2);
    expect(p.jalons.importee - avant.importee).toBe(1);
    expect(p.jalons.paye - avant.paye).toBe(0);
    expect(p.jalonsDepuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(p.jalons)).toHaveLength(Object.keys(avant).length);
  });

  it("refuse un jalon inconnu, et ignore le mode tournage sans le dire", async () => {
    const avant = (await statsAdmin(1)).pilotage.jalons;
    expect((await jalon(ipNeuve(), { jalon: "inconnu" })).status).toBe(422);
    expect((await jalon(ipNeuve(), { jalon: "paye", en_plus: 1 })).status).toBe(422);
    const tournage = await jalon(ipNeuve(), { jalon: "paye" }, { cookie: `${NOMS_DU_TOURNAGE[0]}=lien` });
    expect(await tournage.json()).toEqual({ ok: true });
    expect((await statsAdmin(1)).pilotage.jalons.paye - avant.paye).toBe(0);
  });

  it("noterJalon note sans jamais faire échouer, même deux fois en même temps", async () => {
    const ip = ipNeuve();
    const avant = (await statsAdmin(1)).pilotage.jalons.whop;
    await Promise.all([noterJalon(requete(ip, SAFARI), "whop"), noterJalon(requete(ip, SAFARI), "whop")]);
    expect((await statsAdmin(1)).pilotage.jalons.whop - avant).toBe(1);
  });
});

describe("la source d’un compte et le fil du direct", () => {
  it("un compte créé reprend la source de sa visite du jour ; une autre connexion n’en a pas", async () => {
    const ip = ipNeuve();
    await noterSigne(requete(ip, SAFARI), { onglet: randomUUID(), etape: "accueil", premier: true, utm: "instagram" });
    expect(await sourceDeLaVisite(requete(ip, SAFARI))).toBe("instagram");
    expect(await sourceDeLaVisite(requete(ipNeuve(), SAFARI))).toBeNull();
    const u = await compteDeTest("pilotage-source");
    await noterLaSourceDuCompte(requete(ip, SAFARI), u.id);
    /* Une deuxième visite, d’ailleurs, ne change pas la source déjà notée */
    const autre = ipNeuve();
    await noterSigne(requete(autre, SAFARI), { onglet: randomUUID(), etape: "accueil", premier: true, utm: "tiktok" });
    await noterLaSourceDuCompte(requete(autre, SAFARI), u.id);
    const [l] = await db().select({ source: schema.users.source }).from(schema.users).where(eq(schema.users.id, u.id));
    expect(l!.source).toBe("instagram");
  });

  it("un achat payé reprend la ville de son paiement ouvert, et le prix qu’il a payé (pas celui du catalogue d’aujourd’hui)", async () => {
    const u = await compteDeTest("pilotage-fil-prix");
    /* Premium payé 14,90 €, avant la grille du 23 octobre 2026 (19,90 € depuis) */
    const [paye] = await db()
      .insert(schema.achats)
      .values({ userId: u.id, offre: "premium", centimes: 1490, bulles: 90, fournisseur: "factice", statut: "paye", payeLe: new Date() })
      .returning({ id: schema.achats.id });
    const achat = paye!.id;
    const debut = new Date();
    await noterAuFil(requete(ipNeuve(), SAFARI, LYON), { genre: "paiement", offre: "premium", ref: achat });
    await noterAchatAuFil({ id: achat, offre: "premium" });
    await noterAchatAuFil({ id: randomUUID(), offre: "pack80" });
    const gestes = (await direct()).fil.filter((g) => Date.parse(g.le) >= debut.getTime() - 1000);
    expect(gestes).toContainEqual(expect.objectContaining({ genre: "paiement", ville: "Lyon", offre: "premium" }));
    expect(gestes).toContainEqual({ genre: "achat", ville: "Lyon", offre: "premium", centimes: 1490, le: expect.any(String) });
    /* Un achat introuvable (ou noté avant que le fil garde sa ref) : sans prix, l’écran dit celui du catalogue */
    const sansAchat = gestes.find((g) => g.genre === "achat" && g.offre === "pack80");
    expect(sansAchat).toEqual({ genre: "achat", ville: null, offre: "pack80", le: expect.any(String) });
  });
});

describe("le pilotage (/admin)", () => {
  it("l’argent net, les acheteurs, les rachats, les sources et ce qui se vend, sur la période et celle d’avant", async () => {
    const avant = (await statsAdmin(7)).pilotage;
    const ip = ipNeuve();
    await noterSigne(requete(ip, SAFARI), { onglet: randomUUID(), etape: "accueil", premier: true, utm: "snapchat" });
    const u = await compteDeTest("pilotage-argent");
    await noterLaSourceDuCompte(requete(ip, SAFARI), u.id);
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    const maintenant = new Date();
    const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
    const achat = (offre: OffreId, centimes: number, plus: Partial<typeof schema.achats.$inferInsert> = {}) =>
      db()
        .insert(schema.achats)
        .values({ userId: u.id, offre, centimes, bulles: 10, fournisseur: "factice", statut: "paye", payeLe: maintenant, ...plus });
    await achat("premium", 1490, { storyId: conv.id });
    await achat("pack80", 990);
    await achat("rapport", 990, { statut: "rembourse", annuleLe: maintenant });
    /* La période d’avant : un rapport payé il y a 10 jours */
    await achat("rapport", 990, { payeLe: ilYa(10), creeLe: ilYa(10) });
    await achat("rapport", 990, { statut: "echoue", payeLe: null, annuleLe: maintenant });
    const apres = (await statsAdmin(7)).pilotage;

    const d = (f: (p: typeof avant) => number) => f(apres) - f(avant);
    expect(d((p) => p.payes.centimes)).toBe(1490 + 990 + 990);
    expect(d((p) => p.rembourses.centimes)).toBe(990);
    expect(d((p) => p.net.valeur)).toBe(1490 + 990);
    expect(d((p) => p.net.avant)).toBe(990);
    expect(d((p) => p.acheteurs.valeur)).toBe(1);
    expect(d((p) => p.tunnel.acheteurs)).toBe(1);
    expect(d((p) => p.tunnel.racheteurs)).toBe(1);
    expect(d((p) => p.tunnel.imports)).toBe(1);
    expect(d((p) => p.visiteurs.valeur)).toBe(1);
    expect(d((p) => p.sante.paiementsEchoues)).toBe(1);
    const snap = (p: typeof avant) => p.sources.find((s) => s.source === "snapchat") ?? { visiteurs: 0, acheteurs: 0, centimes: 0 };
    expect({ visiteurs: d((p) => snap(p).visiteurs), acheteurs: d((p) => snap(p).acheteurs), centimes: d((p) => snap(p).centimes) }).toEqual({
      visiteurs: 1,
      acheteurs: 1,
      centimes: 1490 + 990 + 990,
    });
    const groupe = (p: typeof avant, g: string) => p.mix.find((m) => m.groupe === g)!;
    expect(apres.mix.map((m) => m.groupe)).toEqual(["premium", "rapport", "suite", "second", "bulles"]);
    expect([d((p) => groupe(p, "premium").centimes), d((p) => groupe(p, "bulles").centimes), d((p) => groupe(p, "rapport").n)]).toEqual([1490, 990, 1]);
    /* Les cases : 7 jours de Paris, la dernière (aujourd’hui) a les achats d’aujourd’hui */
    expect(apres.pas).toBe("jour");
    expect(apres.cases).toHaveLength(7);
    expect(apres.cases.at(-1)!.centimes - (avant.cases.at(-1)?.centimes ?? 0)).toBe(1490 + 990 + 990);
    expect(apres.suiviDepuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(apres.iaDuJour.budget).toBeGreaterThan(0);
    const heures = (await statsAdmin(1)).pilotage;
    expect(heures.pas).toBe("heure");
    expect(heures.cases).toHaveLength(24);
    expect((await statsAdmin(30)).pilotage.cases).toHaveLength(30);
  });
});

describe("la purge garde peu", () => {
  it("les signes et le fil deux jours, les visites et les jalons 90 jours, le sel jusqu’au surlendemain", async () => {
    const vieux = new Date(Date.now() - 3 * 86400e3);
    const onglet = randomUUID();
    await db().insert(schema.presences).values({ onglet, minute: vieux, vuLe: vieux, etape: "accueil", source: "direct" });
    const [fil] = await db().insert(schema.filDirect).values({ genre: "import", le: vieux }).returning({ id: schema.filDirect.id });
    const tresVieux = new Date(Date.now() - 100 * 86400e3);
    const empreinte = `purge-${randomUUID()}`;
    await db()
      .insert(schema.visites)
      .values({ jour: tresVieux.toISOString().slice(0, 10), empreinte, source: "direct", arriveLe: tresVieux });
    await db()
      .insert(schema.jalons)
      .values([
        { jour: tresVieux.toISOString().slice(0, 10), empreinte, jalon: "paywall", le: tresVieux },
        { jour: aujourdhuiParis().iso, empreinte, jalon: "paywall" },
      ]);
    await db().insert(schema.selsDesVisites).values({ jour: "2001-01-01", sel: "x" }).onConflictDoNothing();
    await purger();
    expect(await db().select().from(schema.presences).where(eq(schema.presences.onglet, onglet))).toEqual([]);
    expect(await db().select().from(schema.filDirect).where(eq(schema.filDirect.id, fil!.id))).toEqual([]);
    expect(await db().select().from(schema.visites).where(eq(schema.visites.empreinte, empreinte))).toEqual([]);
    /* Le jalon de plus de 90 jours part, celui du jour reste */
    expect((await db().select().from(schema.jalons).where(eq(schema.jalons.empreinte, empreinte))).map((l) => l.jour)).toEqual([aujourdhuiParis().iso]);
    expect(await db().select().from(schema.selsDesVisites).where(eq(schema.selsDesVisites.jour, "2001-01-01"))).toEqual([]);
    /* Le sel du jour reste */
    expect(
      await db()
        .select()
        .from(schema.selsDesVisites)
        .where(and(eq(schema.selsDesVisites.jour, aujourdhuiParis().iso), gte(schema.selsDesVisites.jour, "2001-01-02"))),
    ).toHaveLength(1);
  });
});

describe("les mails des séquences (/admin)", () => {
  it("par mail : partis (sans les écartés), boutons touchés, et payés dans les 3 jours", async () => {
    const avant = (await statsAdmin(7)).pilotage.mails;
    const u = await compteDeTest("pilotage-mails");
    const autre = await compteDeTest("pilotage-mails-autre");
    const ilYa = (heures: number) => new Date(Date.now() - heures * 3600e3);
    await db()
      .insert(schema.envoisMails)
      .values([
        { userId: u.id, cle: "s3_repondre", occasion: "a", envoyeLe: ilYa(30) },
        { userId: autre.id, cle: "s3_repondre", occasion: "b", envoyeLe: ilYa(30) },
        { userId: autre.id, cle: "s3_pas", occasion: "c", parti: false, envoyeLe: ilYa(30) },
      ]);
    /* Le premier paie le lendemain du mail ; l’autre, rien */
    await db()
      .insert(schema.achats)
      .values({ userId: u.id, offre: "pack80", centimes: 1390, bulles: 80, fournisseur: "factice", statut: "paye", payeLe: ilYa(10) });
    await compterUnClicDeMail("s3_repondre");
    const apres = (await statsAdmin(7)).pilotage.mails;
    const de = (cle: string, l: typeof avant) => l.find((m) => m.cle === cle)!;
    expect(apres.map((m) => m.cle)).toEqual(CLES_DES_MAILS);
    expect(de("s3_repondre", apres).envoyes - de("s3_repondre", avant).envoyes).toBe(2);
    expect(de("s3_repondre", apres).payes - de("s3_repondre", avant).payes).toBe(1);
    expect(de("s3_repondre", apres).clics - de("s3_repondre", avant).clics).toBe(1);
    expect(de("s3_pas", apres).envoyes - de("s3_pas", avant).envoyes).toBe(0);
  });

  it("l’A/B de S1 J+6 : avec l’offre (le mail parti) ou sans (le témoin), et leurs rapports payés dans les 3 jours", async () => {
    const avant = (await statsAdmin(7)).pilotage.abDerniere;
    const avec = await compteDeTest("pilotage-ab-avec");
    const sans = await compteDeTest("pilotage-ab-sans");
    const conv = await convRattachee(avec, "01-a-deux-doigts.txt");
    const ilYa = (heures: number) => new Date(Date.now() - heures * 3600e3);
    await db()
      .insert(schema.envoisMails)
      .values([
        { userId: avec.id, cle: "s1_derniere", occasion: conv.id, envoyeLe: ilYa(30) },
        { userId: sans.id, cle: "s1_derniere", occasion: "x:temoin", parti: false, envoyeLe: ilYa(30) },
      ]);
    await db()
      .insert(schema.achats)
      .values({ userId: avec.id, storyId: conv.id, offre: "suite", centimes: 1090, bulles: 10, fournisseur: "factice", statut: "paye", payeLe: ilYa(5) });
    const apres = (await statsAdmin(7)).pilotage.abDerniere;
    expect([apres.avec.n - avant.avec.n, apres.avec.payes - avant.avec.payes, apres.sans.n - avant.sans.n, apres.sans.payes - avant.sans.payes]).toEqual([1, 1, 1, 0]);
  });
});
