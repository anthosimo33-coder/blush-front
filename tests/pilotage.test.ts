import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as postJalon } from "@/app/api/jalon/route";
import { POST as postPresence } from "@/app/api/presence/route";
import { TRANCHES_DE_LONGUEUR, type TrancheDeLongueur } from "@/contenu/pilotage";
import { NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { db, schema } from "@/server/db";
import { direct } from "@/server/direct";
import { definirPronomAutre, importer } from "@/server/histoires";
import { purger } from "@/server/purge";
import { compterUnClicDeMail, HAUT } from "@/server/compteurs";
import { CLES_DES_MAILS } from "@/server/sequences";
import { statsAdmin, type Genres, type Pilotage } from "@/server/stats";
import { attendreLePaiement } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { noterAchatAuFil, noterAuFil, noterJalon, noterLaSourceDuCompte, noterSigne, sourceDeLaVisite } from "@/server/visites";
import { CLES_DES_APPLIS, JALONS_PAR_APPLI, type AppKind, type JalonParAppli, type OffreId } from "@/types";
import { accordDeTest, compteDeTest, convPrete, convRattachee, ligneEnBase } from "./aide/fixtures";

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

  it("ceux de l’import, appli par appli : une fois par jour et par appli, la même personne sous chaque appli qu’elle ouvre", async () => {
    const zero: Record<JalonParAppli, number> = { appli: 0, fichier: 0, envoi_rate: 0, importee: 0 };
    const lire = async () => {
      const p = (await statsAdmin(1)).pilotage;
      const de = (appli: AppKind) => p.jalonsParAppli.find((l) => l.appli === appli)?.jalons ?? zero;
      return { jalons: p.jalons, applis: p.jalonsParAppli.map((l) => l.appli), whatsapp: de("whatsapp"), autre: de("autre"), hinge: de("hinge") };
    };
    const ecart = (apres: Record<JalonParAppli, number>, avant: Record<JalonParAppli, number>) => Object.fromEntries(JALONS_PAR_APPLI.map((j) => [j, apres[j] - avant[j]]));
    const avant = await lire();
    const ip = ipNeuve();
    /* WhatsApp, un export trop court, puis des captures */
    for (const j of ["appli", "fichier", "envoi_rate"]) await jalon(ip, { jalon: j, appli: "whatsapp" });
    for (const j of ["appli", "fichier", "importee"]) await jalon(ip, { jalon: j, appli: "autre" });
    /* La page rechargée : rien de plus */
    await jalon(ip, { jalon: "appli", appli: "whatsapp" });
    /* Quelqu’un d’autre ouvre l’export WhatsApp, sans choisir de fichier */
    await jalon(ipNeuve(), { jalon: "appli", appli: "whatsapp" });
    /* L’appli d’un jalon qui n’est pas de l’import ne compte pas */
    await jalon(ipNeuve(), { jalon: "paywall", appli: "hinge" });
    const apres = await lire();
    expect(ecart(apres.whatsapp, avant.whatsapp)).toEqual({ appli: 2, fichier: 1, envoi_rate: 1, importee: 0 });
    expect(ecart(apres.autre, avant.autre)).toEqual({ appli: 1, fichier: 1, envoi_rate: 0, importee: 1 });
    expect(apres.hinge).toEqual(avant.hinge);
    /* Le tunnel, lui, compte chaque personne une fois par jalon, quelle que soit l’appli */
    expect(ecart(apres.jalons, avant.jalons)).toEqual({ appli: 2, fichier: 1, envoi_rate: 1, importee: 1 });
    expect(apres.jalons.paywall - avant.jalons.paywall).toBe(1);
    /* Les applis dans l’ordre de leur liste, seulement celles qui ont du monde */
    expect(apres.applis).toEqual(CLES_DES_APPLIS.filter((a) => apres.applis.includes(a)));
    expect(apres.applis).toEqual(expect.arrayContaining(["whatsapp", "autre"]));
  });

  it("refuse un jalon inconnu, et ignore le mode tournage sans le dire", async () => {
    const avant = (await statsAdmin(1)).pilotage.jalons;
    expect((await jalon(ipNeuve(), { jalon: "inconnu" })).status).toBe(422);
    expect((await jalon(ipNeuve(), { jalon: "paye", en_plus: 1 })).status).toBe(422);
    expect((await jalon(ipNeuve(), { jalon: "appli", appli: "snapchat" })).status).toBe(422);
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
    /* Une seconde conv importée, sa lecture lancée : elle attend son paiement, sans verdict, mais elle a vu le paywall */
    const auPaywall = await convRattachee(u, "01-a-deux-doigts.txt");
    await attendreLePaiement(auPaywall.id, "verdict");
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
    expect(d((p) => p.tunnel.imports)).toBe(2);
    expect(d((p) => p.tunnel.paywall)).toBe(1);
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
  it("les signes et le fil deux jours, les visites et les jalons (appli par appli aussi) 90 jours, le sel jusqu’au surlendemain", async () => {
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
    await db()
      .insert(schema.jalonsParAppli)
      .values([
        { jour: tresVieux.toISOString().slice(0, 10), empreinte, jalon: "fichier", appli: "instagram", le: tresVieux },
        { jour: aujourdhuiParis().iso, empreinte, jalon: "fichier", appli: "instagram" },
      ]);
    await db().insert(schema.selsDesVisites).values({ jour: "2001-01-01", sel: "x" }).onConflictDoNothing();
    await purger();
    expect(await db().select().from(schema.presences).where(eq(schema.presences.onglet, onglet))).toEqual([]);
    expect(await db().select().from(schema.filDirect).where(eq(schema.filDirect.id, fil!.id))).toEqual([]);
    expect(await db().select().from(schema.visites).where(eq(schema.visites.empreinte, empreinte))).toEqual([]);
    /* Le jalon de plus de 90 jours part, celui du jour reste ; appli par appli aussi */
    expect((await db().select().from(schema.jalons).where(eq(schema.jalons.empreinte, empreinte))).map((l) => l.jour)).toEqual([aujourdhuiParis().iso]);
    expect((await db().select().from(schema.jalonsParAppli).where(eq(schema.jalonsParAppli.empreinte, empreinte))).map((l) => l.jour)).toEqual([aujourdhuiParis().iso]);
    expect(await db().select().from(schema.selsDesVisites).where(eq(schema.selsDesVisites.jour, "2001-01-01"))).toEqual([]);
    /* Le sel du jour reste */
    expect(
      await db()
        .select()
        .from(schema.selsDesVisites)
        .where(and(eq(schema.selsDesVisites.jour, aujourdhuiParis().iso), gte(schema.selsDesVisites.jour, "2001-01-02"))),
    ).toHaveLength(1);
  });

  it("le sel de la veille reste, même le soir du passage à l’heure d’hiver", async () => {
    const jours = ["2026-10-23", "2026-10-24"];
    const restent = async () =>
      (await db().select({ jour: schema.selsDesVisites.jour }).from(schema.selsDesVisites).where(inArray(schema.selsDesVisites.jour, jours))).map((l) => l.jour);
    await db()
      .insert(schema.selsDesVisites)
      .values(jours.map((jour) => ({ jour, sel: "x" })))
      .onConflictDoNothing();
    try {
      /* Le 25 octobre 2026 à 23 h 30 à Paris : il y a 24 h, c’était encore le 25, et le sel du 24 partait avec celui du 23 */
      await purger(new Date("2026-10-25T23:30:00+01:00"));
      expect(await restent()).toEqual(["2026-10-24"]);
    } finally {
      await db().delete(schema.selsDesVisites).where(inArray(schema.selsDesVisites.jour, jours));
    }
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

describe("qui importe (/admin)", () => {
  const p2 = (n: number) => String(n).padStart(2, "0");
  /** Un export WhatsApp (iPhone) inventé de ces échanges, un message toutes les 7 minutes. */
  const exportDe = (echanges: [string, string][]) =>
    echanges
      .map(([qui, texte], k) => {
        const d = new Date(Date.UTC(2026, 9, 1, 18, 0) + k * 7 * 60e3);
        return `[${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00] ${qui}: ${texte}`;
      })
      .join("\n");
  /* Sacha et Nina, sans un accord : la conv ne dit le genre de personne. Léa et Inès se disent au féminin */
  const SANS_ACCORD = Array.from({ length: 60 }, (_, k): [string, string] => [k % 2 ? "Nina" : "Sacha", `message ${k + 1}`]);
  const ENTRE_FILLES: [string, string][] = [
    ["Léa", "coucou ma belle"],
    ["Inès", "je suis rentrée du taff, je suis crevée"],
    ["Léa", "t’es prête pour samedi ?"],
    ["Inès", "désolée j’ai pas répondu hier"],
    ["Léa", "je suis trop contente qu’on y aille"],
    ["Inès", "je me suis endormie direct"],
    ["Inès", "t’es rentrée ?"],
    ["Léa", "je suis sortie avec les filles"],
    ["Léa", "je suis arrivée à l’instant"],
    ...Array.from({ length: 50 }, (_, k): [string, string] => [k % 2 ? "Léa" : "Inès", `message ${k + 1}`]),
  ];
  const importe = (echanges: [string, string][]) => importer({ nom: "WhatsApp Chat.txt", appli: "whatsapp", texte: exportDe(echanges) }, accordDeTest());
  /** Ce qui a bougé entre deux lectures, champ par champ. */
  const ecart = (apres: Genres, avant: Genres) => {
    const moins = <T extends Record<string, number>>(a: T, b: T) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v - b[k]!]));
    return { convs: apres.convs - avant.convs, moi: moins(apres.moi, avant.moi), autre: moins(apres.autre, avant.autre), paires: moins(apres.paires, avant.paires) };
  };

  it("celui qui importe, l’autre et leur paire, puis les convs payées, sans les prises du tournage", async () => {
    const lire = async () => (await statsAdmin(1)).pilotage.quiImporte;
    const avant = await lire();
    const u = await compteDeTest("qui-importe");
    /* Laissée avant « Qui es-tu ? » */
    await convRattachee(u, await importe(SANS_ACCORD));
    /* Une fille, sur quelqu’un que rien ne dit : un garçon, deviné */
    const fille = await convPrete(u, await importe(SANS_ACCORD), { moi: "Sacha", pronom: "elle" });
    /* Deux filles, que la conv dit */
    const filles = await convPrete(u, await importe(ENTRE_FILLES), { moi: "Léa", pronom: "elle" });
    /* Deux garçons, dit sur sa fiche */
    const garcons = await convPrete(u, await importe(SANS_ACCORD), { moi: "Nina", pronom: "il" });
    await definirPronomAutre(garcons.id, "il");
    /*
     * Une prise du tournage, « Qui es-tu ? » rempli et payée : elle ne compte pas. Dans le compte d’une créatrice : une
     * prise dans le compte `u` en ferait une, et ses convs jamais lues sortiraient aussi (comptesDesTests)
     */
    const creatrice = await compteDeTest("qui-importe-creatrice");
    const [prise] = await db()
      .insert(schema.stories)
      .values({ userId: creatrice.id, messageCount: 60, meta: (await ligneEnBase(fille.id)).meta, tournageLe: new Date() })
      .returning({ id: schema.stories.id });

    const achat = (storyId: string, offre: OffreId, plus: Partial<typeof schema.achats.$inferInsert> = {}) =>
      db()
        .insert(schema.achats)
        .values({ userId: u.id, storyId, offre, centimes: 990, bulles: 3, fournisseur: "factice", statut: "paye", payeLe: new Date(), ...plus });
    /* Deux achats sur la conv des deux filles : payée une fois */
    await achat(filles.id, "premium");
    await achat(filles.id, "pack10");
    /* Des bulles payées depuis le chat ne paient pas le rapport, une commande abandonnée non plus */
    await achat(fille.id, "pack10");
    await achat(fille.id, "rapport", { statut: "en_attente", payeLe: null });
    /* Un rapport d’avance utilisé sur la conv des deux garçons, remboursé depuis : elle a été payée */
    await achat(garcons.id, "second", { utiliseLe: new Date(), statut: "rembourse", annuleLe: new Date() });
    await achat(prise!.id, "rapport");

    const apres = await lire();
    expect(ecart(apres.importees, avant.importees)).toEqual({
      convs: 4,
      moi: { elle: 2, il: 1, inconnu: 1 },
      autre: { elle: 1, il: 2, devines: 1 },
      paires: { fille_garcon: 1, garcon_fille: 0, deux_filles: 1, deux_garcons: 1 },
    });
    expect(ecart(apres.payees, avant.payees)).toEqual({
      convs: 2,
      moi: { elle: 1, il: 1, inconnu: 0 },
      autre: { elle: 1, il: 1, devines: 0 },
      paires: { fille_garcon: 0, garcon_fille: 0, deux_filles: 1, deux_garcons: 1 },
    });
  });
});

describe("le haut du paywall dans le pilotage", () => {
  it("un titre compté pour la première fois pendant la période dit depuis quand (« volume », mis en ligne en cours de route) ; avant, rien", async () => {
    const cle = `${HAUT}vu:volume`;
    const aujourdhui = sql`(now() at time zone 'Europe/Paris')::date`;
    /* Seul ce test écrit des jours passés pour ce titre : ceux d’un lancement d’avant interrompu s’effacent d’abord */
    const effacer = () =>
      db()
        .delete(schema.counters)
        .where(and(eq(schema.counters.key, cle), lt(schema.counters.day, aujourdhui)));
    await effacer();
    try {
      const [l] = await db()
        .insert(schema.counters)
        .values({ day: sql`${aujourdhui} - 3`, key: cle, count: 2 })
        .returning({ day: schema.counters.day });
      const volume = async (jours: 1 | 7) => (await statsAdmin(jours)).pilotage.hauts.find((h) => h.genre === "volume")!;
      expect(await volume(7)).toMatchObject({ depuis: l!.day });
      expect((await volume(7)).vus).toBeGreaterThanOrEqual(2);
      /* Sur la dernière journée, le titre était déjà compté avant : pas de « depuis » */
      expect((await volume(1)).depuis).toBeNull();
    } finally {
      await effacer();
    }
  });
});

describe("les convs payées par longueur (/admin)", () => {
  it("par tranche : les ventes et l’offre prise, l’IA médiane d’une lecture payée et les jetons par message des verdicts (le produit seul), leurs nouveaux essais et leurs modèles ; à part, les achats payés plus de 48 h après le paywall et ceux d’une conv effacée", async () => {
    const tranche = (p: Pilotage, t: TrancheDeLongueur) => p.parLongueur.tranches.find((x) => x.tranche === t)!;
    const modele = (p: Pilotage, m: string) => p.parLongueur.modeles.find((x) => x.modele === m) ?? { lignes: 0, convs: 0, dollars: 0 };
    const avant = (await statsAdmin(7)).pilotage;
    expect(avant.parLongueur.tranches.map((x) => x.tranche)).toEqual([...TRANCHES_DE_LONGUEUR]);
    /* Les convs longues ne sont qu’à ce test (celles des autres fichiers sont effacées avec leur compte) */
    for (const t of ["de_3000_a_7000", "7000_et_plus"] as const) expect(tranche(avant, t).convs).toBe(0);
    const u = await compteDeTest("pilotage-longueur");
    const longue = await convRattachee(u, "01-a-deux-doigts.txt");
    const tresLongue = await convRattachee(u, "01-a-deux-doigts.txt");
    const courte = await convRattachee(u, "01-a-deux-doigts.txt");
    const maintenant = new Date();
    const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
    await db().update(schema.stories).set({ messageCount: 4000 }).where(eq(schema.stories.id, longue.id));
    await db().update(schema.stories).set({ messageCount: 8000 }).where(eq(schema.stories.id, tresLongue.id));
    /* Arrivées au paywall (la tâche du verdict posée) : la très longue il y a 3 jours ; la courte n’y est jamais passée (jugée depuis l’import) */
    await attendreLePaiement(longue.id, "verdict");
    await attendreLePaiement(tresLongue.id, "verdict");
    await db()
      .update(schema.tasks)
      .set({ createdAt: ilYa(3) })
      .where(and(eq(schema.tasks.storyId, tresLongue.id), eq(schema.tasks.kind, "verdict")));
    const achat = (offre: OffreId, plus: Partial<typeof schema.achats.$inferInsert> = {}) =>
      db()
        .insert(schema.achats)
        .values({ userId: u.id, offre, centimes: 990, bulles: 3, fournisseur: "factice", statut: "paye", payeLe: maintenant, ...plus });
    /* La longue payée deux fois (deux ventes, une conv) ; la très longue par ①, 3 jours après son paywall ; la courte par ⑤, payé il y a 10 jours et utilisé aujourd’hui */
    await achat("premium", { storyId: longue.id });
    await achat("rapport", { storyId: longue.id, statut: "rembourse", annuleLe: maintenant });
    await achat("suite", { storyId: tresLongue.id });
    await achat("second", { storyId: courte.id, payeLe: ilYa(10), creeLe: ilYa(10), utiliseLe: maintenant });
    /* Une conv effacée depuis ; des bulles (pas une conv) ; un achat d’essai de l’équipe (retiré de toutes les ventes) */
    await achat("rapport");
    await achat("pack25");
    await achat("rapport", { storyId: courte.id, population: "equipe" });
    const ligne = (storyId: string, task: string, micros: number, plus: Partial<typeof schema.aiUsage.$inferInsert> = {}) =>
      ({ storyId, task, model: "claude-opus-5-5", costMicros: micros, population: "client", ...plus }) satisfies typeof schema.aiUsage.$inferInsert;
    await db()
      .insert(schema.aiUsage)
      .values([
        /* Un verdict du montage partagé (le socle et 140 000 jetons de conv écrits en cache), et un essai d’avant, sur un autre modèle : compté, pas mesuré */
        ligne(longue.id, "verdict", 900_000, { inputTokens: 2_000, cacheWriteTokens: 15_300 + 140_000 }),
        ligne(longue.id, "verdict", 1_100_000, { model: "claude-fable-5-1", inputTokens: 160_000, createdAt: new Date("2026-10-20T10:00:00Z") }),
        ligne(longue.id, "rapport_plan", 300_000),
        ligne(longue.id, "rapport_chapitres", 400_000),
        ligne(longue.id, "memoire", 200_000),
        ligne(longue.id, "vocal", 50_000),
        /* Pas de la lecture : la voix (son étiquette est aussi celle des vocaux du chat), le chat ; ni un appel d’un test */
        ligne(longue.id, "vocal_voix", 90_000),
        ligne(longue.id, "chat", 120_000),
        ligne(longue.id, "verdict", 5_000_000, { population: "equipe" }),
        /* Le socle lu dans le cache d’un autre verdict : il compte aussi, puis se retire */
        ligne(tresLongue.id, "verdict", 2_500_000, { inputTokens: 1_000, cacheReadTokens: 15_300, cacheWriteTokens: 160_000 }),
        ligne(courte.id, "verdict", 400_000),
      ]);
    try {
      const apres = (await statsAdmin(7)).pilotage;
      expect(tranche(apres, "de_3000_a_7000")).toEqual({
        tranche: "de_3000_a_7000",
        ventes: 2,
        offres: { rapport: 1, premium: 1, suite: 0, second: 0, rapport_garde: 0, autre: 0 },
        convs: 1,
        lues: 1,
        /* 0,9 + 1,1 (le verdict et son essai) + 0,3 + 0,4 (le rapport) + 0,2 (la mémoire) + 0,05 (le vocal) */
        dollarsMedian: 2.95,
        verdicts: 2,
        plusieursVerdicts: 1,
        /* (2 000 + 155 300 − 15 300) ÷ 4 000 */
        jetonsParMessage: 35.5,
        verdictsMesures: 1,
      });
      expect(tranche(apres, "7000_et_plus")).toMatchObject({
        ventes: 1,
        offres: { suite: 1 },
        convs: 1,
        dollarsMedian: 2.5,
        verdicts: 1,
        plusieursVerdicts: 0,
        jetonsParMessage: 20.125,
      });
      const d = (f: (p: Pilotage) => number) => f(apres) - f(avant);
      expect([d((p) => tranche(p, "moins_de_1000").ventes), d((p) => tranche(p, "moins_de_1000").offres.second), d((p) => tranche(p, "moins_de_1000").lues)]).toEqual([1, 1, 1]);
      expect(d((p) => p.parLongueur.effacees)).toBe(1);
      expect([d((p) => p.parLongueur.tard.payes), d((p) => p.parLongueur.tard.plusDe48h), d((p) => p.parLongueur.tard.sansPaywall)]).toEqual([4, 1, 1]);
      expect([d((p) => modele(p, "claude-opus-5-5").lignes), d((p) => modele(p, "claude-opus-5-5").convs), d((p) => modele(p, "claude-fable-5-1").lignes)]).toEqual([3, 3, 1]);
      /* Les plus chers : la très longue, puis la longue et son essai ; jamais l’appel d’un test */
      expect(apres.parLongueur.chers.slice(0, 2)).toEqual([
        { dollars: 2.5, lignes: 1, modeles: ["claude-opus-5-5"], messages: 8000 },
        { dollars: 2, lignes: 2, modeles: ["claude-fable-5-1", "claude-opus-5-5"], messages: 4000 },
      ]);
    } finally {
      await db()
        .delete(schema.aiUsage)
        .where(inArray(schema.aiUsage.storyId, [longue.id, tresLongue.id, courte.id]));
      await db().delete(schema.achats).where(eq(schema.achats.userId, u.id));
    }
  });

  it("les images en trois postes : les captures (« 01 », l’étiquette d’avant, comprise), les lots d’une vidéo, et la suite lue après le paiement", async () => {
    const poste = (s: Awaited<ReturnType<typeof statsAdmin>>, nom: string) => s.couts.postes.find((p) => p.nom === nom)?.produit.appels ?? 0;
    const avant = await statsAdmin(1);
    const ids = (
      await db()
        .insert(schema.aiUsage)
        .values(
          (["captures", "01", "captures_video", "captures_video", "captures_suite"] as const).map((task) => ({
            task,
            model: "claude-opus-5-5",
            costMicros: 1_000,
            population: "prospect" as const,
          })),
        )
        .returning({ id: schema.aiUsage.id })
    ).map((l) => l.id);
    try {
      const apres = await statsAdmin(1);
      expect(["Captures", "Vidéo", "Vidéo (la suite)", "Autres"].map((nom) => poste(apres, nom) - poste(avant, nom))).toEqual([2, 2, 1, 0]);
    } finally {
      await db().delete(schema.aiUsage).where(inArray(schema.aiUsage.id, ids));
    }
  });

  it("les compteurs du suivi se comparent à ce qui se compte les mêmes jours de Paris : juste avant minuit, une mise à jour en lot ou un import de vidéo sort du jour, comme le compteur", async () => {
    const suivi = async () => (await statsAdmin(1)).pilotage.compteurs;
    /* Une seconde avant minuit à Paris (dans les 24 dernières heures, sauf dans la dernière seconde du jour), puis maintenant */
    const veille = sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') - interval '1 second'`;
    const avant = await suivi();
    const envois = [randomUUID(), randomUUID()];
    const ids = (
      await db()
        .insert(schema.aiUsage)
        .values([veille, sql`now()`].map((quand) => ({ task: "memoire_maj_lot", model: "claude-opus-5-5", costMicros: 1_000, population: "client" as const, createdAt: quand })))
        .returning({ id: schema.aiUsage.id })
    ).map((l) => l.id);
    await db()
      .insert(schema.imports)
      .values(envois.map((envoi, k) => ({ envoi, type: "video" as const, appli: "imessage" as const, ecrans: 12, lots: 1, creeLe: k ? sql`now()` : veille })));
    try {
      const apres = await suivi();
      expect([apres.majEnLot - avant.majEnLot, apres.videosImportees - avant.videosImportees]).toEqual([1, 1]);
    } finally {
      await db().delete(schema.aiUsage).where(inArray(schema.aiUsage.id, ids));
      await db().delete(schema.imports).where(inArray(schema.imports.envoi, envois));
    }
  });
});
