import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inscrire, lienRetrait, retirer } from "@/server/attente";
import { preparerCode, prendreCode } from "@/server/auth";
import { empreinte, jeton } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { mailAttente } from "@/server/mail-attente";

const email = `curieux-${Date.now()}@exemple.fr`;
const hash = empreinte(`attente:${email}`);
/* Le plafond des mails de la liste, pour tous et par jour : la base des tests le garde d’un lancement à l’autre */
const mailsDuJour = empreinte("limite:attente:mails");
beforeAll(async () => {
  await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, mailsDuJour));
});
afterAll(async () => {
  await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, hash));
  await db().delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
});

describe("la bêta fermée, sans dire qui est invité", () => {
  it("un email hors de la bêta n’a jamais de code qui marche : la vérification répond comme un mauvais code, sans créer de compte", async () => {
    const navigateur = jeton();
    /* Sans demande, puis avec la ligne d’une demande (posée pour tous : les essais y comptent comme chez un invité) */
    expect(await prendreCode(email, "123456", navigateur)).toBe("faux");
    const code = await preparerCode(email, navigateur, { envoye: false });
    expect(code).toMatch(/^\d{6}$/);
    expect(await prendreCode(email, code!, navigateur)).toBe("faux");
    const [ligne] = await db().select().from(schema.loginCodes).where(eq(schema.loginCodes.email, email));
    expect(ligne.attempts).toBe(1);
    expect(await db().select().from(schema.users).where(eq(schema.users.email, email))).toHaveLength(0);
  });

  it("le mail de la liste : de quoi se retirer, et la conv qui n’a pas été gardée ; celui d’un invité : sa place est prête", () => {
    const retrait = "https://www.askblush.com/attente/retirer?id=abc&cle=xyz";
    const liste = mailAttente({ base: "https://www.askblush.com", place: "liste", retrait, convEffacee: true });
    expect(liste.sujet).toBe("Tu es sur la liste de BLUSH");
    expect(liste.html).toContain('href="https://www.askblush.com/attente/retirer?id=abc&amp;cle=xyz"');
    expect(liste.texte).toContain(retrait);
    expect(liste.texte).toContain("n’a pas été gardée");
    const prete = mailAttente({ base: "https://www.askblush.com", place: "prete", retrait });
    expect(prete.sujet).toBe("Ta place BLUSH est prête");
    expect(prete.html).not.toContain("retirer");
    expect(prete.html + liste.html).not.toContain("undefined");
  });

  it("chaque inscription écrit à l’email (trois mails par jour au plus), et on ne s’en retire qu’avec le lien de son mail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (let k = 0; k < 4; k++) await inscrire(email, "accueil");
    expect(log.mock.calls.flat().filter((l) => String(l).includes(`pour ${email}`))).toHaveLength(3);
    log.mockRestore();
    const lien = new URL(lienRetrait(hash));
    expect(await retirer(lien.searchParams.get("id")!, "pas-la-bonne-cle")).toBe(false);
    expect(await db().select().from(schema.waitlist).where(eq(schema.waitlist.emailHash, hash))).toHaveLength(1);
    expect(await retirer(lien.searchParams.get("id")!, lien.searchParams.get("cle")!)).toBe(true);
    expect(await db().select().from(schema.waitlist).where(eq(schema.waitlist.emailHash, hash))).toHaveLength(0);
  });

  it("au-delà de cinquante mails de la liste dans la journée, pour tous : on inscrit encore, sans écrire", async () => {
    const autre = `curieux-plafond-${Date.now()}@exemple.fr`;
    await db()
      .insert(schema.rateLimits)
      .values({ key: mailsDuJour, windowStart: new Date(), count: 50 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 50, windowStart: new Date() } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await inscrire(autre, "accueil");
      expect(log.mock.calls.flat().filter((l) => String(l).includes(`pour ${autre}`))).toHaveLength(0);
      expect(await db().select().from(schema.waitlist).where(eq(schema.waitlist.emailHash, empreinte(`attente:${autre}`)))).toHaveLength(1);
    } finally {
      log.mockRestore();
      await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, mailsDuJour));
      await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, empreinte(`attente:${autre}`)));
    }
  });
});
