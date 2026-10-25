import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { executerChaine } from "@/server/pipeline";
import { CLES, compter, estUnRobot } from "@/server/compteurs";
import { db, schema } from "@/server/db";
import { definirQui } from "@/server/histoires";
import { mailRapport } from "@/server/mail-rapport";
import { statsAdmin } from "@/server/stats";
import { planifier } from "@/server/taches";
import { definirPause } from "@/server/temps";
import { compteDeTest, convRattachee, moiDans } from "./aide/fixtures";

describe("les robots d’aperçu ne sont pas des visites", () => {
  it("reconnaît WhatsApp, iMessage et Slack, pas un iPhone", () => {
    expect(estUnRobot("WhatsApp/2.23.20.0")).toBe(true);
    expect(estUnRobot("Mozilla/5.0 (Macintosh) AppleWebKit/601.2.4 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0")).toBe(true);
    expect(estUnRobot("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(estUnRobot(null)).toBe(true);
    expect(estUnRobot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

describe("le mail « ton rapport est prêt »", () => {
  it("leurs prénoms dans le corps seulement (ni le sujet, ni l’aperçu, ni le texte brut), et sobre en mode sobre", () => {
    const personnes = { moi: { prenom: "Hugo", elle: false }, autre: { prenom: "Maëlys", il: false } };
    const m = mailRapport({
      base: "https://www.askblush.com",
      lien: "https://www.askblush.com/ouvrir/abc",
      chapitres: 8,
      lecture: "9 min",
      personnes,
      premium: false,
      sobre: false,
    });
    expect(m.html).toContain("https://www.askblush.com/ouvrir/abc");
    /* Sa bulle, le titre et son chapitre au sommaire ; son prénom à lui dans la première bulle */
    expect(m.html.match(/Maëlys/g)).toHaveLength(3);
    expect(m.html).toContain(">Maëlys</td>");
    expect(m.html).toContain("Hugo, j’ai fini");
    expect(`${m.sujet}\n${m.texte}`).not.toMatch(/Maëlys|Hugo/);
    expect(m.texte).toContain("8 chapitres, 9 min de lecture");
    /* Ce qu’il a pris : le rapport (3 réponses), ou Premium (25, dont les 3 du rapport offertes) */
    expect(m.html).toContain("Et 3 réponses de BLUSH d’avance<");
    const premium = mailRapport({ base: "x", lien: "x", chapitres: 8, lecture: "9 min", personnes, premium: true, sobre: false });
    expect(premium.html).toContain("Et 25 réponses de BLUSH d’avance, dont 3 offertes");
    expect(premium.html).toContain("message après message");
    const s = mailRapport({ base: "https://www.askblush.com", lien: "x", chapitres: 0, lecture: "2 min", personnes, premium: false, sobre: true });
    expect(s.html).not.toContain("tendre");
    expect(s.html).not.toMatch(/Maëlys|Hugo|réponses de BLUSH/);
    expect(s.sujet).not.toContain("📖");
  });

  it("part une seule fois, quand le rapport complet est écrit : une relance réussie de l’écriture ne le renvoie pas", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const u = await compteDeTest("mail-rapport", "debloque");
    const imp = await convRattachee(u, "01-a-deux-doigts.txt");
    await definirQui(imp.id, { moi: moiDans(imp.meta, "Hugo"), pronom: "il", devinette: "vus", objectif: "ensemble" });
    /* Chaque essai raté de la chaîne fait une pause avant le suivant : on les compte, le temps du test */
    const pauses: number[] = [];
    definirPause(async (ms) => void pauses.push(ms));
    try {
      /* La conv brute telle qu’en base : la mémoire l’efface en fin de chaîne, et une relance de l’écriture la relit */
      const { conv } = (await db().select({ conv: schema.stories.conv }).from(schema.stories).where(eq(schema.stories.id, imp.id)))[0]!;
      await planifier(imp.id, "verdict");
      await executerChaine(imp.id);
      const mails = () => log.mock.calls.filter(([l]) => String(l).startsWith("[dev] mail") && String(l).includes(u.email));
      expect(mails().map(([l]) => l)).toEqual([`[dev] mail « 📖 ton rapport est prêt. j’ai pas été tendre » pour ${u.email}`]);

      /* L’écriture relancée, la conv encore là : elle réécrit le rapport (sans échec, sans pause), et le mail ne repart pas */
      await db().update(schema.stories).set({ conv, convPurgedAt: null }).where(eq(schema.stories.id, imp.id));
      await planifier(imp.id, "rapport_chapitres");
      await executerChaine(imp.id);
      const ecritures = await db()
        .select({ status: schema.tasks.status, error: schema.tasks.error })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, imp.id), eq(schema.tasks.kind, "rapport_chapitres")))
        .orderBy(asc(schema.tasks.createdAt));
      expect(ecritures).toEqual([
        { status: "fini", error: null },
        { status: "fini", error: null },
      ]);
      expect(pauses).toEqual([]);
      expect(mails()).toHaveLength(1);
    } finally {
      definirPause(null);
    }
  });
});

describe("le tableau de bord", () => {
  it("compte les visites d’un lien partagé, et rend toutes les rubriques", async () => {
    const avant = (await statsAdmin(7)).partage.visites;
    await compter(CLES.lienVu);
    await compter(CLES.lienVu);
    const s = await statsAdmin(7);
    expect(s.partage.visites).toBe(avant + 2);
    expect(s.activite).toHaveLength(14);
    expect((await statsAdmin(30)).activite).toHaveLength(30);
    expect(s.parcours.importees).toBeGreaterThanOrEqual(s.parcours.compte);
    expect(Object.keys(s.cles)).toEqual(["comptes", "convs", "verdicts", "rapports", "messages", "actifs"]);
    expect(typeof s.couts.total).toBe("number");
  });

  it("l’activité par jour de Paris : les imports, les verdicts et les rapports du jour et de la veille, sans les prises du tournage", async () => {
    const u = await compteDeTest("stats-activite");
    const jour = (a: Awaited<ReturnType<typeof statsAdmin>>["activite"], k: number) => a.at(k)!;
    const avant = (await statsAdmin(7)).activite;
    /* Aujourd’hui : une conv lue (son verdict, son rapport) ; hier, à midi de Paris : une conv importée, rien d’autre */
    const lue = await convRattachee(u, "01-a-deux-doigts.txt");
    const meta = (await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, lue.id)))[0]!.meta;
    await db().insert(schema.verdicts).values({ storyId: lue.id, data: meta });
    await db().insert(schema.reports).values({ storyId: lue.id, data: meta });
    const hier = await convRattachee(u, "02-reciproque.txt");
    const midiHier = new Date(Date.now() - 86400e3);
    await db().update(schema.stories).set({ createdAt: midiHier }).where(eq(schema.stories.id, hier.id));
    /* Une prise du tournage, aujourd’hui, avec son verdict : elle ne compte pas */
    const [prise] = await db().insert(schema.stories).values({ userId: u.id, messageCount: 1, meta, tournageLe: new Date() }).returning({ id: schema.stories.id });
    await db().insert(schema.verdicts).values({ storyId: prise!.id, data: meta });
    const apres = (await statsAdmin(7)).activite;
    expect(apres.map((j) => j.jour)).toEqual(avant.map((j) => j.jour));
    const d = (k: number) => ({
      imports: jour(apres, k).imports - jour(avant, k).imports,
      verdicts: jour(apres, k).verdicts - jour(avant, k).verdicts,
      rapports: jour(apres, k).rapports - jour(avant, k).rapports,
    });
    expect(d(-1)).toEqual({ imports: 1, verdicts: 1, rapports: 1 });
    expect(d(-2)).toEqual({ imports: 1, verdicts: 0, rapports: 0 });
  });
});
