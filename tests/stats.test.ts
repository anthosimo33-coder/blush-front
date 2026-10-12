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
  it("son prénom au sommaire seulement (ni le sujet, ni l’aperçu, ni le texte brut), et sobre en mode sobre", () => {
    const m = mailRapport({ base: "https://www.askblush.com", lien: "https://www.askblush.com/ouvrir/abc", chapitres: 8, lecture: "9 min", autre: "Maëlys", sobre: false });
    expect(m.html).toContain("https://www.askblush.com/ouvrir/abc");
    expect(m.html.match(/Maëlys/g)).toEqual(["Maëlys"]);
    expect(m.html).toContain(">Maëlys</td>");
    expect(`${m.sujet}\n${m.texte}`).not.toContain("Maëlys");
    expect(m.texte).toContain("8 chapitres, 9 min de lecture");
    const s = mailRapport({ base: "https://www.askblush.com", lien: "x", chapitres: 0, lecture: "2 min", autre: "Maëlys", sobre: true });
    expect(s.html).not.toContain("tendre");
    expect(s.html).not.toContain("Maëlys");
    expect(s.sujet).not.toContain("📖");
  });

  it("part une seule fois, quand le rapport complet est écrit : une relance réussie de l’écriture ne le renvoie pas", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const u = await compteDeTest("mail-rapport", "blushplus");
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
      expect(mails().map(([l]) => l)).toEqual([`[dev] mail « 📖 Ton rapport BLUSH est prêt » pour ${u.email}`]);

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
});
