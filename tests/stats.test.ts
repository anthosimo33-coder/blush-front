import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executerChaine } from "@/server/analyse";
import { CLES, compter, estUnRobot } from "@/server/compteurs";
import { db, schema } from "@/server/db";
import { definirQui, depuisFichier, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { mailRapport } from "@/server/mail-rapport";
import { statsAdmin } from "@/server/stats";
import { planifier } from "@/server/taches";

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
  it("ne contient rien de la conv, et reste sobre en mode sobre", () => {
    const m = mailRapport({ base: "https://www.askblush.com", lien: "https://www.askblush.com/ouvrir/abc", chapitres: 8, lecture: "9 min", autre: "elle", sobre: false });
    expect(m.html).toContain("https://www.askblush.com/ouvrir/abc");
    expect(m.html).toContain(">Elle<");
    expect(m.texte).toContain("8 chapitres, 9 min de lecture");
    const s = mailRapport({ base: "https://www.askblush.com", lien: "x", chapitres: 0, lecture: "2 min", autre: "il", sobre: true });
    expect(s.html).not.toContain("tendre");
    expect(s.sujet).not.toContain("📖");
  });

  const email = `mail-rapport-${Date.now()}@blush.test`;
  beforeAll(() => definirFactice(fournisseurFactice));
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.email, email));
    definirFactice(null);
  });

  it("part une seule fois, quand le rapport complet est écrit", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })));
    const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
    await rattacherBrouillon(u, imp.secret);
    await definirQui(imp.id, { moi: imp.meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(imp.id, "verdict");
    await executerChaine(imp.id);
    const mails = () => log.mock.calls.filter(([l]) => String(l).startsWith("[dev] mail") && String(l).includes(email));
    expect(mails().map(([l]) => l)).toEqual([`[dev] mail « 📖 Ton rapport BLUSH est prêt » pour ${email}`]);
    /* Une relance de l’écriture ne renvoie pas le mail */
    await planifier(imp.id, "rapport_chapitres");
    await executerChaine(imp.id);
    expect(mails()).toHaveLength(1);
    log.mockRestore();
  }, 60_000);
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
